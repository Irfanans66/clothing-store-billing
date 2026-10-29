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

    # Create the demo "admin / admin123" store on startup. Keep off in production.
    SEED_DEMO_STORE: bool = False

    ALLOWED_ORIGINS: str = "*"

    # TWA / Android app Digital Asset Links (served at /.well-known/assetlinks.json)
    TWA_PACKAGE_NAME: str = "com.localbilling.app"
    # Comma-separated SHA256 cert fingerprints, one per signing key (debug/release).
    TWA_SHA256_FINGERPRINTS: str = (
        "B9:CB:E5:C3:77:73:13:EE:82:9C:F6:AE:D1:7F:B0:20:03:45:D0:C6:2F:AC:1D:65:D8:F0:C3:CB:A2:83:E2:F7"
    )

    APP_NAME: str = "Clothing Store Billing API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
