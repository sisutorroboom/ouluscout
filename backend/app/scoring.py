"""
Location scoring engine for OuluScout.

Each dimension is scored 0–100 before weighting.
Default weights (sum to 1.0):
  traffic     0.25
  population  0.25
  jobs        0.15
  income      0.10
  competition 0.15
  transit     0.10
"""

from typing import Any, Dict

from app.models import ScoreBreakdown

DEFAULT_WEIGHTS: Dict[str, float] = {
    "traffic": 0.25,
    "population": 0.25,
    "jobs": 0.15,
    "income": 0.10,
    "competition": 0.15,
    "transit": 0.10,
}


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _score_traffic(traffic: Dict[str, Any]) -> float:
    """0 pts at 0 cars/day, 100 pts at 20 000+ cars/day (linear, capped)."""
    kvl = traffic.get("kvl_value") or traffic.get("nearest_count")
    if kvl is None:
        return 0.0
    return _clamp(kvl / 20_000 * 100)


def _score_population(population: Dict[str, Any]) -> float:
    """0 pts = 0 people, 100 pts = 15 000+ people in 15-min walk isochrone (linear)."""
    pop = population.get("total_population", 0) or 0
    return _clamp(pop / 15_000 * 100)


def _score_jobs(population: Dict[str, Any]) -> float:
    """0=0 jobs, 100=5 000+ jobs (linear)."""
    jobs = population.get("jobs_count", 0) or 0
    return _clamp(jobs / 5_000 * 100)


def _score_income(population: Dict[str, Any]) -> float:
    """
    Baseline 25 000 €/yr = 50 pts.
    Each additional 1 000 € = +5 pts.
    Capped at 100 pts.
    """
    income = population.get("median_income")
    if income is None:
        return 50.0  # neutral when no data
    baseline = 25_000.0
    score = 50.0 + (income - baseline) / 1_000 * 5.0
    return _clamp(score)


def _score_competition(cafes: Dict[str, Any]) -> float:
    """
    Optimal demand-signal curve based on cafe count within isochrone (or 1 km):
      0 cafes       → 40 pts  (no demand signal)
      1–3 cafes     → 80 pts  (healthy competition, proven demand)
      4–6 cafes     → 60 pts  (moderately saturated)
      7+ cafes      → 30 pts  (saturated market)
    """
    # Prefer isochrone count; fall back to 1-km count
    count = cafes.get("count_isochrone") or cafes.get("count_1km", 0) or 0
    if count == 0:
        return 40.0
    if count <= 3:
        return 80.0
    if count <= 6:
        return 60.0
    return 30.0


def _score_transit(transit: Dict[str, Any]) -> float:
    """
    Stop within 100 m  → 100 pts
    100–300 m          → 80 pts
    300–600 m          → 50 pts
    600 m+             → 20 pts
    No data            → 40 pts (neutral)
    """
    distance_m = transit.get("distance_m")
    if distance_m is None:
        return 40.0
    if distance_m <= 100:
        return 100.0
    if distance_m <= 300:
        return 80.0
    if distance_m <= 600:
        return 50.0
    return 20.0


def calculate_score(
    traffic: Dict[str, Any],
    population: Dict[str, Any],
    cafes: Dict[str, Any],
    transit: Dict[str, Any],
    pedestrians: Dict[str, Any],  # noqa: ARG001 – reserved for future scoring
    weights: Dict[str, float],
) -> ScoreBreakdown:
    """
    Compute per-dimension scores and aggregate weighted total.

    ``weights`` should contain keys: traffic, population, jobs, income,
    competition, transit – all floats that sum to 1.0.
    Missing keys fall back to DEFAULT_WEIGHTS.
    """
    # Merge caller weights with defaults
    resolved: Dict[str, float] = {**DEFAULT_WEIGHTS, **weights}

    # Normalise so they always sum to 1.0 (safety net)
    total_w = sum(resolved.values())
    if total_w > 0 and abs(total_w - 1.0) > 1e-6:
        resolved = {k: v / total_w for k, v in resolved.items()}

    s_traffic = _score_traffic(traffic)
    s_population = _score_population(population)
    s_jobs = _score_jobs(population)
    s_income = _score_income(population)
    s_competition = _score_competition(cafes)
    s_transit = _score_transit(transit)

    total = (
        s_traffic * resolved["traffic"]
        + s_population * resolved["population"]
        + s_jobs * resolved["jobs"]
        + s_income * resolved["income"]
        + s_competition * resolved["competition"]
        + s_transit * resolved["transit"]
    )

    return ScoreBreakdown(
        traffic=round(s_traffic, 2),
        population=round(s_population, 2),
        jobs=round(s_jobs, 2),
        income=round(s_income, 2),
        competition=round(s_competition, 2),
        transit=round(s_transit, 2),
        total=round(_clamp(total), 2),
    )
