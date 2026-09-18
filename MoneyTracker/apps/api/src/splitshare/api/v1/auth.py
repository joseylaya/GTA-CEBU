from fastapi import APIRouter, status

from splitshare.api.dependencies import CurrentUser, DatabaseSession
from splitshare.api.errors import api_error
from splitshare.auth.service import (
    AuthenticationError,
    DuplicateEmailError,
    login_user,
    refresh_authentication,
    register_user,
    revoke_refresh_session,
)
from splitshare.schemas.auth import (
    DataResponse,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=DataResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, session: DatabaseSession) -> DataResponse:
    try:
        tokens = await register_user(
            session, email=payload.email, name=payload.name, password=payload.password
        )
    except DuplicateEmailError:
        raise api_error(
            409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists."
        ) from None
    return DataResponse(data=tokens)


@router.post("/login", response_model=DataResponse)
async def login(payload: LoginRequest, session: DatabaseSession) -> DataResponse:
    try:
        tokens = await login_user(session, email=payload.email, password=payload.password)
    except AuthenticationError:
        raise api_error(401, "INVALID_CREDENTIALS", "Email or password is incorrect.") from None
    return DataResponse(data=tokens)


@router.post("/refresh", response_model=DataResponse)
async def refresh(payload: RefreshRequest, session: DatabaseSession) -> DataResponse:
    try:
        tokens = await refresh_authentication(session, refresh_token=payload.refresh_token)
    except AuthenticationError:
        raise api_error(
            401, "INVALID_REFRESH_TOKEN", "The refresh token is invalid or expired."
        ) from None
    return DataResponse(data=tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, session: DatabaseSession) -> None:
    try:
        await revoke_refresh_session(session, refresh_token=payload.refresh_token)
    except AuthenticationError:
        raise api_error(
            401, "INVALID_REFRESH_TOKEN", "The refresh token is invalid or expired."
        ) from None


@router.get("/me", response_model=DataResponse)
async def me(user: CurrentUser) -> DataResponse:
    return DataResponse(data=UserResponse(id=user.id, email=user.email, name=user.name))
