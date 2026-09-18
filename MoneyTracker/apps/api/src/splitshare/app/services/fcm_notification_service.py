from collections.abc import Mapping

from splitshare.config import get_settings


class FcmNotificationService:
    """Outbound-only Firebase adapter; domain events remain the source of truth."""

    _initialized = False

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        path = get_settings().firebase_service_account_path
        if not path:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_PATH is not configured.")
        # Import lazily so local API health checks do not require Firebase
        # credentials or the optional delivery dependency.
        from firebase_admin import credentials, initialize_app

        initialize_app(credentials.Certificate(path))
        self._initialized = True

    def send(self, *, token: str, title: str, body: str, data: Mapping[str, str]) -> str:
        self._ensure_initialized()
        from firebase_admin import messaging

        message = messaging.Message(
            token=token,
            notification=messaging.Notification(title=title, body=body),
            data=dict(data),
        )
        return messaging.send(message)
