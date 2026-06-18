"""
Traffic count data from Digitraffic LAM (TMS) stations.

Flow:
  1. Fetch all LAM stations from Digitraffic (cached for 1 hour).
  2. Find the nearest station within 5 km of the query point.
  3. Fetch that station's latest traffic data and estimate KVL (daily avg).
  4. If nothing within 5 km, return a graceful note.
"""

import sys
import math
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

STATIONS_URL = "https://tie.digitraffic.fi/api/tms/v1/stations"
STATION_DATA_URL = "https://tie.digitraffic.fi/api/tms/v1/stations/{id}/data"

# Cache: (stations_list, timestamp)
_stations_cache: Tuple[Optional[List[Dict]], float] = (None, 0.0)
_CACHE_TTL = 3600.0  # 1 hour


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


async def _get_all_stations(client: httpx.AsyncClient) -> List[Dict]:
    global _stations_cache
    cached_list, cached_ts = _stations_cache
    if cached_list is not None and (time.monotonic() - cached_ts) < _CACHE_TTL:
        return cached_list

    try:
        resp = await client.get(STATIONS_URL, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        stations: List[Dict] = []
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates", [])
            if len(coords) >= 2:
                stations.append(
                    {
                        "id": props.get("id"),
                        "name": props.get("name", ""),
                        "lon": coords[0],
                        "lat": coords[1],
                    }
                )
        _stations_cache = (stations, time.monotonic())
        return stations
    except Exception as exc:
        print(f"[traffic] Could not fetch LAM station list: {exc}", file=sys.stderr)
        return []


async def _get_station_data(client: httpx.AsyncClient, station_id: Any) -> Optional[Dict]:
    url = STATION_DATA_URL.format(id=station_id)
    try:
        resp = await client.get(url, timeout=10.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        print(f"[traffic] Could not fetch data for station {station_id}: {exc}", file=sys.stderr)
        return None


def _estimate_kvl(station_data: Dict) -> Optional[int]:
    """
    Estimate KVL (average daily volume) from station sensor readings.
    Tries 'annualAvgCount' first; falls back to summing hourly flow sensors.
    """
    # Some endpoints expose annualAvgCount directly
    annual = station_data.get("annualAvgCount")
    if annual:
        try:
            return int(annual)
        except (ValueError, TypeError):
            pass

    # Sum up all OHITUKSET (passage count) sensor values
    total_count = 0
    count_found = False
    for sensor in station_data.get("sensorValues", []):
        name = str(sensor.get("name", "")).upper()
        # OHITUKSET_* sensors hold hourly vehicle counts
        if "OHITUKSET" in name:
            val = sensor.get("value")
            if val is not None:
                try:
                    total_count += int(float(val))
                    count_found = True
                except (ValueError, TypeError):
                    pass

    if count_found and total_count > 0:
        # Hourly data: multiply by 24 to get a rough daily estimate
        return total_count * 24

    return None


async def get_traffic(lat: float, lon: float) -> Dict[str, Any]:
    """
    Returns::

        {
            "nearest_count": int | None,
            "station_name": str | None,
            "distance_m": float | None,
            "kvl_value": int | None,
            "note": str,
        }
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        stations = await _get_all_stations(client)

    if not stations:
        return {
            "nearest_count": None,
            "station_name": None,
            "distance_m": None,
            "kvl_value": None,
            "note": "LAM station list unavailable.",
        }

    # Find nearest station
    nearest: Optional[Dict] = None
    nearest_dist = float("inf")
    for st in stations:
        d = _haversine_m(lat, lon, st["lat"], st["lon"])
        if d < nearest_dist:
            nearest_dist = d
            nearest = st

    if nearest is None or nearest_dist > 5000:
        return {
            "nearest_count": None,
            "station_name": nearest["name"] if nearest else None,
            "distance_m": round(nearest_dist, 1) if nearest_dist < float("inf") else None,
            "kvl_value": None,
            "note": "No LAM traffic station within 5 km. Traffic data unavailable for this area.",
        }

    # Fetch station data
    async with httpx.AsyncClient(timeout=10.0) as client:
        station_data = await _get_station_data(client, nearest["id"])

    if station_data is None:
        return {
            "nearest_count": None,
            "station_name": nearest["name"],
            "distance_m": round(nearest_dist, 1),
            "kvl_value": None,
            "note": f"Station '{nearest['name']}' found but data fetch failed.",
        }

    kvl = _estimate_kvl(station_data)

    return {
        "nearest_count": kvl,
        "station_name": nearest["name"],
        "distance_m": round(nearest_dist, 1),
        "kvl_value": kvl,
        "note": f"Nearest LAM station: {nearest['name']} at {round(nearest_dist)} m.",
    }
