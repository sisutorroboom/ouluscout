"""
Pedestrian and cyclist counting data from Oulunliikenne.fi / Oulu EcoCounter API.

Endpoint: https://api.oulunliikenne.fi/proxy/graphql
Schema:   ecoCounterSites { channels { lat lon siteId name ... } }
Data:     ecoCounterSiteData(id, domain, step, begin, end) { date counts }
"""

import sys
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

GRAPHQL_URL = "https://api.oulunliikenne.fi/proxy/graphql"

# Fetch all EcoCounter sites (stations) with their measurement channels
_SITES_QUERY = """
query GetEcoCounterSites {
  ecoCounterSites {
    id
    name
    domain
    channels {
      id
      siteId
      name
      lat
      lon
      userType
    }
  }
}
"""

# Fetch weekly counts for a single channel (broader window to ensure we get data).
# step values per Oulunliikenne docs: "15min" | "hour" | "day" | "week" | "month" | "year"
_DATA_QUERY = """
query GetChannelData($id: Int!, $domain: String!, $begin: String!, $end: String!) {
  ecoCounterSiteData(id: $id, domain: $domain, step: "day", begin: $begin, end: $end) {
    date
    counts
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


async def _fetch_graphql(
    client: httpx.AsyncClient,
    query: str,
    variables: Optional[Dict] = None,
) -> Optional[Dict]:
    payload: Dict[str, Any] = {"query": query}
    if variables:
        payload["variables"] = variables
    try:
        resp = await client.post(
            GRAPHQL_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=12.0,
        )
        resp.raise_for_status()
        result = resp.json()
        if "errors" in result:
            print(f"[pedestrians] GraphQL errors: {result['errors']}", file=sys.stderr)
        return result.get("data")
    except Exception as exc:
        print(f"[pedestrians] GraphQL request failed: {exc}", file=sys.stderr)
        return None


def _find_nearest_channel(
    lat: float, lon: float, sites: List[Dict]
) -> Tuple[Optional[Dict], Optional[str], float]:
    """
    Iterate over all sites and their channels to find the one
    with lat/lon closest to the query point.

    Returns (channel_dict, domain, distance_m).
    """
    nearest_channel: Optional[Dict] = None
    nearest_domain: Optional[str] = None
    nearest_dist = float("inf")

    for site in sites:
        domain = site.get("domain", "")
        for ch in site.get("channels") or []:
            slat = ch.get("lat")
            slon = ch.get("lon")
            if slat is None or slon is None:
                continue
            try:
                d = _haversine_m(lat, lon, float(slat), float(slon))
            except (ValueError, TypeError):
                continue
            if d < nearest_dist:
                nearest_dist = d
                nearest_channel = ch
                nearest_domain = domain

    return nearest_channel, nearest_domain, nearest_dist


async def get_pedestrians(lat: float, lon: float) -> Dict[str, Any]:
    """
    Returns::

        {
            "nearest_count": int | None,   # latest available daily count
            "station_name": str | None,
            "distance_m": float | None,
            "typical_daily": int | None,   # 7-day average
            "note": str,
        }
    """
    async with httpx.AsyncClient(timeout=12.0) as client:
        sites_data = await _fetch_graphql(client, _SITES_QUERY)

    if not sites_data:
        return {
            "nearest_count": None,
            "station_name": None,
            "distance_m": None,
            "typical_daily": None,
            "note": "Jalankulkija-/pyöräilylaskenta ei vastannut (api.oulunliikenne.fi).",
        }

    sites: List[Dict] = sites_data.get("ecoCounterSites") or []
    if not sites:
        return {
            "nearest_count": None,
            "station_name": None,
            "distance_m": None,
            "typical_daily": None,
            "note": "EcoCounter-asemia ei löytynyt datasta.",
        }

    channel, domain, dist_m = _find_nearest_channel(lat, lon, sites)

    if channel is None:
        return {
            "nearest_count": None,
            "station_name": None,
            "distance_m": None,
            "typical_daily": None,
            "note": "Laskenta-asemia löytyi, mutta koordinaatit puuttuvat.",
        }

    station_name = channel.get("name") or "Nimetön asema"

    # Try channel.id first (own ID), fall back to channel.siteId (parent site ID).
    # The API docs say "the channel's siteId value" but in practice `id` may work too.
    channel_id = channel.get("id") or channel.get("siteId")

    # Fetch the past 30 days of daily counts for this channel (wider window to
    # ensure we get at least some data even for stations that update infrequently)
    typical_daily: Optional[int] = None
    latest_count: Optional[int] = None

    if channel_id is not None and domain:
        now = datetime.now(tz=timezone.utc)
        end_str = now.strftime("%Y-%m-%dT%H:%M:%S")
        begin_str = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")

        async with httpx.AsyncClient(timeout=12.0) as client:
            count_data = await _fetch_graphql(
                client,
                _DATA_QUERY,
                variables={
                    "id": int(channel_id),
                    "domain": domain,
                    "begin": begin_str,
                    "end": end_str,
                },
            )

        if count_data:
            records = count_data.get("ecoCounterSiteData") or []
            counts = []
            for r in records:
                val = r.get("counts")
                if val is None:
                    continue
                try:
                    counts.append(int(val))
                except (ValueError, TypeError):
                    pass
            if counts:
                latest_count = counts[-1]
                typical_daily = round(sum(counts) / len(counts))

    note = (
        f"Lähin EcoCounter-asema: {station_name}, "
        f"{round(dist_m)} m etäisyydellä."
    )
    if typical_daily is None:
        note += " Historiadataa ei saatu haettua."

    return {
        "nearest_count": latest_count,
        "station_name": station_name,
        "distance_m": round(dist_m, 1),
        "typical_daily": typical_daily,
        "note": note,
    }
