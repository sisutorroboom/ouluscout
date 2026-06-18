from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any


class AnalyzeRequest(BaseModel):
    lat: float
    lon: float
    weights: Optional[Dict[str, float]] = Field(
        default=None,
        description=(
            "Optional per-component weights (traffic, population, jobs, income, "
            "competition, transit). Values should sum to 1.0."
        ),
    )


class IsochroneResult(BaseModel):
    # profile -> minutes -> GeoJSON polygon coordinates (list of [lon, lat] pairs)
    polygons: Dict[str, Dict[int, Any]] = Field(default_factory=dict)


class CafeResult(BaseModel):
    count_500m: int = 0
    count_1km: int = 0
    count_isochrone: int = 0
    cafes: List[Dict[str, Any]] = Field(default_factory=list)
    nearest_m: float = 0.0
    note: str = ""


class PopulationResult(BaseModel):
    total_population: int = 0
    age_0_14: float = 0.0
    age_15_24: float = 0.0
    age_25_64: float = 0.0
    age_65_plus: float = 0.0
    median_income: Optional[float] = None
    jobs_count: int = 0
    data_source: str = ""
    avg_rent_m2: Optional[float] = None   # estimated commercial rent €/m²
    postal_code: Optional[str] = None
    area_name: Optional[str] = None


class TrafficResult(BaseModel):
    nearest_count: Optional[int] = None
    station_name: Optional[str] = None
    distance_m: Optional[float] = None
    kvl_value: Optional[int] = None
    note: str = ""


class PedestrianResult(BaseModel):
    nearest_count: Optional[int] = None
    station_name: Optional[str] = None
    distance_m: Optional[float] = None
    typical_daily: Optional[int] = None
    note: str = ""


class TransitResult(BaseModel):
    nearest_stop: Optional[str] = None
    distance_m: Optional[float] = None
    routes: List[Any] = Field(default_factory=list)
    note: str = ""


class ScoreBreakdown(BaseModel):
    traffic: float = 0.0
    population: float = 0.0
    jobs: float = 0.0
    income: float = 0.0
    competition: float = 0.0
    pedestrians: float = 0.0
    total: float = 0.0


class AnalyzeResponse(BaseModel):
    lat: float
    lon: float
    isochrones: IsochroneResult
    cafes: CafeResult
    population: PopulationResult
    traffic: TrafficResult
    pedestrians: PedestrianResult
    transit: TransitResult
    score: ScoreBreakdown
