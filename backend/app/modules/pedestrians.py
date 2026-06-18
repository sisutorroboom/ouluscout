"""
Pedestrian and cyclist counting data from Oulunliikenne.fi GraphQL API.

Tries two known endpoint candidates. Returns gracefully if both fail.
"""

import sys
import math
from typing import Any, Dict, List, Optional

import httpx

GRAPHQL_ENDPOINTS = [
    "https://www.oulunliikenne.fi/avoindata/graphql",
    "https://wp.oulunliikenne.fi/graphql",
]

# GraphQL query to retrieve pedestrian/cyclist counting stations
_STATIONS_QUERY = """
query CountingStations {
  countingStations {
    id
    name
    lat
    lon
    latestCount
    typicalDaily
  }
}
"""


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _try_graphql(client: httpx.AsyncClient, endpoint: str) -> Optional[List[Dict]]:
    """Try fetching counting stations from a GraphQL endpoint."""
    try:
        resp = await client.post(
            endpoint,
            json={"query": _STATIONS_QUERY},
            headers={"Content-Type": "application/json"},
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        stations = data.get("data", {}).get("countingStations")
        if isinstance(stations, list):
            return stations
        return None
    except Exception as exc:
        print(f"[pedestrians] GraphQL endpoint {endpoint} failed: {exc}", file=sys.stderr)
        return None


async def get_pedestrians(lat: float, lon: float) -> Dict[str, Any]:
    """
    Returns::

        {
            "nearest_count": int | None,
            "station_name": str | None,
            "distance_m": float | None,
            "typical_daily": int | None,
            "note": str,
        }
    """
    stations: Optional[List[Dict]] = None

    async with httpx.AsyncClient(timeout=10.0) as client:
        for endpoint in GRAPHQL_ENDPOINTS:
            stations = await _try_graphql(client, endpoint)
            if stations is not None:
                break

    if stations is None:
        return {
            "nearest_count": None,
            "station_name": None,
            "distance_m": None,
            "typical_daily": None,
            "note": (
                "Pedestrian counting data unavailable. "
                "Oulunliikenne.fi GraphQL endpoints did not respond."
            ),
        }

    if not stations:
        return {
            "nearest_count": None,
            "station_name": None,
            "distance_m": None,
            "typical_daily": None,
            "note": "No pedestrian counting stations found in dataset.",
        }

    # Find nearest station
    nearest: Optional[Dict] = None
    nearest_dist = float("inf")
    for st in stations:
        slat = st.get("lat")
        slon = st.get("lon")
        if slat is None or slon is None:
            continue
        try:
            d = _haversine_m(lat, lon, float(slat), float(slon))
        except (ValueError, TypeError):
            continue
        if d < nearest_dist:
            nearest_dist = d
            nearest = st

    if nearest is None:
        return {
            "nearest_count": None,
            "station_name": None,
            "distance_m": None,
            "typical_daily": None,
            "note": "Counting stations found but coordinates missing.",
        }

    latest = nearest.get("latestCount")
    typical = nearest.get("typicalDaily")

    try:
        latest = int(latest) if latest is not None else None
    except (ValueError, TypeError):
        latest = None

    try:
        typical = int(typical) if typical is not None else None
    except (ValueError, TypeError):
        typical = None

    return {
        "nearest_count": latest,
        "station_name": nearest.get("name"),
        "distance_m": round(nearest_dist, 1),
        "typical_daily": typical,
        "note": (
            f"Nearest counting station: {nearest.get('name')} "
            f"at {round(nearest_dist)} m."
        ),
    }
