from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateTrackerMessageRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class TrackerMessageResponse(BaseModel):
    id: UUID
    tracker_id: UUID
    sender_user_id: UUID
    sender_name: str
    body: str
    created_at: datetime
    reactions: dict[str, int] = {}


class ToggleReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)


class TrackerMessageListData(BaseModel):
    data: list[TrackerMessageResponse]


class TrackerMessageData(BaseModel):
    data: TrackerMessageResponse
