import asyncio
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from splitshare.db.models.chat import TrackerMessage, TrackerMessageReaction
from splitshare.db.models.device_token import DeviceToken
from splitshare.db.models.tracker import TrackerMember
from splitshare.db.models.user import User
from splitshare.finance.service import FinanceError
from splitshare.schemas.chat import CreateTrackerMessageRequest, TrackerMessageResponse


async def _member(session: AsyncSession, tracker_id: UUID, user_id: UUID) -> None:
    membership = await session.scalar(
        select(TrackerMember.id).where(
            TrackerMember.tracker_id == tracker_id,
            TrackerMember.user_id == user_id,
            TrackerMember.status == "active",
        )
    )
    if membership is None:
        raise FinanceError("TRACKER_ACCESS_DENIED", "You do not have access to this Tracker.", 403)


def _out(
    message: TrackerMessage, name: str, reactions: dict[str, int] | None = None
) -> TrackerMessageResponse:
    return TrackerMessageResponse(
        id=message.id,
        tracker_id=message.tracker_id,
        sender_user_id=message.sender_user_id,
        sender_name=name,
        body=message.body,
        created_at=message.created_at,
        reactions=reactions or {},
    )


async def list_messages(
    session: AsyncSession, tracker_id: UUID, user_id: UUID
) -> list[TrackerMessageResponse]:
    await _member(session, tracker_id, user_id)
    rows = await session.execute(
        select(TrackerMessage, User.name)
        .join(User, User.id == TrackerMessage.sender_user_id)
        .where(TrackerMessage.tracker_id == tracker_id)
        .order_by(TrackerMessage.created_at.desc())
        .limit(100)
    )
    messages = list(reversed(rows.all()))
    reaction_rows = (
        await session.execute(
            select(TrackerMessageReaction.message_id, TrackerMessageReaction.emoji, func.count())
            .where(TrackerMessageReaction.message_id.in_([message.id for message, _ in messages]))
            .group_by(TrackerMessageReaction.message_id, TrackerMessageReaction.emoji)
        )
        if messages
        else None
    )
    grouped: dict[UUID, dict[str, int]] = {}
    if reaction_rows:
        for message_id, emoji, count in reaction_rows:
            grouped.setdefault(message_id, {})[emoji] = count
    return [_out(message, name, grouped.get(message.id)) for message, name in messages]


async def get_message(
    session: AsyncSession, tracker_id: UUID, message_id: UUID, user_id: UUID
) -> TrackerMessageResponse:
    await _member(session, tracker_id, user_id)
    row = await session.execute(
        select(TrackerMessage, User.name)
        .join(User, User.id == TrackerMessage.sender_user_id)
        .where(TrackerMessage.tracker_id == tracker_id, TrackerMessage.id == message_id)
    )
    result = row.first()
    if result is None:
        raise FinanceError("MESSAGE_NOT_FOUND", "Message was not found.", 404)
    message, name = result
    reactions = await _reaction_counts(session, message.id)
    return _out(message, name, reactions)


async def _reaction_counts(session: AsyncSession, message_id: UUID) -> dict[str, int]:
    rows = await session.execute(
        select(TrackerMessageReaction.emoji, func.count())
        .where(TrackerMessageReaction.message_id == message_id)
        .group_by(TrackerMessageReaction.emoji)
    )
    return {emoji: count for emoji, count in rows}


async def toggle_reaction(
    session: AsyncSession, tracker_id: UUID, message_id: UUID, user_id: UUID, emoji: str
) -> TrackerMessageResponse:
    message = await session.scalar(
        select(TrackerMessage).where(
            TrackerMessage.id == message_id, TrackerMessage.tracker_id == tracker_id
        )
    )
    if message is None:
        raise FinanceError("MESSAGE_NOT_FOUND", "Message was not found.", 404)
    await _member(session, tracker_id, user_id)
    existing = await session.scalar(
        select(TrackerMessageReaction).where(
            TrackerMessageReaction.message_id == message_id,
            TrackerMessageReaction.user_id == user_id,
            TrackerMessageReaction.emoji == emoji,
        )
    )
    if existing:
        await session.delete(existing)
    else:
        session.add(TrackerMessageReaction(message_id=message_id, user_id=user_id, emoji=emoji))
    await session.commit()
    sender = await session.scalar(select(User.name).where(User.id == message.sender_user_id))
    return _out(message, sender or "Member", await _reaction_counts(session, message.id))


async def create_message(
    session: AsyncSession, tracker_id: UUID, user: User, payload: CreateTrackerMessageRequest
) -> TrackerMessageResponse:
    await _member(session, tracker_id, user.id)
    message = TrackerMessage(
        tracker_id=tracker_id, sender_user_id=user.id, body=payload.body.strip()
    )
    session.add(message)
    await session.commit()
    await session.refresh(message)
    await _notify_members(session, tracker_id, user.id, user.name, message)
    return _out(message, user.name)


async def _notify_members(
    session: AsyncSession,
    tracker_id: UUID,
    sender_id: UUID,
    sender_name: str,
    message: TrackerMessage,
) -> None:
    """Best-effort FCM delivery; chat persistence never depends on Firebase."""
    tokens = await session.scalars(
        select(DeviceToken.token)
        .join(TrackerMember, TrackerMember.user_id == DeviceToken.user_id)
        .where(
            TrackerMember.tracker_id == tracker_id,
            TrackerMember.status == "active",
            DeviceToken.user_id != sender_id,
            DeviceToken.revoked_at.is_(None),
        )
    )
    token_list = list(tokens)
    if not token_list:
        return
    try:
        from splitshare.app.services.fcm_notification_service import FcmNotificationService

        service = FcmNotificationService()
        await asyncio.gather(
            *[
                asyncio.to_thread(
                    service.send,
                    token=token,
                    title=sender_name,
                    body=message.body[:160],
                    data={
                        "type": "tracker_chat",
                        "tracker_id": str(tracker_id),
                        "message_id": str(message.id),
                    },
                )
                for token in token_list
            ],
            return_exceptions=True,
        )
    except Exception:
        # Firebase can be absent locally; it must never reject a saved message.
        return
