from pydantic_settings import BaseSettings
from typing import Dict, Any


class Settings(BaseSettings):
    ORS_API_KEY: str = ""
    OULU_CENTER_LAT: float = 65.0121
    OULU_CENTER_LON: float = 25.4651
    OULU_BBOX: Dict[str, float] = {
        "min_lat": 64.85,
        "max_lat": 65.15,
        "min_lon": 25.20,
        "max_lon": 25.80,
    }

    class Config:
        env_file = ".env"


settings = Settings()
