"""
Location scoring engine for OuluScout.

Each dimension is scored 0–100 before weighting.
Default weights (sum to 1.0):
  traffic     0.25
  population  0.20
  jobs        0.15
  income      0.10
  competition 0.15
  pedestrians 0.15
"""

from typing import Any, Dict

from app.models import ScoreBreakdown

DEFAULT_WEIGHTS: Dict[str, float] = {
    "traffic": 0.25,
    "population": 0.20,
    "jobs": 0.15,
    "income": 0.10,
    "competition": 0.15,
    "pedestrians": 0.15,
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
    Oulu-calibrated income scoring.

    Paavo hr_mtu (median income, €/yr) in Oulu typically ranges 18 000–32 000.
    Baseline 22 000 €/yr (Oulu regional median) = 50 pts.
    Each 1 000 € difference = ±6 pts, clamped 0–100.

    Examples:
      18 000 € → 26 pts   (low-income peripheral area)
      22 000 € → 50 pts   (typical Oulu neighbourhood)
      26 000 € → 74 pts   (above-average area)
      30 000 € → 98 pts   (affluent suburb)
    """
    income = population.get("median_income")
    if income is None:
        return 50.0  # neutral when no data
    oulu_baseline = 22_000.0
    score = 50.0 + (income - oulu_baseline) / 1_000 * 6.0
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


def _score_pedestrians(pedestrians: Dict[str, Any]) -> float:
    """0 pts at 0 pedestrians/day, 100 pts at 5000+ pedestrians/day (linear, capped)."""
    count = pedestrians.get("typical_daily") or pedestrians.get("nearest_count")
    if count is None:
        return 0.0
    return _clamp(count / 5_000 * 100)


def calculate_score(
    traffic: Dict[str, Any],
    population: Dict[str, Any],
    cafes: Dict[str, Any],
    pedestrians: Dict[str, Any],
    weights: Dict[str, float],
) -> ScoreBreakdown:
    """
    Compute per-dimension scores and aggregate weighted total.

    ``weights`` should contain keys: traffic, population, jobs, income,
    competition, pedestrians – floats that sum to 1.0.
    Missing keys fall back to DEFAULT_WEIGHTS.
    """
    # Only keep the active weight keys; drop any unknown keys from caller
    active_keys = set(DEFAULT_WEIGHTS)
    filtered = {k: v for k, v in weights.items() if k in active_keys}
    resolved: Dict[str, float] = {**DEFAULT_WEIGHTS, **filtered}

    # Normalise so they always sum to 1.0
    total_w = sum(resolved.values())
    if total_w > 0 and abs(total_w - 1.0) > 1e-6:
        resolved = {k: v / total_w for k, v in resolved.items()}

    s_traffic = _score_traffic(traffic)
    s_population = _score_population(population)
    s_jobs = _score_jobs(population)
    s_income = _score_income(population)
    s_competition = _score_competition(cafes)
    s_pedestrians = _score_pedestrians(pedestrians)

    total = (
        s_traffic * resolved["traffic"]
        + s_population * resolved["population"]
        + s_jobs * resolved["jobs"]
        + s_income * resolved["income"]
        + s_competition * resolved["competition"]
        + s_pedestrians * resolved["pedestrians"]
    )

    return ScoreBreakdown(
        traffic=round(s_traffic, 2),
        population=round(s_population, 2),
        jobs=round(s_jobs, 2),
        income=round(s_income, 2),
        competition=round(s_competition, 2),
        pedestrians=round(s_pedestrians, 2),
        total=round(_clamp(total), 2),
    )
