from pydantic import (
    BaseModel,
    EmailStr,
    Field,
)

from typing import Optional


# =========================================
# REGISTER SCHEMA
# =========================================

class RegisterSchema(BaseModel):

    full_name: str = Field(
        ...,
        min_length=3,
        max_length=100
    )

    email: EmailStr

    password: str = Field(
        ...,
        min_length=6,
        max_length=100
    )

    role: str = Field(
        default="Team Member"
    )

    # FIXED
    # Invitation onboarding support

    invitation_token: Optional[str] = None


# =========================================
# LOGIN SCHEMA
# =========================================

class LoginSchema(BaseModel):

    email: EmailStr

    password: str


class TokenUserSchema(BaseModel):

    id: int

    full_name: str

    email: EmailStr

    role: str

    is_verified: bool

    two_factor_enabled: bool

    two_factor_method: Optional[str] = None


# =========================================
# VERIFY EMAIL OTP
# =========================================

class VerifyEmailSchema(BaseModel):

    email: EmailStr

    otp: Optional[str] = Field(
        None,
        min_length=6,
        max_length=6
    )


# =========================================
# RESEND OTP
# =========================================

class ResendOTPSchema(BaseModel):

    email: EmailStr


class SendVerificationSchema(BaseModel):

    email: EmailStr


# =========================================
# FORGOT PASSWORD
# =========================================

class ForgotPasswordSchema(BaseModel):

    email: EmailStr


# =========================================
# RESET PASSWORD
# =========================================

class ResetPasswordSchema(BaseModel):

    email: EmailStr

    otp: str = Field(
        ...,
        min_length=6,
        max_length=6
    )

    new_password: str = Field(
        ...,
        min_length=6,
        max_length=100
    )


# =========================================
# MFA LOGIN VERIFY
# =========================================

class MFAVerifySchema(BaseModel):

    mfa_token: str

    code: str = Field(
        ...,
        min_length=6,
        max_length=6
    )


# =========================================
# ENABLE / DISABLE 2FA
# =========================================

class TwoFactorSchema(BaseModel):

    method: str = Field(
        ...,
        pattern="^(email|google)$"
    )


class GoogleAuthenticatorVerifySchema(BaseModel):

    code: str = Field(
        ...,
        min_length=6,
        max_length=6
    )

    setup_token: Optional[str] = None
