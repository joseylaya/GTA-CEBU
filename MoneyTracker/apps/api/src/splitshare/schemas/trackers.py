from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CreateTrackerRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    currency_code: str = Field(min_length=3, max_length=3)
    currency_exponent: int = Field(default=2, ge=0, le=4)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tracker name cannot be blank.")
        return value

    @field_validator("currency_code")
    @classmethod
    def currency(cls, value: str) -> str:
        return value.upper()


class UpdateTrackerRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    currency_code: str = Field(min_length=3, max_length=3)
    currency_exponent: int = Field(default=2, ge=0, le=4)
    expected_version: int = Field(ge=1)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tracker name cannot be blank.")
        return value

    @field_validator("currency_code")
    @classmethod
    def currency(cls, value: str) -> str:
        return value.upper()


class TrackerResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    currency_code: str
    currency_exponent: int
    role: str
    version: int


class TrackerData(BaseModel):
    data: TrackerResponse


class TrackerListData(BaseModel):
    data: list[TrackerResponse]
