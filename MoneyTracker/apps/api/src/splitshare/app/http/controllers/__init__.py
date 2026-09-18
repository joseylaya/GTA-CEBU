from splitshare.app.http.controllers.auth_controller import router as auth_router
from splitshare.app.http.controllers.chat_controller import router as chat_router
from splitshare.app.http.controllers.collaboration_controller import router as collaboration_router
from splitshare.app.http.controllers.device_controller import router as device_router
from splitshare.app.http.controllers.finance_controller import router as finance_router
from splitshare.app.http.controllers.tracker_controller import router as trackers_router

__all__ = [
    "auth_router",
    "chat_router",
    "collaboration_router",
    "device_router",
    "finance_router",
    "trackers_router",
]
