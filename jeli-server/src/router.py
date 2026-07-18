# Агрегатор роутов всех фич под общим префиксом /api.
from fastapi import APIRouter

api_router = APIRouter(prefix="/api")

# TODO: раскомментировать по мере реализации фич
# from src.features.auth.router import router as auth_router
# from src.features.user.router import router as user_router
# from src.features.graph.router import router as graph_router
# from src.features.messenger.router import router as messenger_router
# from src.features.notifications.router import router as notifications_router
#
# api_router.include_router(auth_router)
# api_router.include_router(user_router)
# api_router.include_router(graph_router)
# api_router.include_router(messenger_router)
# api_router.include_router(notifications_router)
