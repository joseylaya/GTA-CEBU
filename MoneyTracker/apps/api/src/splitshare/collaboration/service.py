import hashlib
import secrets
from datetime import timedelta
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from splitshare.db.models.finance import ActivityLog
from splitshare.db.models.invitation import TrackerInvitation
from splitshare.db.models.tracker import Tracker, TrackerMember
from splitshare.db.models.user import User
from splitshare.finance.service import FinanceError
from splitshare.schemas.collaboration import (
    InvitationResponse,
    InviteMemberRequest,
    MemberResponse,
)
from splitshare.security.tokens import utc_now


async def _owner(session: AsyncSession, tracker_id: UUID, user_id: UUID) -> TrackerMember:
    member = await session.scalar(
        select(TrackerMember).where(
            TrackerMember.tracker_id == tracker_id,
            TrackerMember.user_id == user_id,
            TrackerMember.status == "active",
        )
    )
    if member is None or member.role != "owner":
        raise FinanceError(
            "OWNER_PERMISSION_REQUIRED", "Only the Tracker Owner can manage members.", 403
        )
    return member


async def list_members(
    session: AsyncSession, tracker_id: UUID, user_id: UUID
) -> list[MemberResponse]:
    membership = await session.scalar(
        select(TrackerMember).where(
            TrackerMember.tracker_id == tracker_id,
            TrackerMember.user_id == user_id,
            TrackerMember.status == "active",
        )
    )
    if membership is None:
        raise FinanceError("TRACKER_ACCESS_DENIED", "You do not have access to this Tracker.", 403)
    rows = await session.execute(
        select(TrackerMember, User)
        .join(User, User.id == TrackerMember.user_id)
        .where(TrackerMember.tracker_id == tracker_id, TrackerMember.status == "active")
        .order_by(TrackerMember.joined_at)
    )
    return [
        MemberResponse(
            user_id=member.user_id,
            name=user.name,
            email=user.email,
            role=member.role,
            joined_at=member.joined_at,
        )
        for member, user in rows
    ]


async def search_member_candidates(
    session: AsyncSession, tracker_id: UUID, actor_id: UUID, query: str
) -> list[MemberResponse]:
    await _owner(session, tracker_id, actor_id)
    term = query.strip()
    if len(term) < 2:
        return []
    member_ids = select(TrackerMember.user_id).where(
        TrackerMember.tracker_id == tracker_id,
        TrackerMember.status == "active",
    )
    pattern = f"%{term}%"
    users = await session.scalars(
        select(User)
        .where(
            User.status == "active",
            User.deleted_at.is_(None),
            User.id.not_in(member_ids),
            or_(User.name.ilike(pattern), User.email_normalized.ilike(pattern)),
        )
        .order_by(User.name, User.email_normalized)
        .limit(8)
    )
    return [
        MemberResponse(
            user_id=user.id,
            name=user.name,
            email=user.email,
            role="viewer",
            joined_at=user.created_at,
        )
        for user in users
    ]


def _invitation_response(invitation: TrackerInvitation) -> InvitationResponse:
    return InvitationResponse(
        id=invitation.id,
        tracker_id=invitation.tracker_id,
        email=invitation.email,
        role=invitation.role,
        status=invitation.status,
        expires_at=invitation.expires_at,
    )


async def invite_member(
    session: AsyncSession, tracker_id: UUID, actor_id: UUID, payload: InviteMemberRequest
) -> InvitationResponse:
    await _owner(session, tracker_id, actor_id)
    email = payload.email.strip().lower()
    if "@" not in email:
        raise FinanceError("INVALID_EMAIL", "Enter a valid email address.")
    existing_member = await session.scalar(
        select(TrackerMember.id)
        .join(User, User.id == TrackerMember.user_id)
        .where(
            TrackerMember.tracker_id == tracker_id,
            TrackerMember.status == "active",
            User.email_normalized == email,
        )
    )
    if existing_member is not None:
        raise FinanceError(
            "ALREADY_A_MEMBER", "That person is already an active Tracker member.", 409
        )
    pending = await session.scalar(
        select(TrackerInvitation).where(
            TrackerInvitation.tracker_id == tracker_id,
            TrackerInvitation.email_normalized == email,
            TrackerInvitation.status == "pending",
        )
    )
    if pending is not None:
        raise FinanceError(
            "INVITATION_ALREADY_PENDING", "A pending invitation already exists.", 409
        )
    now = utc_now()
    invitation = TrackerInvitation(
        tracker_id=tracker_id,
        email=email,
        email_normalized=email,
        role=payload.role,
        token_hash=hashlib.sha256(secrets.token_urlsafe(32).encode()).hexdigest(),
        invited_by=actor_id,
        expires_at=now + timedelta(days=7),
        created_at=now,
        updated_at=now,
    )
    session.add(invitation)
    await session.flush()
    session.add(
        ActivityLog(
            tracker_id=tracker_id,
            actor_user_id=actor_id,
            action="member.invited",
            subject_type="invitation",
            subject_id=invitation.id,
            metadata_={"email": email, "role": payload.role},
            created_at=now,
        )
    )
    await session.commit()
    return _invitation_response(invitation)


async def list_my_invitations(session: AsyncSession, user: User) -> list[InvitationResponse]:
    now = utc_now()
    expired = await session.scalars(
        select(TrackerInvitation).where(
            TrackerInvitation.email_normalized == user.email_normalized,
            TrackerInvitation.status == "pending",
            TrackerInvitation.expires_at <= now,
        )
    )
    for invitation in expired:
        invitation.status = "expired"
        invitation.updated_at = now
    await session.commit()
    invitations = await session.scalars(
        select(TrackerInvitation)
        .where(
            TrackerInvitation.email_normalized == user.email_normalized,
            TrackerInvitation.status == "pending",
        )
        .order_by(TrackerInvitation.created_at.desc())
    )
    return [_invitation_response(invitation) for invitation in invitations]


async def list_tracker_invitations(
    session: AsyncSession, tracker_id: UUID, actor_id: UUID
) -> list[InvitationResponse]:
    await _owner(session, tracker_id, actor_id)
    now = utc_now()
    invitations = list((await session.scalars(select(TrackerInvitation).where(TrackerInvitation.tracker_id == tracker_id).order_by(TrackerInvitation.created_at.desc()))).all())
    for invitation in invitations:
        if invitation.status == "pending" and invitation.expires_at <= now:
            invitation.status, invitation.updated_at = "expired", now
    await session.commit()
    return [_invitation_response(invitation) for invitation in invitations]


async def revoke_invitation(
    session: AsyncSession, tracker_id: UUID, invitation_id: UUID, actor_id: UUID
) -> None:
    await _owner(session, tracker_id, actor_id)
    invitation = await session.scalar(select(TrackerInvitation).where(TrackerInvitation.id == invitation_id, TrackerInvitation.tracker_id == tracker_id))
    if invitation is None or invitation.status != "pending":
        raise FinanceError("INVITATION_NOT_PENDING", "This invitation is no longer pending.", 409)
    now = utc_now()
    invitation.status, invitation.revoked_at, invitation.updated_at = "revoked", now, now
    session.add(ActivityLog(tracker_id=tracker_id, actor_user_id=actor_id, action="member.invitation_revoked", subject_type="invitation", subject_id=invitation.id, metadata_={"email": invitation.email}, created_at=now))
    await session.commit()


async def respond_to_invitation(
    session: AsyncSession, invitation_id: UUID, user: User, accept: bool
) -> None:
    invitation = await session.get(TrackerInvitation, invitation_id)
    now = utc_now()
    if (
        invitation is None
        or invitation.email_normalized != user.email_normalized
        or invitation.status != "pending"
    ):
        raise FinanceError("INVITATION_NOT_FOUND", "Invitation was not found.", 404)
    if invitation.expires_at <= now:
        invitation.status = "expired"
        invitation.updated_at = now
        await session.commit()
        raise FinanceError("INVITATION_EXPIRED", "This invitation has expired.", 409)
    if not accept:
        invitation.status = "declined"
        invitation.declined_at = now
        invitation.updated_at = now
        await session.commit()
        return
    invitation.status = "accepted"
    invitation.accepted_by = user.id
    invitation.accepted_at = now
    invitation.updated_at = now
    session.add(
        TrackerMember(
            tracker_id=invitation.tracker_id,
            user_id=user.id,
            role=invitation.role,
            status="active",
            joined_at=now,
            created_by=invitation.invited_by,
            updated_by=user.id,
            created_at=now,
            updated_at=now,
        )
    )
    session.add(
        ActivityLog(
            tracker_id=invitation.tracker_id,
            actor_user_id=user.id,
            action="member.joined",
            subject_type="member",
            subject_id=user.id,
            metadata_={"role": invitation.role},
            created_at=now,
        )
    )
    await session.commit()


async def change_role(
    session: AsyncSession, tracker_id: UUID, member_user_id: UUID, actor_id: UUID, role: str
) -> None:
    await _owner(session, tracker_id, actor_id)
    member = await session.scalar(
        select(TrackerMember).where(
            TrackerMember.tracker_id == tracker_id,
            TrackerMember.user_id == member_user_id,
            TrackerMember.status == "active",
        )
    )
    if member is None or member.role == "owner":
        raise FinanceError(
            "INVALID_MEMBER_ROLE_CHANGE", "Transfer ownership to change an Owner role."
        )
    now = utc_now()
    member.role = role
    member.updated_by = actor_id
    member.updated_at = now
    session.add(
        ActivityLog(
            tracker_id=tracker_id,
            actor_user_id=actor_id,
            action="member.role_changed",
            subject_type="member",
            subject_id=member_user_id,
            metadata_={"role": role},
            created_at=now,
        )
    )
    await session.commit()


async def transfer_ownership(
    session: AsyncSession, tracker_id: UUID, target_user_id: UUID, actor_id: UUID
) -> None:
    previous = await _owner(session, tracker_id, actor_id)
    target = await session.scalar(
        select(TrackerMember).where(
            TrackerMember.tracker_id == tracker_id,
            TrackerMember.user_id == target_user_id,
            TrackerMember.status == "active",
        )
    )
    if target is None or target.user_id == actor_id:
        raise FinanceError("INVALID_OWNERSHIP_TARGET", "Choose another active Tracker member.")
    tracker = await session.get(Tracker, tracker_id)
    now = utc_now()
    previous.role = "editor"
    previous.updated_by = actor_id
    previous.updated_at = now
    target.role = "owner"
    target.updated_by = actor_id
    target.updated_at = now
    tracker.owner_user_id = target_user_id
    tracker.updated_by = actor_id
    tracker.updated_at = now
    tracker.version += 1
    session.add(
        ActivityLog(
            tracker_id=tracker_id,
            actor_user_id=actor_id,
            action="tracker.ownership_transferred",
            subject_type="tracker",
            subject_id=tracker_id,
            metadata_={"new_owner_user_id": str(target_user_id)},
            created_at=now,
        )
    )
    await session.commit()


async def remove_member(
    session: AsyncSession, tracker_id: UUID, member_user_id: UUID, actor_id: UUID
) -> None:
    await _owner(session, tracker_id, actor_id)
    if member_user_id == actor_id:
        raise FinanceError(
            "OWNER_CANNOT_REMOVE_SELF", "Transfer ownership before leaving the Tracker."
        )
    member = await session.scalar(
        select(TrackerMember).where(
            TrackerMember.tracker_id == tracker_id,
            TrackerMember.user_id == member_user_id,
            TrackerMember.status == "active",
        )
    )
    if member is None or member.role == "owner":
        raise FinanceError("MEMBER_NOT_FOUND", "Active member was not found.", 404)
    now = utc_now()
    member.status = "removed"
    member.removed_at = now
    member.removed_by = actor_id
    member.updated_by = actor_id
    member.updated_at = now
    session.add(
        ActivityLog(
            tracker_id=tracker_id,
            actor_user_id=actor_id,
            action="member.removed",
            subject_type="member",
            subject_id=member_user_id,
            metadata_={},
            created_at=now,
        )
    )
    await session.commit()
