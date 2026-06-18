"""
OuluScout FastAPI application entry point.

Endpoints:
  GET  /health            – liveness check
  GET  /api/geocode?q=… – Nominatim geocoding bounded to Oulu
  POST /api/analyze      – full location analysis
"""

import asyncio
import sys
from typing import Any, Dict, List

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    CafeResult,
    IsochroneResult,
    PedestrianResult,
    PopulationResult,
    ScoreBreakdown,
    TrafficResult,
    TransitResult,
)
from app.modules.cafes import get_cafes
from app.modules.isochrones import get_isochrones
from app.modules.pedestrians import get_pedestrians
from app.modules.population import get_population
from app.modules.traffic import get_traffic
from app.modules.transit import get_transit
from app.scoring import DEFAULT_WEIGHTS, calculate_score

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="OuluScout API",
    description="Location analysis tool for the Oulu region",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "OuluScout/1.0 (sisu.j.torro@gmail.com)"}


@app.get("/api/geocode")
async def geocode(q: str = Query(..., min_length=1)) -> List[Dict[str, Any]]:
    """
    Forward geocoding via Nominatim, bounded to the Oulu area.

    Returns a list of up to 5 results with lat, lon and display_name.
    """
    bbox = settings.OULU_BBOX
    params = {
        "q": q,
        "format": "json",
        "limit": 5,
        "bounded": 1,
        "viewbox": (
            f"{bbox['min_lon']},{bbox['min_lat']},"
            f"{bbox['max_lon']},{bbox['max_lat']}"
        ),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(NOMINATIM_URL, params=params, headers=NOMINATIM_HEADERS)
            resp.raise_for_status()
            raw = resp.json()
    except Exception as exc:
        print(f"[geocode] Nominatim error: {exc}", file=sys.stderr)
        raise HTTPException(status_code=502, detail="Geocoding service unavailable.")

    results: List[Dict[str, Any]] = []
    for item in raw:
        try:
            results.append(
                {
                    "lat": float(item["lat"]),
                    "lon": float(item["lon"]),
                    "display_name": item.get("display_name", ""),
                }
            )
        except (KeyError, ValueError):
            continue

    return results


# ---------------------------------------------------------------------------
# Main analysis endpoint
# ---------------------------------------------------------------------------


def _safe_isochrone_result(raw: Any) -> IsochroneResult:
    if not isinstance(raw, dict):
        return IsochroneResult()
    # Convert any string keys to ints for the minutes sub-dict
    polygons: Dict[str, Dict[int, Any]] = {}
    for profile, time_map in raw.items():
        if isinstance(time_map, dict):
            polygons[profile] = {int(k): v for k, v in time_map.items()}
        else:
            polygons[profile] = {}
    return IsochroneResult(polygons=polygons)


def _safe_cafe_result(raw: Any) -> CafeResult:
    if not isinstance(raw, dict):
        return CafeResult()
    return CafeResult(
        count_500m=raw.get("count_500m", 0) or 0,
        count_1km=raw.get("count_1km", 0) or 0,
        count_isochrone=raw.get("count_isochrone", 0) or 0,
        cafes=raw.get("cafes", []) or [],
        nearest_m=float(raw.get("nearest_m", 0.0) or 0.0),
        note=raw.get("note") or "",
    )


def _safe_population_result(raw: Any) -> PopulationResult:
    if not isinstance(raw, dict):
        return PopulationResult(data_source="error")
    return PopulationResult(
        total_population=raw.get("total_population", 0) or 0,
        age_0_14=raw.get("age_0_14", 0.0) or 0.0,
        age_15_24=raw.get("age_15_24", 0.0) or 0.0,
        age_25_64=raw.get("age_25_64", 0.0) or 0.0,
        age_65_plus=raw.get("age_65_plus", 0.0) or 0.0,
        median_income=raw.get("median_income"),
        jobs_count=raw.get("jobs_count", 0) or 0,
        data_source=raw.get("data_source", "") or "",
    )


def _safe_traffic_result(raw: Any) -> TrafficResult:
    if not isinstance(raw, dict):
        return TrafficResult(note="Module error.")
    return TrafficResult(
        nearest_count=raw.get("nearest_count"),
        station_name=raw.get("station_name"),
        distance_m=raw.get("distance_m"),
        kvl_value=raw.get("kvl_value"),
        note=raw.get("note") or "",
    )


def _safe_pedestrian_result(raw: Any) -> PedestrianResult:
    if not isinstance(raw, dict):
        return PedestrianResult(note="Module error.")
    return PedestrianResult(
        nearest_count=raw.get("nearest_count"),
        station_name=raw.get("station_name"),
        distance_m=raw.get("distance_m"),
        typical_daily=raw.get("typical_daily"),
        note=raw.get("note") or "",
    )


def _safe_transit_result(raw: Any) -> TransitResult:
    if not isinstance(raw, dict):
        return TransitResult(note="Module error.")
    return TransitResult(
        nearest_stop=raw.get("nearest_stop"),
        distance_m=raw.get("distance_m"),
        routes=raw.get("routes", []) or [],
        note=raw.get("note", "") or "",
    )


async def _run_module(coro, default):
    """Run a coroutine and return its result, or ``default`` on any exception."""
    try:
        return await coro
    except Exception as exc:
        print(f"[analyze] Module error: {exc}", file=sys.stderr)
        return default


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    lat, lon = req.lat, req.lon

    # Merge user weights with defaults
    weights = {**DEFAULT_WEIGHTS, **(req.weights or {})}

    # Resolve isochrone polygon for downstream modules (foot-walking 15 min)
    # We need isochrones first to pass the polygon to population/cafes.
    # Run isochrones alone, then the rest in parallel.
    iso_raw = await _run_module(
        get_isochrones(lat, lon, settings.ORS_API_KEY),
        {},
    )
    iso_polygon = None
    if isinstance(iso_raw, dict):
        fw = iso_raw.get("foot-walking", {})
        iso_polygon = fw.get(15) or fw.get("15")

    # Run all remaining modules concurrently
    (
        cafes_raw,
        population_raw,
        traffic_raw,
        pedestrians_raw,
        transit_raw,
    ) = await asyncio.gather(
        _run_module(get_cafes(lat, lon, iso_polygon), {}),
        _run_module(get_population(lat, lon, iso_polygon), {}),
        _run_module(get_traffic(lat, lon), {}),
        _run_module(get_pedestrians(lat, lon), {}),
        _run_module(get_transit(lat, lon), {}),
    )

    # Build typed result objects
    iso_result = _safe_isochrone_result(iso_raw)
    cafe_result = _safe_cafe_result(cafes_raw)
    pop_result = _safe_population_result(population_raw)
    traffic_result = _safe_traffic_result(traffic_raw)
    ped_result = _safe_pedestrian_result(pedestrians_raw)
    transit_result = _safe_transit_result(transit_raw)

    # Score
    score: ScoreBreakdown = calculate_score(
        traffic=traffic_raw if isinstance(traffic_raw, dict) else {},
        population=population_raw if isinstance(population_raw, dict) else {},
        cafes=cafes_raw if isinstance(cafes_raw, dict) else {},
        transit=transit_raw if isinstance(transit_raw, dict) else {},
        pedestrians=pedestrians_raw if isinstance(pedestrians_raw, dict) else {},
        weights=weights,
    )

    return AnalyzeResponse(
        lat=lat,
        lon=lon,
        isochrones=iso_result,
        cafes=cafe_result,
        population=pop_result,
        traffic=traffic_result,
        pedestrians=ped_result,
        transit=transit_result,
        score=score,
    )
