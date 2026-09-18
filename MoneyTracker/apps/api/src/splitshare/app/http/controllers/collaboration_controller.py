from uuid import UUID

from fastapi import APIRouter, status

from splitshare.api.dependencies import CurrentUser, DatabaseSession
from splitshare.api.errors import api_error
from splitshare.collaboration.service import (
    change_role,
    invite_member,
    list_tracker_invitations,
    list_members,
    list_my_invitations,
    remove_member,
    revoke_invitation,
    respond_to_invitation,
    search_member_candidates,
    transfer_ownership,
)
from splitshare.finance.service import FinanceError
from splitshare.schemas.collaboration import (
    ChangeRoleRequest,
    InvitationData,
    InvitationListData,
    InviteMemberRequest,
    MemberCandidateData,
    MemberListData,
    TransferOwnershipRequest,
)

router = APIRouter(tags=["collaboration"])


def _raise(error: FinanceError) -> None:
    raise api_error(error.status_code, error.code, error.message)


@router.get("/trackers/{tracker_id}/members", response_model=MemberListData)
async def index_members(
    tracker_id: UUID, session: DatabaseSession, user: CurrentUser
) -> MemberListData:
    try:
        return MemberListData(data=await list_members(session, tracker_id, user.id))
    except FinanceError as error:
        _raise(error)


@router.get("/trackers/{tracker_id}/member-candidates", response_model=MemberCandidateData)
async def member_candidates(
    tracker_id: UUID, q: str, session: DatabaseSession, user: CurrentUser
) -> MemberCandidateData:
    try:
        return MemberCandidateData(
            data=await search_member_candidates(session, tracker_id, user.id, q)
        )
    except FinanceError as error:
        _raise(error)


@router.post(
    "/trackers/{tracker_id}/invitations",
    response_model=InvitationData,
    status_code=status.HTTP_201_CREATED,
)
async def store_invitation(
    tracker_id: UUID,
    payload: InviteMemberRequest,
    session: DatabaseSession,
    user: CurrentUser,
) -> InvitationData:
    try:
        return InvitationData(data=await invite_member(session, tracker_id, user.id, payload))
    except FinanceError as error:
        _raise(error)


@router.get("/trackers/{tracker_id}/invitations", response_model=InvitationListData)
async def index_tracker_invitations(
    tracker_id: UUID, session: DatabaseSession, user: CurrentUser
) -> InvitationListData:
    try:
        return InvitationListData(data=await list_tracker_invitations(session, tracker_id, user.id))
    except FinanceError as error:
        _raise(error)


@router.delete("/trackers/{tracker_id}/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def destroy_invitation(
    tracker_id: UUID, invitation_id: UUID, session: DatabaseSession, user: CurrentUser
) -> None:
    try:
        await revoke_invitation(session, tracker_id, invitation_id, user.id)
    except FinanceError as error:
        _raise(error)


@router.get("/invitations", response_model=InvitationListData)
async def index_my_invitations(session: DatabaseSession, user: CurrentUser) -> InvitationListData:
    return InvitationListData(data=await list_my_invitations(session, user))


@router.post("/invitations/{invitation_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept_invitation(
    invitation_id: UUID, session: DatabaseSession, user: CurrentUser
) -> None:
    try:
        await respond_to_invitation(session, invitation_id, user, accept=True)
    except FinanceError as error:
        _raise(error)


@router.post("/invitations/{invitation_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_invitation(
    invitation_id: UUID, session: DatabaseSession, user: CurrentUser
) -> None:
    try:
        await respond_to_invitation(session, invitation_id, user, accept=False)
    except FinanceError as error:
        _raise(error)


@router.put(
    "/trackers/{tracker_id}/members/{member_user_id}/role", status_code=status.HTTP_204_NO_CONTENT
)
async def update_member_role(
    tracker_id: UUID,
    member_user_id: UUID,
    payload: ChangeRoleRequest,
    session: DatabaseSession,
    user: CurrentUser,
) -> None:
    try:
        await change_role(session, tracker_id, member_user_id, user.id, payload.role)
    except FinanceError as error:
        _raise(error)


@router.post("/trackers/{tracker_id}/transfer-ownership", status_code=status.HTTP_204_NO_CONTENT)
async def store_ownership_transfer(
    tracker_id: UUID,
    payload: TransferOwnershipRequest,
    session: DatabaseSession,
    user: CurrentUser,
) -> None:
    try:
        await transfer_ownership(session, tracker_id, payload.member_user_id, user.id)
    except FinanceError as error:
        _raise(error)


@router.delete(
    "/trackers/{tracker_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def destroy_member(
    tracker_id: UUID, member_user_id: UUID, session: DatabaseSession, user: CurrentUser
) -> None:
    try:
        await remove_member(session, tracker_id, member_user_id, user.id)
    except FinanceError as error:
        _raise(error)
