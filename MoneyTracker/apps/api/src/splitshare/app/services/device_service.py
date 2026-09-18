from sqlalchemy.ext.asyncio import AsyncSession

from splitshare.app.repositories.device_token_repository import DeviceTokenRepository
from splitshare.schemas.devices import RegisterFcmTokenRequest


class DeviceService:
    def __init__(self, repository: DeviceTokenRepository | None = None) -> None:
        self._repository = repository or DeviceTokenRepository()

    async def register_fcm_token(
        self, session: AsyncSession, *, user_id, payload: RegisterFcmTokenRequest
    ) -> None:
        await self._repository.upsert(session, user_id=user_id, payload=payload)
