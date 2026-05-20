"""
app/core/config.py
Application settings loaded from .env
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "sqlite:///./billing.db"
    SECRET_KEY: str = "dev-secret-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    SUPER_ADMIN_USERNAME: str = "superadmin"
    SUPER_ADMIN_PASSWORD: str = "Super@Admin2024"

    ALLOWED_ORIGINS: str = "*"

    APP_NAME: str = "Clothing Store Billing API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
