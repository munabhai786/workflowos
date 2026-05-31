from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel
from pydantic import EmailStr
from pydantic import validator


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    account_type: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None


class PasswordUpdateRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

    @validator("confirm_password")
    def passwords_match(cls, v, values):
        if "new_password" in values and v != values["new_password"]:
            raise ValueError(
                "New password and confirm password do not match."
            )

        return v


class UserResponse(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr
    role: str
    account_type: str
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
