"""
Cafe discovery via Overpass API.

Catches all likely coffee-shop competitors in a Finnish city context:
  - amenity=cafe         (standard OSM cafes)
  - shop=coffee          (specialty coffee shops)
  - amenity=fast_food    with known Finnish/Nordic coffee chain names
  - amenity=bakery       (Finnish kahvila-bakeries serve coffee at tables)
"""

import sys
import math
from typing import Any, Dict, List, Optional

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Case-insensitive name regex that catches major Finnish coffee chains tagged
# as fast_food in OSM (Robert's Coffee, Coffee House, Espresso House, etc.)
_CHAIN_REGEX = (
    "Robert|Coffee House|Espresso House|Wayne|Starbucks|"
    "Barista|Kahvila|Pressbyrån|Fazer Café|Aino"
)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two WGS84 points."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _point_in_polygon(lon: float, lat: float, ring: List[List[float]]) -> bool:
    """
    Ray-casting point-in-polygon for a single GeoJSON ring
    (list of [lon, lat] pairs).
    """
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
    """
    Check if a point is inside an isochrone polygon.
    ``isochrone_polygon`` is the raw GeoJSON ``coordinates`` value (list of rings).
    """
    if not isochrone_polygon:
        return False
    try:
        outer_ring = isochrone_polygon[0]
        if not _point_in_polygon(lon, lat, outer_ring):
            return False
        # Check holes (inner rings) – point is inside a hole → outside polygon
        for hole in isochrone_polygon[1:]:
            if _point_in_polygon(lon, lat, hole):
                return False
        return True
    except Exception:
        return False


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
        }
    """
    # Overpass QL – broad query for all likely cafe competitors in Finnish cities.
    # `out center;` is a complete, valid output format that includes:
    #   - all tags (name, amenity, shop…)
    #   - lat/lon for nodes, centroid for ways/relations
    query = (
        f"[out:json][timeout:25];"
        f"("
        f'node["amenity"="cafe"](around:1000,{lat},{lon});'
        f'way["amenity"="cafe"](around:1000,{lat},{lon});'
        f'node["shop"="coffee"](around:1000,{lat},{lon});'
        f'way["shop"="coffee"](around:1000,{lat},{lon});'
        f'node["amenity"="bakery"](around:1000,{lat},{lon});'
        f'way["amenity"="bakery"](around:1000,{lat},{lon});'
        f'node["amenity"="fast_food"]["name"~"{_CHAIN_REGEX}",i](around:1000,{lat},{lon});'
        f'way["amenity"="fast_food"]["name"~"{_CHAIN_REGEX}",i](around:1000,{lat},{lon});'
        f");"
        f"out center;"
    )

    error_note = ""
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query})
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        error_note = str(exc)
        print(f"[cafes] Overpass query failed: {exc}", file=sys.stderr)
        return {
            "count_500m": 0,
            "count_1km": 0,
            "count_isochrone": 0,
            "cafes": [],
            "nearest_m": 0.0,
            "note": f"Overpass API ei vastannut: {error_note}",
        }

    seen_ids: set = set()
    cafes: List[Dict[str, Any]] = []
    for element in data.get("elements", []):
        elem_id = (element.get("type"), element.get("id"))
        if elem_id in seen_ids:
            continue
        seen_ids.add(elem_id)

        # nodes have lat/lon directly; ways/relations have a 'center'
        if element.get("type") == "node":
            clat = element.get("lat")
            clon = element.get("lon")
        else:
            center = element.get("center", {})
            clat = center.get("lat")
            clon = center.get("lon")

        if clat is None or clon is None:
            continue

        tags = element.get("tags", {})
        name = tags.get("name") or tags.get("brand") or "Nimetön kahvila"
        dist = _haversine_m(lat, lon, clat, clon)
        cafes.append({"name": name, "lat": clat, "lon": clon, "distance_m": round(dist, 1)})

    # Sort by distance
    cafes.sort(key=lambda c: c["distance_m"])

    count_500m = sum(1 for c in cafes if c["distance_m"] <= 500)
    count_1km = len(cafes)
    count_isochrone = sum(
        1 for c in cafes if _in_isochrone(c["lon"], c["lat"], isochrone_polygon)
    )
    nearest_m = cafes[0]["distance_m"] if cafes else 0.0

    return {
        "count_500m": count_500m,
        "count_1km": count_1km,
        "count_isochrone": count_isochrone,
        "cafes": cafes,
        "nearest_m": nearest_m,
        "note": "",
    }
