# Entry point of the Jeli FastAPI application.
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config.database import engine
from src.config.logging import setup_logging
from src.config.settings import get_settings
from src.exceptions import register_exception_handlers
from src.router import router

setup_logging()
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Jeli backend")
    yield
    logger.info("Shutting down Jeli backend, disposing database engine")
    await engine.dispose()


app = FastAPI(
    title="Jeli API",
    description=(
        "API for storing genealogical family trees and matching distant relatives "
        "through an ancestor-chain matching algorithm."
    ),
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(router)
