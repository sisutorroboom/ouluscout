"""
Population and socioeconomic data from Statistics Finland WFS.

Two datasets:
  - vaestoruutu:vaki2022_1km  – 1 km population grid (EPSG:3067)
  - postialue:pno_tilasto_2022 – Paavo postal code statistics (EPSG:3067)

All geometries are converted from EPSG:3067 to WGS84 before spatial operations.
"""

import sys
import math
from typing import Any, Dict, List, Optional

import httpx
from shapely.geometry import shape, Point, Polygon, MultiPolygon
from shapely.ops import transform
from pyproj import Transformer

# EPSG:3067 → WGS84 transformer (always_xy ensures lon/lat output order)
_transformer_3067_to_4326 = Transformer.from_crs("EPSG:3067", "EPSG:4326", always_xy=True)

VAESTORUUTU_WFS = "https://geo.stat.fi/geoserver/vaestoruutu/wfs"
PAAVO_WFS = "https://geo.stat.fi/geoserver/postialue/wfs"

# National age-group averages (used when per-grid data unavailable)
AGE_0_14 = 0.15
AGE_15_24 = 0.12
AGE_25_64 = 0.56
AGE_65_PLUS = 0.17


def _to_wgs84(geom):
    """Transform a Shapely geometry from EPSG:3067 to WGS84 (lon/lat)."""
    return transform(_transformer_3067_to_4326.transform, geom)


def _build_isochrone_shape(isochrone_polygon: Any) -> Optional[Polygon]:
    """
    Convert raw GeoJSON coordinates (list of rings, WGS84) to a Shapely Polygon.
    Returns None on failure.
    """
    if not isochrone_polygon:
        return None
    try:
        geojson = {"type": "Polygon", "coordinates": isochrone_polygon}
        return shape(geojson)
    except Exception as exc:
        print(f"[population] Could not build isochrone shape: {exc}", file=sys.stderr)
        return None


def _bbox_from_point_deg(lat: float, lon: float, radius_km: float = 20.0) -> str:
    """Return a WGS84 BBOX string suitable for WFS requests."""
    deg_lat = radius_km / 111.0
    # Longitude degrees per km shrink with cos(lat)
    cos_lat = math.cos(math.radians(lat))
    deg_lon = radius_km / (111.0 * cos_lat) if cos_lat > 1e-6 else radius_km / 111.0
    min_lon = lon - deg_lon
    max_lon = lon + deg_lon
    min_lat = lat - deg_lat
    max_lat = lat + deg_lat
    return f"{min_lon},{min_lat},{max_lon},{max_lat},EPSG:4326"


async def _fetch_wfs(client: httpx.AsyncClient, base_url: str, params: Dict) -> Optional[Dict]:
    try:
        resp = await client.get(base_url, params=params)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        print(f"[population] WFS request to {base_url} failed: {exc}", file=sys.stderr)
        return None


async def get_population(
    lat: float,
    lon: float,
    isochrone_polygon: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Returns::

        {
            "total_population": int,
            "age_0_14": float,       # percentage
            "age_15_24": float,
            "age_25_64": float,
            "age_65_plus": float,
            "median_income": float | None,
            "jobs_count": int,
            "data_source": str,
        }
    """
    iso_shape = _build_isochrone_shape(isochrone_polygon)
    query_point = Point(lon, lat)

    total_population = 0
    data_source_parts: List[str] = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        # ------------------------------------------------------------------
        # 1. Population grid (vaestoruutu 1 km)
        # ------------------------------------------------------------------
        bbox = _bbox_from_point_deg(lat, lon, radius_km=20.0)
        grid_params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeName": "vaestoruutu:vaki2022_1km",
            "outputFormat": "application/json",
            "srsName": "EPSG:3067",
            "bbox": bbox,
        }
        grid_data = await _fetch_wfs(client, VAESTORUUTU_WFS, grid_params)

        if grid_data and grid_data.get("features"):
            data_source_parts.append("vaestoruutu:vaki2022_1km")
            for feature in grid_data["features"]:
                try:
                    geom_3067 = shape(feature["geometry"])
                    geom_wgs84 = _to_wgs84(geom_3067)
                    props = feature.get("properties", {})
                    pop = int(props.get("vaesto", props.get("he_vakiy", 0)) or 0)
                    if pop <= 0:
                        continue

                    if iso_shape is not None:
                        if not geom_wgs84.intersects(iso_shape):
                            continue
                        intersection = geom_wgs84.intersection(iso_shape)
                        cell_area = geom_wgs84.area
                        if cell_area > 0:
                            ratio = intersection.area / cell_area
                        else:
                            ratio = 0.0
                        total_population += int(pop * ratio)
                    else:
                        # Fallback: count all cells within 5 km radius
                        if geom_wgs84.distance(query_point) < 0.045:  # ~5 km in degrees
                            total_population += pop
                except Exception as exc:
                    print(f"[population] Grid cell processing error: {exc}", file=sys.stderr)

        # ------------------------------------------------------------------
        # 2. Paavo postal code statistics (income + jobs)
        # ------------------------------------------------------------------
        paavo_params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeName": "postialue:pno_tilasto_2022",
            "outputFormat": "application/json",
            "srsName": "EPSG:3067",
            "bbox": bbox,
        }
        paavo_data = await _fetch_wfs(client, PAAVO_WFS, paavo_params)

        median_income: Optional[float] = None
        jobs_count = 0
        postal_code: Optional[str] = None
        area_name: Optional[str] = None
        avg_rent_m2: Optional[float] = None

        if paavo_data and paavo_data.get("features"):
            data_source_parts.append("postialue:pno_tilasto_2022")
            # Find the postal code area that contains the query point, or the nearest one
            best_feature = None
            best_dist = float("inf")
            for feature in paavo_data["features"]:
                try:
                    geom_3067 = shape(feature["geometry"])
                    geom_wgs84 = _to_wgs84(geom_3067)
                    if geom_wgs84.contains(query_point):
                        best_feature = feature
                        best_dist = 0.0
                        break
                    dist = geom_wgs84.distance(query_point)
                    if dist < best_dist:
                        best_dist = dist
                        best_feature = feature
                except Exception:
                    continue

            if best_feature is not None:
                props = best_feature.get("properties", {})
                raw_income = props.get("hr_mtu")
                if raw_income is not None:
                    try:
                        median_income = float(raw_income)
                    except (ValueError, TypeError):
                        pass
                raw_jobs = props.get("tp_tyopy")
                if raw_jobs is not None:
                    try:
                        jobs_count = int(raw_jobs)
                    except (ValueError, TypeError):
                        pass

                postal_code = str(props.get("postinro") or props.get("pno") or "") or None
                area_name = str(props.get("nimi") or "") or None

                # Estimate commercial rent per m² from income (Oulu calibrated)
                if median_income is not None:
                    base = 15.0  # Oulu base commercial rent €/m²
                    income_adj = (median_income - 22_000) / 1_000 * 0.6
                    avg_rent_m2 = round(max(10.0, min(35.0, base + income_adj)), 1)

    return {
        "total_population": total_population,
        "age_0_14": AGE_0_14,
        "age_15_24": AGE_15_24,
        "age_25_64": AGE_25_64,
        "age_65_plus": AGE_65_PLUS,
        "median_income": median_income,
        "jobs_count": jobs_count,
        "data_source": ", ".join(data_source_parts) if data_source_parts else "unavailable",
        "postal_code": postal_code,
        "area_name": area_name,
        "avg_rent_m2": avg_rent_m2,
    }
