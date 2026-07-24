# Application settings loaded from environment variables / .env.
from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # * Database
    database_url: str = Field(alias="DATABASE_URL")

    # * JWT
    jwt_secret_key: str = Field(alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=30, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    # * CORS
    # ? NoDecode disables pydantic-settings' built-in JSON parsing for complex types,
    # ? otherwise it fails on "http://a,http://b" before our validator below even runs
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list, alias="CORS_ORIGINS")

    # * Logging
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # * Files (media) — a folder on disk mounted as a volume in docker-compose.yml
    upload_dir: str = Field(default="uploads", alias="UPLOAD_DIR")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: str | list[str]) -> list[str]:
        # * CORS_ORIGINS is set as a comma-separated string in .env
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
