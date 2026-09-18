from fastapi import APIRouter

from splitshare.api.dependencies import CurrentUser
from splitshare.schemas.auth import DataResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=DataResponse)
async def me(user: CurrentUser) -> DataResponse:
    """Return the profile associated with the verified Supabase JWT."""

    return DataResponse(data=UserResponse(id=user.id, email=user.email, name=user.name))
