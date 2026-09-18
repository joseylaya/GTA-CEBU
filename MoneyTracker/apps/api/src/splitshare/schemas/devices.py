from typing import Literal

from pydantic import BaseModel, Field


class RegisterFcmTokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512)
    platform: Literal["android", "ios", "web"]


class MessageResponse(BaseModel):
    message: str
