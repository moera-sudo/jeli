# Агрегатор роутов всех фич под общим префиксом /api.
import logging

from fastapi import APIRouter

from src.features.auth.router import router as AuthRouter
from src.features.family.router import router as FamilyRouter
from src.features.graph.router import router as GraphRouter
from src.features.media.router import router as MediaRouter
from src.features.messenger.router import router as MessengerRouter
from src.features.notifications.router import router as NotificationsRouter
from src.features.search.router import router as SearchRouter
from src.features.user.router import router as UserRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["api"])


@router.get("/health", summary="Проверка работоспособности сервиса")
async def health_check() -> dict[str, str]:
    # * Используется docker-compose healthcheck и внешним мониторингом.
    logger.info("Health check requested")
    return {"status": "ok"}


router.include_router(AuthRouter)
router.include_router(UserRouter)
router.include_router(GraphRouter)
router.include_router(NotificationsRouter)
router.include_router(MediaRouter)
router.include_router(MessengerRouter)
router.include_router(FamilyRouter)
router.include_router(SearchRouter)
