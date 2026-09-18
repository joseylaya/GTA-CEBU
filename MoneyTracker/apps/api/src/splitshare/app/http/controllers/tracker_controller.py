from uuid import UUID

from fastapi import APIRouter, status

from splitshare.api.dependencies import CurrentUser, DatabaseSession
from splitshare.api.errors import api_error
from splitshare.finance.service import FinanceError
from splitshare.schemas.trackers import CreateTrackerRequest, TrackerData, TrackerListData, UpdateTrackerRequest
from splitshare.trackers.service import create_tracker, delete_tracker, get_tracker, list_trackers, update_tracker

router = APIRouter(prefix="/trackers", tags=["trackers"])

def _raise(error: FinanceError) -> None:
    raise api_error(error.status_code, error.code, error.message)


@router.get("", response_model=TrackerListData)
async def index(session: DatabaseSession, user: CurrentUser) -> TrackerListData:
    return TrackerListData(data=await list_trackers(session, user.id))


@router.post("", response_model=TrackerData, status_code=status.HTTP_201_CREATED)
async def store(
    payload: CreateTrackerRequest, session: DatabaseSession, user: CurrentUser
) -> TrackerData:
    return TrackerData(data=await create_tracker(session, user.id, payload))

@router.get("/{tracker_id}", response_model=TrackerData)
async def show(tracker_id: UUID, session: DatabaseSession, user: CurrentUser) -> TrackerData:
    try:
        return TrackerData(data=await get_tracker(session, tracker_id, user.id))
    except FinanceError as error:
        _raise(error)

@router.put("/{tracker_id}", response_model=TrackerData)
async def update(tracker_id: UUID, payload: UpdateTrackerRequest, session: DatabaseSession, user: CurrentUser) -> TrackerData:
    try:
        return TrackerData(data=await update_tracker(session, tracker_id, user.id, payload))
    except FinanceError as error:
        _raise(error)

@router.delete("/{tracker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def destroy(tracker_id: UUID, expected_version: int, session: DatabaseSession, user: CurrentUser) -> None:
    try:
        await delete_tracker(session, tracker_id, user.id, expected_version)
    except FinanceError as error:
        _raise(error)
