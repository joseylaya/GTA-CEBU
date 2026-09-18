from fastapi import APIRouter

from splitshare.app.http.controllers import (
    auth_router,
    chat_router,
    collaboration_router,
    device_router,
    finance_router,
    trackers_router,
)

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(chat_router)
api_router.include_router(trackers_router)
api_router.include_router(device_router)
api_router.include_router(finance_router)
api_router.include_router(collaboration_router)


@api_router.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
