from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from splitshare.db.models.device_token import DeviceToken
from splitshare.schemas.devices import RegisterFcmTokenRequest


class DeviceTokenRepository:
    async def upsert(
        self, session: AsyncSession, *, user_id, payload: RegisterFcmTokenRequest
    ) -> DeviceToken:
        device = await session.scalar(select(DeviceToken).where(DeviceToken.token == payload.token))
        if device is None:
            device = DeviceToken(user_id=user_id, token=payload.token, platform=payload.platform)
            session.add(device)
        else:
            device.user_id = user_id
            device.platform = payload.platform
            device.revoked_at = None
        await session.commit()
        await session.refresh(device)
        return device
