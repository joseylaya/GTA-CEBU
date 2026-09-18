from uuid import UUID

from fastapi import APIRouter, status

from splitshare.api.dependencies import CurrentUser, DatabaseSession
from splitshare.api.errors import api_error
from splitshare.finance.service import (
    FinanceError,
    balances,
    create_expense,
    create_settlement,
    delete_expense,
    list_activity,
    list_expenses,
    update_expense,
)
from splitshare.schemas.finance import (
    ActivityListData,
    BalanceData,
    CreateExpenseRequest,
    CreateSettlementRequest,
    ExpenseData,
    ExpenseListData,
    SettlementData,
    UpdateExpenseRequest,
)

router = APIRouter(prefix="/trackers/{tracker_id}", tags=["finances"])


def _raise(error: FinanceError) -> None:
    raise api_error(error.status_code, error.code, error.message)


@router.get("/expenses", response_model=ExpenseListData)
async def index_expenses(
    tracker_id: UUID, session: DatabaseSession, user: CurrentUser
) -> ExpenseListData:
    try:
        return ExpenseListData(data=await list_expenses(session, tracker_id, user.id))
    except FinanceError as error:
        _raise(error)


@router.post("/expenses", response_model=ExpenseData, status_code=status.HTTP_201_CREATED)
async def store_expense(
    tracker_id: UUID,
    payload: CreateExpenseRequest,
    session: DatabaseSession,
    user: CurrentUser,
) -> ExpenseData:
    try:
        return ExpenseData(data=await create_expense(session, tracker_id, user.id, payload))
    except FinanceError as error:
        _raise(error)


@router.put("/expenses/{expense_id}", response_model=ExpenseData)
async def update_expense_route(
    tracker_id: UUID,
    expense_id: UUID,
    payload: UpdateExpenseRequest,
    session: DatabaseSession,
    user: CurrentUser,
) -> ExpenseData:
    try:
        return ExpenseData(
            data=await update_expense(session, tracker_id, expense_id, user.id, payload)
        )
    except FinanceError as error:
        _raise(error)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense_route(
    tracker_id: UUID,
    expense_id: UUID,
    expected_version: int,
    session: DatabaseSession,
    user: CurrentUser,
) -> None:
    try:
        await delete_expense(session, tracker_id, expense_id, user.id, expected_version)
    except FinanceError as error:
        _raise(error)


@router.get("/activity", response_model=ActivityListData)
async def index_activity(
    tracker_id: UUID, session: DatabaseSession, user: CurrentUser
) -> ActivityListData:
    try:
        return ActivityListData(data=await list_activity(session, tracker_id, user.id))
    except FinanceError as error:
        _raise(error)


@router.get("/balances", response_model=BalanceData)
async def show_balances(
    tracker_id: UUID, session: DatabaseSession, user: CurrentUser
) -> BalanceData:
    try:
        return BalanceData(data=await balances(session, tracker_id, user.id))
    except FinanceError as error:
        _raise(error)


@router.post("/settlements", response_model=SettlementData, status_code=status.HTTP_201_CREATED)
async def store_settlement(
    tracker_id: UUID,
    payload: CreateSettlementRequest,
    session: DatabaseSession,
    user: CurrentUser,
) -> SettlementData:
    try:
        return SettlementData(data=await create_settlement(session, tracker_id, user.id, payload))
    except FinanceError as error:
        _raise(error)
