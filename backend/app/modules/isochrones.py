"""
Isochrone retrieval via OpenRouteService API.
Returns GeoJSON polygon coordinates for walking and driving profiles
at 5 / 10 / 15 minute intervals.
"""

import sys
from typing import Dict, Any

import httpx

# Simple in-memory cache: key = (lat, lon) -> result dict
_cache: Dict[tuple, Dict[str, Any]] = {}

ORS_BASE = "https://api.openrouteservice.org/v2/isochrones/{profile}"
PROFILES = ["foot-walking", "driving-car"]
TIMES_SECONDS = [300, 600, 900]  # 5, 10, 15 minutes


async def get_isochrones(lat: float, lon: float, api_key: str) -> Dict[str, Any]:
    """
    Returns::

        {
            "foot-walking": {5: geojson_coords, 10: ..., 15: ...},
            "driving-car":  {5: geojson_coords, 10: ..., 15: ...},
        }

    ``geojson_coords`` is the raw ``coordinates`` list from the ORS GeoJSON
    polygon feature (list-of-rings, each ring is a list of [lon, lat]).
    Returns an empty dict on any failure.
    """
    cache_key = (round(lat, 6), round(lon, 6))
    if cache_key in _cache:
        return _cache[cache_key]

    if not api_key:
        print("[isochrones] No ORS API key configured – skipping.", file=sys.stderr)
        return {}

    result: Dict[str, Any] = {}

    async with httpx.AsyncClient(timeout=10.0) as client:
        for profile in PROFILES:
            url = ORS_BASE.format(profile=profile)
            payload = {
                "locations": [[lon, lat]],
                "range": TIMES_SECONDS,
                "range_type": "time",
            }
            headers = {
                "Authorization": api_key,
                "Content-Type": "application/json",
            }
            try:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                print(
                    f"[isochrones] Error fetching {profile}: {exc}",
                    file=sys.stderr,
                )
                result[profile] = {}
                continue

            profile_result: Dict[int, Any] = {}
            features = data.get("features", [])
            # ORS returns features sorted by range ascending
            for feature in features:
                props = feature.get("properties", {})
                # 'value' is the range in seconds
                value_sec = props.get("value", 0)
                minutes = int(round(value_sec / 60))
                coords = feature.get("geometry", {}).get("coordinates")
                if coords is not None:
                    profile_result[minutes] = coords

            result[profile] = profile_result

    _cache[cache_key] = result
    return result
