"""
Cafe discovery via Nominatim OSM search API.

Searches for competing cafe-type businesses near a location:
  - amenity=cafe         (standard OSM cafes)
  - amenity=bakery       (Finnish kahvila-bakeries serve coffee at tables)
  - amenity=fast_food    with coffee-chain keywords in the name
"""

import sys
import math
import asyncio
from typing import Any, Dict, List, Optional, Tuple

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "OuluScout/1.0 (sisu.j.torro@gmail.com)"}

_COFFEE_CHAIN_KEYWORDS = (
    "robert", "coffee house", "espresso house", "wayne",
    "starbucks", "barista", "fazer", "aino", "picnic",
)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _point_in_polygon(lon: float, lat: float, ring: List[List[float]]) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _in_isochrone(lon: float, lat: float, isochrone_polygon: Any) -> bool:
    if not isochrone_polygon:
        return False
    try:
        outer_ring = isochrone_polygon[0]
        if not _point_in_polygon(lon, lat, outer_ring):
            return False
        for hole in isochrone_polygon[1:]:
            if _point_in_polygon(lon, lat, hole):
                return False
        return True
    except Exception:
        return False


def _viewbox(lat: float, lon: float, radius_km: float = 1.2) -> str:
    """Return Nominatim viewbox string (left,top,right,bottom = minlon,maxlat,maxlon,minlat)."""
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * math.cos(math.radians(lat))) if abs(lat) < 89 else dlat
    return f"{lon - dlon},{lat + dlat},{lon + dlon},{lat - dlat}"


async def _fetch_nominatim(
    client: httpx.AsyncClient,
    amenity: str,
    lat: float,
    lon: float,
) -> List[Dict]:
    """Query Nominatim for a single amenity type within ~1.2 km of the point."""
    params = {
        "amenity": amenity,
        "viewbox": _viewbox(lat, lon),
        "bounded": "1",
        "format": "json",
        "limit": "50",
        "addressdetails": "0",
    }
    try:
        resp = await client.get(
            NOMINATIM_URL,
            params=params,
            headers=NOMINATIM_HEADERS,
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json() or []
    except Exception as exc:
        print(f"[cafes] Nominatim ({amenity}) failed: {exc}", file=sys.stderr)
        return []


async def get_cafes(
    lat: float,
    lon: float,
    isochrone_polygon: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Returns::

        {
            "count_500m": int,
            "count_1km":  int,
            "count_isochrone": int,
            "cafes": [{"name": str, "lat": float, "lon": float, "distance_m": float}, ...],
            "nearest_m": float,
            "note": str,
        }
    """
    async with httpx.AsyncClient(timeout=12.0) as client:
        # Fetch cafes and bakeries in parallel; Nominatim allows it for non-automated use
        cafe_results, bakery_results = await asyncio.gather(
            _fetch_nominatim(client, "cafe", lat, lon),
            _fetch_nominatim(client, "bakery", lat, lon),
        )

    # Merge and deduplicate by (osm_type, osm_id)
    seen: set = set()
    cafes: List[Dict[str, Any]] = []

    for item in cafe_results + bakery_results:
        osm_key = (item.get("osm_type"), item.get("osm_id"))
        if osm_key in seen:
            continue
        seen.add(osm_key)

        try:
            clat = float(item["lat"])
            clon = float(item["lon"])
        except (KeyError, ValueError, TypeError):
            continue

        name = item.get("name") or item.get("display_name", "").split(",")[0] or "Nimetön kahvila"
        dist = _haversine_m(lat, lon, clat, clon)

        # Keep only within 1 km (viewbox may be slightly larger)
        if dist > 1000:
            continue

        cafes.append({
            "name": name.strip(),
            "lat": clat,
            "lon": clon,
            "distance_m": round(dist, 1),
        })

    cafes.sort(key=lambda c: c["distance_m"])

    count_500m = sum(1 for c in cafes if c["distance_m"] <= 500)
    count_1km = len(cafes)
    count_isochrone = sum(
        1 for c in cafes if _in_isochrone(c["lon"], c["lat"], isochrone_polygon)
    )
    nearest_m = cafes[0]["distance_m"] if cafes else 0.0

    note = ""
    if count_1km == 0:
        note = "Kilpailijoita ei löytynyt 1 km säteeltä (Nominatim)."

    return {
        "count_500m": count_500m,
        "count_1km": count_1km,
        "count_isochrone": count_isochrone,
        "cafes": cafes,
        "nearest_m": nearest_m,
        "note": note,
    }
