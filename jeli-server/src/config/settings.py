# Настройки приложения, загружаемые из переменных окружения / .env.
from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # * База данных
    database_url: str = Field(alias="DATABASE_URL")

    # * JWT
    jwt_secret_key: str = Field(alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=30, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    # * CORS
    # ? NoDecode отключает встроенный JSON-парсинг pydantic-settings для сложных типов,
    # ? иначе он падает на "http://a,http://b" ещё до вызова нашего валидатора ниже
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list, alias="CORS_ORIGINS")

    # * Логирование
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # * Файлы (media) — папка на диске, смонтированная volume'ом в docker-compose.yml
    upload_dir: str = Field(default="uploads", alias="UPLOAD_DIR")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: str | list[str]) -> list[str]:
        # * CORS_ORIGINS задаётся строкой через запятую в .env
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
