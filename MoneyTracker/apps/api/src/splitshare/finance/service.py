from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from splitshare.db.models.finance import ActivityLog, Expense, ExpenseSplit, Settlement
from splitshare.db.models.tracker import TrackerMember
from splitshare.schemas.finance import (
    ActivityResponse,
    BalanceResponse,
    CreateExpenseRequest,
    CreateSettlementRequest,
    ExpenseResponse,
    ExpenseSplitResponse,
    MemberBalanceResponse,
    PairwiseDebtResponse,
    SettlementResponse,
    UpdateExpenseRequest,
)
from splitshare.security.tokens import utc_now


@dataclass
class FinanceError(Exception):
    code: str
    message: str
    status_code: int = 422


async def _membership(session: AsyncSession, tracker_id: UUID, user_id: UUID) -> TrackerMember:
    member = await session.scalar(
        select(TrackerMember).where(
            TrackerMember.tracker_id == tracker_id,
            TrackerMember.user_id == user_id,
            TrackerMember.status == "active",
        )
    )
    if member is None:
        raise FinanceError("TRACKER_ACCESS_DENIED", "You do not have access to this Tracker.", 403)
    return member


async def _financial_access(session: AsyncSession, tracker_id: UUID, user_id: UUID) -> None:
    member = await _membership(session, tracker_id, user_id)
    if member.role not in {"owner", "editor"}:
        raise FinanceError(
            "FINANCIAL_PERMISSION_DENIED", "Only Owners and Editors can change finances.", 403
        )


async def _active_members(session: AsyncSession, tracker_id: UUID) -> dict[UUID, TrackerMember]:
    rows = await session.scalars(
        select(TrackerMember).where(
            TrackerMember.tracker_id == tracker_id, TrackerMember.status == "active"
        )
    )
    return {member.user_id: member for member in rows}


def _equal_splits(amount_minor: int, participants: list[UUID]) -> list[tuple[UUID, int]]:
    base, remainder = divmod(amount_minor, len(participants))
    return [
        (user_id, base + (1 if index < remainder else 0))
        for index, user_id in enumerate(participants)
    ]


def _expense_response(expense: Expense, splits: list[ExpenseSplit]) -> ExpenseResponse:
    return ExpenseResponse(
        id=expense.id,
        tracker_id=expense.tracker_id,
        description=expense.description,
        amount_minor=expense.amount_minor,
        paid_by_user_id=expense.paid_by_user_id,
        expense_date=expense.expense_date,
        category_id=expense.category_id,
        note=expense.note,
        receipt_storage_path=expense.receipt_storage_path,
        version=expense.version,
        created_at=expense.created_at,
        splits=[
            ExpenseSplitResponse(user_id=split.user_id, amount_minor=split.amount_minor)
            for split in splits
        ],
    )


async def create_expense(
    session: AsyncSession, tracker_id: UUID, actor_id: UUID, payload: CreateExpenseRequest
) -> ExpenseResponse:
    await _financial_access(session, tracker_id, actor_id)
    members = await _active_members(session, tracker_id)
    if payload.paid_by_user_id not in members or any(
        user_id not in members for user_id in payload.participant_user_ids
    ):
        raise FinanceError(
            "INVALID_TRACKER_MEMBER", "Payer and participants must be active Tracker members."
        )
    now = utc_now()
    expense = Expense(
        tracker_id=tracker_id,
        description=payload.description,
        amount_minor=payload.amount_minor,
        category_id=payload.category_id,
        paid_by_user_id=payload.paid_by_user_id,
        expense_date=payload.expense_date,
        note=payload.note,
        receipt_storage_path=payload.receipt_storage_path,
        created_by=actor_id,
        updated_by=actor_id,
        created_at=now,
        updated_at=now,
    )
    session.add(expense)
    await session.flush()
    splits = [
        ExpenseSplit(
            expense_id=expense.id,
            user_id=user_id,
            amount_minor=amount,
            created_at=now,
            updated_at=now,
        )
        for user_id, amount in _equal_splits(payload.amount_minor, payload.participant_user_ids)
    ]
    session.add_all(splits)
    session.add(
        ActivityLog(
            tracker_id=tracker_id,
            actor_user_id=actor_id,
            action="expense.created",
            subject_type="expense",
            subject_id=expense.id,
            metadata_={"description": expense.description, "amount_minor": expense.amount_minor},
            created_at=now,
        )
    )
    await session.commit()
    return _expense_response(expense, splits)


async def list_expenses(
    session: AsyncSession, tracker_id: UUID, user_id: UUID
) -> list[ExpenseResponse]:
    await _membership(session, tracker_id, user_id)
    expenses = list(
        (
            await session.scalars(
                select(Expense)
                .where(Expense.tracker_id == tracker_id, Expense.deleted_at.is_(None))
                .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
            )
        ).all()
    )
    if not expenses:
        return []
    split_rows = await session.scalars(
        select(ExpenseSplit).where(
            ExpenseSplit.expense_id.in_([expense.id for expense in expenses])
        )
    )
    grouped: dict[UUID, list[ExpenseSplit]] = defaultdict(list)
    for split in split_rows:
        grouped[split.expense_id].append(split)
    return [_expense_response(expense, grouped[expense.id]) for expense in expenses]


async def update_expense(
    session: AsyncSession,
    tracker_id: UUID,
    expense_id: UUID,
    actor_id: UUID,
    payload: UpdateExpenseRequest,
) -> ExpenseResponse:
    await _financial_access(session, tracker_id, actor_id)
    expense = await session.scalar(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.tracker_id == tracker_id,
            Expense.deleted_at.is_(None),
        )
    )
    if expense is None:
        raise FinanceError("EXPENSE_NOT_FOUND", "Expense was not found.", 404)
    if expense.version != payload.expected_version:
        raise FinanceError("EXPENSE_VERSION_CONFLICT", "Expense was changed by another user.", 409)
    members = await _active_members(session, tracker_id)
    if payload.paid_by_user_id not in members or any(
        user_id not in members for user_id in payload.participant_user_ids
    ):
        raise FinanceError(
            "INVALID_TRACKER_MEMBER", "Payer and participants must be active Tracker members."
        )
    now = utc_now()
    old_amount_minor = expense.amount_minor
    expense.description = payload.description
    expense.amount_minor = payload.amount_minor
    expense.category_id = payload.category_id
    expense.paid_by_user_id = payload.paid_by_user_id
    expense.expense_date = payload.expense_date
    expense.note = payload.note
    expense.version += 1
    expense.updated_by = actor_id
    expense.updated_at = now
    old_splits = list(
        (
            await session.scalars(select(ExpenseSplit).where(ExpenseSplit.expense_id == expense.id))
        ).all()
    )
    for split in old_splits:
        await session.delete(split)
    splits = [
        ExpenseSplit(
            expense_id=expense.id,
            user_id=user_id,
            amount_minor=amount,
            created_at=now,
            updated_at=now,
        )
        for user_id, amount in _equal_splits(payload.amount_minor, payload.participant_user_ids)
    ]
    session.add_all(splits)
    session.add(
        ActivityLog(
            tracker_id=tracker_id,
            actor_user_id=actor_id,
            action="expense.updated",
            subject_type="expense",
            subject_id=expense.id,
            metadata_={
                "old_amount_minor": old_amount_minor,
                "new_amount_minor": expense.amount_minor,
            },
            created_at=now,
        )
    )
    await session.commit()
    return _expense_response(expense, splits)


async def delete_expense(
    session: AsyncSession, tracker_id: UUID, expense_id: UUID, actor_id: UUID, expected_version: int
) -> None:
    await _financial_access(session, tracker_id, actor_id)
    expense = await session.scalar(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.tracker_id == tracker_id,
            Expense.deleted_at.is_(None),
        )
    )
    if expense is None:
        raise FinanceError("EXPENSE_NOT_FOUND", "Expense was not found.", 404)
    if expense.version != expected_version:
        raise FinanceError("EXPENSE_VERSION_CONFLICT", "Expense was changed by another user.", 409)
    now = utc_now()
    expense.deleted_at = now
    expense.deleted_by = actor_id
    expense.updated_by = actor_id
    expense.updated_at = now
    expense.version += 1
    session.add(
        ActivityLog(
            tracker_id=tracker_id,
            actor_user_id=actor_id,
            action="expense.deleted",
            subject_type="expense",
            subject_id=expense.id,
            metadata_={"description": expense.description, "amount_minor": expense.amount_minor},
            created_at=now,
        )
    )
    await session.commit()


async def list_activity(
    session: AsyncSession, tracker_id: UUID, user_id: UUID
) -> list[ActivityResponse]:
    await _membership(session, tracker_id, user_id)
    entries = await session.scalars(
        select(ActivityLog)
        .where(ActivityLog.tracker_id == tracker_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(100)
    )
    return [
        ActivityResponse(
            id=entry.id,
            action=entry.action,
            subject_type=entry.subject_type,
            subject_id=entry.subject_id,
            actor_user_id=entry.actor_user_id,
            metadata=entry.metadata_,
            created_at=entry.created_at,
        )
        for entry in entries
    ]


async def _balance_state(
    session: AsyncSession, tracker_id: UUID
) -> tuple[dict[UUID, int], dict[tuple[UUID, UUID], int]]:
    expenses = list(
        (
            await session.scalars(
                select(Expense).where(
                    Expense.tracker_id == tracker_id, Expense.deleted_at.is_(None)
                )
            )
        ).all()
    )
    split_rows = (
        []
        if not expenses
        else list(
            (
                await session.scalars(
                    select(ExpenseSplit).where(
                        ExpenseSplit.expense_id.in_([expense.id for expense in expenses])
                    )
                )
            ).all()
        )
    )
    expense_by_id = {expense.id: expense for expense in expenses}
    balances: dict[UUID, int] = defaultdict(int)
    debts: dict[tuple[UUID, UUID], int] = defaultdict(int)
    for expense in expenses:
        balances[expense.paid_by_user_id] += expense.amount_minor
    for split in split_rows:
        expense = expense_by_id[split.expense_id]
        balances[split.user_id] -= split.amount_minor
        if split.user_id != expense.paid_by_user_id:
            debts[(split.user_id, expense.paid_by_user_id)] += split.amount_minor
    settlements = await session.scalars(
        select(Settlement).where(
            Settlement.tracker_id == tracker_id, Settlement.deleted_at.is_(None)
        )
    )
    for settlement in settlements:
        balances[settlement.from_user_id] += settlement.amount_minor
        balances[settlement.to_user_id] -= settlement.amount_minor
        debts[(settlement.from_user_id, settlement.to_user_id)] -= settlement.amount_minor
    normalized: dict[tuple[UUID, UUID], int] = {}
    for (from_user, to_user), amount in debts.items():
        if amount <= 0:
            if amount < 0:
                normalized[(to_user, from_user)] = normalized.get((to_user, from_user), 0) + -amount
        else:
            normalized[(from_user, to_user)] = normalized.get((from_user, to_user), 0) + amount
    return balances, {pair: amount for pair, amount in normalized.items() if amount > 0}


async def balances(session: AsyncSession, tracker_id: UUID, user_id: UUID) -> BalanceResponse:
    await _membership(session, tracker_id, user_id)
    members = await _active_members(session, tracker_id)
    balances_by_user, debts = await _balance_state(session, tracker_id)
    from splitshare.db.models.user import User

    users = {
        user.id: user
        for user in (await session.scalars(select(User).where(User.id.in_(members)))).all()
    }
    return BalanceResponse(
        member_balances=[
            MemberBalanceResponse(
                user_id=member_id,
                name=users[member_id].name,
                balance_minor=balances_by_user.get(member_id, 0),
            )
            for member_id in members
        ],
        pairwise_debts=[
            PairwiseDebtResponse(from_user_id=pair[0], to_user_id=pair[1], amount_minor=amount)
            for pair, amount in debts.items()
        ],
    )


async def create_settlement(
    session: AsyncSession, tracker_id: UUID, actor_id: UUID, payload: CreateSettlementRequest
) -> SettlementResponse:
    await _financial_access(session, tracker_id, actor_id)
    if payload.from_user_id == payload.to_user_id:
        raise FinanceError("INVALID_SETTLEMENT", "Settlement payer and receiver must be different.")
    members = await _active_members(session, tracker_id)
    if payload.from_user_id not in members or payload.to_user_id not in members:
        raise FinanceError(
            "INVALID_TRACKER_MEMBER", "Settlement users must be active Tracker members."
        )
    _, debts = await _balance_state(session, tracker_id)
    outstanding = debts.get((payload.from_user_id, payload.to_user_id), 0)
    if payload.amount_minor > outstanding:
        raise FinanceError(
            "SETTLEMENT_EXCEEDS_DEBT", "Settlement cannot exceed the direct outstanding debt."
        )
    now = utc_now()
    settlement = Settlement(
        tracker_id=tracker_id,
        from_user_id=payload.from_user_id,
        to_user_id=payload.to_user_id,
        amount_minor=payload.amount_minor,
        settlement_date=payload.settlement_date,
        payment_method=payload.payment_method,
        note=payload.note,
        receipt_storage_path=payload.receipt_storage_path,
        created_by=actor_id,
        updated_by=actor_id,
        created_at=now,
        updated_at=now,
    )
    session.add(settlement)
    await session.flush()
    session.add(
        ActivityLog(
            tracker_id=tracker_id,
            actor_user_id=actor_id,
            action="settlement.created",
            subject_type="settlement",
            subject_id=settlement.id,
            metadata_={"amount_minor": settlement.amount_minor},
            created_at=now,
        )
    )
    await session.commit()
    return SettlementResponse(
        id=settlement.id,
        tracker_id=settlement.tracker_id,
        from_user_id=settlement.from_user_id,
        to_user_id=settlement.to_user_id,
        amount_minor=settlement.amount_minor,
        settlement_date=settlement.settlement_date,
        payment_method=settlement.payment_method,
        note=settlement.note,
        receipt_storage_path=settlement.receipt_storage_path,
        version=settlement.version,
    )
