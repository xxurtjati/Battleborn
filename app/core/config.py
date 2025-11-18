"""Application configuration."""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings."""

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/playtomic_monitor"

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = True

    # Playtomic
    PLAYTOMIC_BASE_URL: str = "https://playtomic.com"
    PLAYTOMIC_API_BASE_URL: str = "https://playtomic.com/api"
    REQUEST_DELAY_SECONDS: float = 1.0
    MAX_RETRIES: int = 3

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Monitoring
    DEFAULT_CHECK_FREQUENCY_MINUTES: int = 15
    DEFAULT_DAYS_AHEAD: int = 7

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
