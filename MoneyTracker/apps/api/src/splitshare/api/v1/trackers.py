from fastapi import APIRouter, status

from splitshare.api.dependencies import CurrentUser, DatabaseSession
from splitshare.schemas.trackers import CreateTrackerRequest, TrackerData, TrackerListData
from splitshare.trackers.service import create_tracker, list_trackers

router = APIRouter(prefix="/trackers", tags=["trackers"])


@router.get("", response_model=TrackerListData)
async def list_for_current_user(session: DatabaseSession, user: CurrentUser) -> TrackerListData:
    return TrackerListData(data=await list_trackers(session, user.id))


@router.post("", response_model=TrackerData, status_code=status.HTTP_201_CREATED)
async def create(
    payload: CreateTrackerRequest, session: DatabaseSession, user: CurrentUser
) -> TrackerData:
    return TrackerData(data=await create_tracker(session, user.id, payload))
