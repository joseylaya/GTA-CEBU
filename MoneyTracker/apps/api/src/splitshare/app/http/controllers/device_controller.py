from fastapi import APIRouter, status

from splitshare.api.dependencies import CurrentUser, DatabaseSession
from splitshare.app.services.device_service import DeviceService
from splitshare.schemas.devices import MessageResponse, RegisterFcmTokenRequest

router = APIRouter(prefix="/devices", tags=["devices"])
service = DeviceService()


@router.put("/fcm-token", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def store_fcm_token(
    payload: RegisterFcmTokenRequest, session: DatabaseSession, user: CurrentUser
) -> MessageResponse:
    await service.register_fcm_token(session, user_id=user.id, payload=payload)
    return MessageResponse(message="FCM token registered.")
