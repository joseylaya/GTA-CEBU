from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Role = Literal["owner", "editor", "commenter", "viewer"]


class MemberResponse(BaseModel):
    user_id: UUID
    name: str
    email: str
    role: Role
    joined_at: datetime


class MemberListData(BaseModel):
    data: list[MemberResponse]


class MemberCandidateData(BaseModel):
    data: list[MemberResponse]


class InviteMemberRequest(BaseModel):
    email: str = Field(max_length=320)
    role: Literal["editor", "commenter", "viewer"] = "viewer"


class InvitationResponse(BaseModel):
    id: UUID
    tracker_id: UUID
    email: str
    role: Role
    status: str
    expires_at: datetime


class InvitationData(BaseModel):
    data: InvitationResponse


class InvitationListData(BaseModel):
    data: list[InvitationResponse]


class ChangeRoleRequest(BaseModel):
    role: Literal["editor", "commenter", "viewer"]


class TransferOwnershipRequest(BaseModel):
    member_user_id: UUID
