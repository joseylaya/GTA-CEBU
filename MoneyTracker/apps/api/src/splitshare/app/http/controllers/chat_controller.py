from uuid import UUID

from fastapi import APIRouter, status

from splitshare.api.dependencies import CurrentUser, DatabaseSession
from splitshare.api.errors import api_error
from splitshare.chat.service import create_message, get_message, list_messages, toggle_reaction
from splitshare.finance.service import FinanceError
from splitshare.schemas.chat import (
    CreateTrackerMessageRequest,
    ToggleReactionRequest,
    TrackerMessageData,
    TrackerMessageListData,
)

router = APIRouter(prefix="/trackers/{tracker_id}/messages", tags=["tracker chat"])


@router.get("", response_model=TrackerMessageListData)
async def index(
    tracker_id: UUID, session: DatabaseSession, user: CurrentUser
) -> TrackerMessageListData:
    try:
        return TrackerMessageListData(data=await list_messages(session, tracker_id, user.id))
    except FinanceError as error:
        raise api_error(error.status_code, error.code, error.message)


@router.post("", response_model=TrackerMessageData, status_code=status.HTTP_201_CREATED)
async def store(
    tracker_id: UUID,
    payload: CreateTrackerMessageRequest,
    session: DatabaseSession,
    user: CurrentUser,
) -> TrackerMessageData:
    try:
        return TrackerMessageData(data=await create_message(session, tracker_id, user, payload))
    except FinanceError as error:
        raise api_error(error.status_code, error.code, error.message)


@router.get("/{message_id}", response_model=TrackerMessageData)
async def show(
    tracker_id: UUID,
    message_id: UUID,
    session: DatabaseSession,
    user: CurrentUser,
) -> TrackerMessageData:
    try:
        return TrackerMessageData(data=await get_message(session, tracker_id, message_id, user.id))
    except FinanceError as error:
        raise api_error(error.status_code, error.code, error.message)


@router.post("/{message_id}/reactions", response_model=TrackerMessageData)
async def react(
    tracker_id: UUID,
    message_id: UUID,
    payload: ToggleReactionRequest,
    session: DatabaseSession,
    user: CurrentUser,
) -> TrackerMessageData:
    try:
        return TrackerMessageData(
            data=await toggle_reaction(session, tracker_id, message_id, user.id, payload.emoji)
        )
    except FinanceError as error:
        raise api_error(error.status_code, error.code, error.message)
