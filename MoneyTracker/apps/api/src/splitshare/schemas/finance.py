from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CreateExpenseRequest(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    amount_minor: int = Field(gt=0)
    paid_by_user_id: UUID
    participant_user_ids: list[UUID] = Field(min_length=1)
    expense_date: date
    category_id: UUID | None = None
    note: str | None = Field(default=None, max_length=5000)
    receipt_storage_path: str | None = Field(default=None, max_length=500)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Description cannot be blank.")
        return cleaned

    @field_validator("participant_user_ids")
    @classmethod
    def distinct_participants(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("Each participant may appear only once.")
        return value


class UpdateExpenseRequest(CreateExpenseRequest):
    expected_version: int = Field(ge=1)


class ExpenseSplitResponse(BaseModel):
    user_id: UUID
    amount_minor: int


class ExpenseResponse(BaseModel):
    id: UUID
    tracker_id: UUID
    description: str
    amount_minor: int
    paid_by_user_id: UUID
    expense_date: date
    category_id: UUID | None
    note: str | None
    receipt_storage_path: str | None
    version: int
    created_at: datetime
    splits: list[ExpenseSplitResponse]


class ExpenseData(BaseModel):
    data: ExpenseResponse


class ExpenseListData(BaseModel):
    data: list[ExpenseResponse]


class MemberBalanceResponse(BaseModel):
    user_id: UUID
    name: str
    balance_minor: int


class PairwiseDebtResponse(BaseModel):
    from_user_id: UUID
    to_user_id: UUID
    amount_minor: int


class BalanceResponse(BaseModel):
    member_balances: list[MemberBalanceResponse]
    pairwise_debts: list[PairwiseDebtResponse]


class BalanceData(BaseModel):
    data: BalanceResponse


class CreateSettlementRequest(BaseModel):
    from_user_id: UUID
    to_user_id: UUID
    amount_minor: int = Field(gt=0)
    settlement_date: date
    payment_method: str | None = Field(default=None, max_length=50)
    note: str | None = Field(default=None, max_length=5000)
    receipt_storage_path: str | None = Field(default=None, max_length=500)


class SettlementResponse(BaseModel):
    id: UUID
    tracker_id: UUID
    from_user_id: UUID
    to_user_id: UUID
    amount_minor: int
    settlement_date: date
    payment_method: str | None
    note: str | None
    receipt_storage_path: str | None
    version: int


class SettlementData(BaseModel):
    data: SettlementResponse


class ActivityResponse(BaseModel):
    id: UUID
    action: str
    subject_type: str
    subject_id: UUID | None
    actor_user_id: UUID | None
    metadata: dict[str, object]
    created_at: datetime


class ActivityListData(BaseModel):
    data: list[ActivityResponse]
