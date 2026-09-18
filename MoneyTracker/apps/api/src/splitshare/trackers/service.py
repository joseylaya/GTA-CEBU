from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from splitshare.db.models.finance import ActivityLog, Expense
from splitshare.db.models.tracker import Tracker, TrackerMember
from splitshare.finance.service import FinanceError
from splitshare.schemas.trackers import CreateTrackerRequest, TrackerResponse, UpdateTrackerRequest
from splitshare.security.tokens import utc_now


def _response(tracker: Tracker, role: str) -> TrackerResponse:
    return TrackerResponse(
        id=tracker.id,
        name=tracker.name,
        description=tracker.description,
        currency_code=tracker.currency_code,
        currency_exponent=tracker.currency_exponent,
        role=role,
        version=tracker.version,
    )


async def create_tracker(
    session: AsyncSession, user_id, payload: CreateTrackerRequest
) -> TrackerResponse:
    now = utc_now()
    tracker = Tracker(
        name=payload.name,
        description=payload.description,
        currency_code=payload.currency_code,
        currency_exponent=payload.currency_exponent,
        owner_user_id=user_id,
        created_by=user_id,
        updated_by=user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(tracker)
    await session.flush()
    session.add(
        TrackerMember(
            tracker_id=tracker.id,
            user_id=user_id,
            role="owner",
            status="active",
            joined_at=now,
            created_by=user_id,
            updated_by=user_id,
            created_at=now,
            updated_at=now,
        )
    )
    await session.commit()
    return _response(tracker, "owner")


async def list_trackers(session: AsyncSession, user_id) -> list[TrackerResponse]:
    rows = await session.execute(
        select(Tracker, TrackerMember.role)
        .join(TrackerMember, TrackerMember.tracker_id == Tracker.id)
        .where(
            TrackerMember.user_id == user_id,
            TrackerMember.status == "active",
            Tracker.status == "active",
            Tracker.deleted_at.is_(None),
        )
        .order_by(Tracker.created_at.desc())
    )
    return [_response(tracker, role) for tracker, role in rows.all()]


async def get_tracker(session: AsyncSession, tracker_id, user_id) -> TrackerResponse:
    row = await session.execute(
        select(Tracker, TrackerMember.role)
        .join(TrackerMember, TrackerMember.tracker_id == Tracker.id)
        .where(Tracker.id == tracker_id, Tracker.deleted_at.is_(None), Tracker.status == "active", TrackerMember.user_id == user_id, TrackerMember.status == "active")
    )
    result = row.first()
    if result is None:
        raise FinanceError("TRACKER_ACCESS_DENIED", "You do not have access to this Tracker.", 403)
    return _response(*result)


async def update_tracker(session: AsyncSession, tracker_id, actor_id, payload: UpdateTrackerRequest) -> TrackerResponse:
    tracker = await session.get(Tracker, tracker_id)
    member = await session.scalar(select(TrackerMember).where(TrackerMember.tracker_id == tracker_id, TrackerMember.user_id == actor_id, TrackerMember.status == "active"))
    if tracker is None or tracker.deleted_at is not None or member is None:
        raise FinanceError("TRACKER_ACCESS_DENIED", "You do not have access to this Tracker.", 403)
    if member.role != "owner":
        raise FinanceError("OWNER_PERMISSION_REQUIRED", "Only the Tracker Owner can edit this Tracker.", 403)
    if tracker.version != payload.expected_version:
        raise FinanceError("STALE_TRACKER_VERSION", "This Tracker was changed by another member.", 409)
    has_financial_activity = await session.scalar(select(func.count()).select_from(Expense).where(Expense.tracker_id == tracker_id, Expense.deleted_at.is_(None)))
    if has_financial_activity and (tracker.currency_code != payload.currency_code or tracker.currency_exponent != payload.currency_exponent):
        raise FinanceError("TRACKER_CURRENCY_LOCKED", "Currency cannot change after financial activity exists.", 409)
    now = utc_now()
    tracker.name, tracker.description = payload.name, payload.description
    tracker.currency_code, tracker.currency_exponent = payload.currency_code, payload.currency_exponent
    tracker.version += 1
    tracker.updated_by, tracker.updated_at = actor_id, now
    session.add(ActivityLog(tracker_id=tracker.id, actor_user_id=actor_id, action="tracker.updated", subject_type="tracker", subject_id=tracker.id, metadata_={"name": tracker.name}, created_at=now))
    await session.commit()
    return _response(tracker, "owner")


async def delete_tracker(session: AsyncSession, tracker_id, actor_id, expected_version: int) -> None:
    tracker = await session.get(Tracker, tracker_id)
    member = await session.scalar(select(TrackerMember).where(TrackerMember.tracker_id == tracker_id, TrackerMember.user_id == actor_id, TrackerMember.status == "active"))
    if tracker is None or tracker.deleted_at is not None or member is None or member.role != "owner":
        raise FinanceError("OWNER_PERMISSION_REQUIRED", "Only the Tracker Owner can delete this Tracker.", 403)
    if tracker.version != expected_version:
        raise FinanceError("STALE_TRACKER_VERSION", "This Tracker was changed by another member.", 409)
    now = utc_now()
    tracker.status, tracker.deleted_at, tracker.deleted_by = "deleted", now, actor_id
    tracker.updated_at, tracker.updated_by, tracker.version = now, actor_id, tracker.version + 1
    session.add(ActivityLog(tracker_id=tracker.id, actor_user_id=actor_id, action="tracker.deleted", subject_type="tracker", subject_id=tracker.id, metadata_={"name": tracker.name}, created_at=now))
    await session.commit()
