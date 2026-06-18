"""
Transit stop data via Digitransit GraphQL API (Waltti router).

Finds the nearest public transit stop to the query point and lists its routes.
"""

import sys
import math
from typing import Any, Dict, List, Optional

import httpx

DIGITRANSIT_URL = (
    "https://api.digitransit.fi/routing/v1/routers/waltti/index/graphql"
)

# GraphQL query: nearest stops within 1 000 m, up to 5 results
_NEAREST_STOPS_QUERY = """
query NearestStops($lat: Float!, $lon: Float!) {
  stopsByRadius(lat: $lat, lon: $lon, radius: 1000, first: 5) {
    edges {
      node {
        stop {
          name
          lat
          lon
          stoptimesWithoutPatterns(numberOfDepartures: 1) {
            trip {
              routeShortName
            }
          }
        }
        distance
      }
    }
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


async def get_transit(lat: float, lon: float) -> Dict[str, Any]:
    """
    Returns::

        {
            "nearest_stop": str | None,
            "distance_m": float | None,
            "routes": list,
            "note": str,
        }
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                DIGITRANSIT_URL,
                json={
                    "query": _NEAREST_STOPS_QUERY,
                    "variables": {"lat": lat, "lon": lon},
                },
                headers={
                    "Content-Type": "application/json",
                    "digitransit-subscription-key": "",  # public endpoint, no key needed
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        print(f"[transit] Digitransit API error: {exc}", file=sys.stderr)
        return {
            "nearest_stop": None,
            "distance_m": None,
            "routes": [],
            "note": "Transit data unavailable. Digitransit API did not respond.",
        }

    try:
        edges = (
            data.get("data", {})
            .get("stopsByRadius", {})
            .get("edges", [])
        )
    except AttributeError:
        edges = []

    if not edges:
        return {
            "nearest_stop": None,
            "distance_m": None,
            "routes": [],
            "note": "No transit stops found within 1 000 m.",
        }

    # First edge is nearest
    first_edge = edges[0].get("node", {})
    stop_info = first_edge.get("stop", {})
    distance = first_edge.get("distance")

    stop_name = stop_info.get("name")

    # Collect unique route short names from this stop
    routes: List[str] = []
    for st in stop_info.get("stoptimesWithoutPatterns", []):
        trip = st.get("trip") or {}
        route = trip.get("routeShortName")
        if route and route not in routes:
            routes.append(route)

    # Also aggregate routes from the other nearby stops
    for edge in edges[1:]:
        node = edge.get("node", {})
        for st in node.get("stop", {}).get("stoptimesWithoutPatterns", []):
            trip = st.get("trip") or {}
            route = trip.get("routeShortName")
            if route and route not in routes:
                routes.append(route)

    try:
        distance_m = float(distance) if distance is not None else None
    except (ValueError, TypeError):
        distance_m = None

    return {
        "nearest_stop": stop_name,
        "distance_m": round(distance_m, 1) if distance_m is not None else None,
        "routes": sorted(routes),
        "note": (
            f"Nearest stop: {stop_name} at {round(distance_m) if distance_m else '?'} m. "
            f"Routes: {', '.join(sorted(routes)) or 'none found'}."
        ),
    }
