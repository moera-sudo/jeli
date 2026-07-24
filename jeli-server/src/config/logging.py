# Application logging configuration. All log messages are in English.
import logging
import logging.config

from src.config.settings import get_settings


def setup_logging() -> None:
    # * Configures the root and uvicorn loggers according to LOG_LEVEL from settings.
    settings = get_settings()

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                },
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                    "stream": "ext://sys.stdout",
                },
            },
            "root": {
                "level": settings.log_level,
                "handlers": ["console"],
            },
            "loggers": {
                "uvicorn": {"level": settings.log_level, "handlers": ["console"], "propagate": False},
                "uvicorn.error": {"level": settings.log_level, "handlers": ["console"], "propagate": False},
                "uvicorn.access": {"level": settings.log_level, "handlers": ["console"], "propagate": False},
                # * SQL queries are too verbose at INFO/DEBUG level for everyday development
                "sqlalchemy.engine": {"level": "WARNING", "handlers": ["console"], "propagate": False},
            },
        }
    )

    logging.getLogger(__name__).info("Logging configured with level %s", settings.log_level)
