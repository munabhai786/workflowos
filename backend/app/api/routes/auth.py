from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session, object_session

from app.core.database import get_db, engine
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.project_invitation import ProjectInvitation
from app.models.project_member import ProjectMember
from app.models.user import User
from app.services.activity_service import create_activity
from app.schemas.auth import (
    ForgotPasswordSchema,
    GoogleAuthenticatorVerifySchema,
    LoginSchema,
    MFAVerifySchema,
    RegisterSchema,
    ResendOTPSchema,
    ResetPasswordSchema,
    SendVerificationSchema,
    TwoFactorSchema,
    VerifyEmailSchema,
)
from app.services.email_service import send_otp_email
from app.utils.auth_security import (
    MAX_OTP_ATTEMPTS,
    OTP_RESEND_SECONDS,
    assign_otp,
    build_totp_qr_data_url,
    decrypt_secret,
    encrypt_secret,
    generate_totp_secret,
    seconds_until_resend_allowed,
    send_user_mfa_otp,
    send_user_verification_otp,
    verify_otp,
    verify_totp,
)


router = APIRouter()


def ensure_avatar_column():
    inspector = inspect(engine)

    if not inspector.has_table("users"):
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("users")
    }

    if "avatar_url" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN avatar_url TEXT")
            )


def get_avatar_url(db: Session, user_id: int) -> str | None:
    ensure_avatar_column()

    result = db.execute(
        text("SELECT avatar_url FROM users WHERE id = :user_id"),
        {"user_id": user_id},
    ).first()

    return result[0] if result else None


def serialize_user(user: User) -> dict:
    db = object_session(user)

    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "avatar_url": get_avatar_url(db, user.id) if db else None,
        "role": user.role,
        "is_verified": user.is_verified,
        "two_factor_enabled": user.two_factor_enabled,
        "two_factor_method": user.two_factor_method,
    }


def create_user_token(user: User) -> str:
    return create_access_token({
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
    })


def create_mfa_token(user: User) -> str:
    return create_access_token(
        {
            "purpose": "mfa",
            "user_id": str(user.id),
            "email": user.email,
            "method": user.two_factor_method,
        },
        expires_delta=timedelta(minutes=5),
    )


def create_google_setup_token(user: User, secret: str) -> str:
    return create_access_token(
        {
            "purpose": "google_setup",
            "user_id": str(user.id),
            "email": user.email,
            "secret": secret,
        },
        expires_delta=timedelta(minutes=10),
    )


def get_user_by_email(db: Session, email: str) -> User | None:
    return (
        db.query(User)
        .filter(User.email == email.lower())
        .first()
    )


def enforce_resend_window(user: User):
    wait_seconds = seconds_until_resend_allowed(user)
    if wait_seconds > 0:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Please wait {wait_seconds} seconds "
                "before requesting another code."
            ),
        )


def refresh_pending_registration(
    user: User,
    data: RegisterSchema,
):
    """Update an unverified account when the user retries signup.

    A pending account should not permanently reserve an email address. Keeping
    the same row preserves the unique email constraint and avoids orphaned data,
    while a fresh password/role/OTP lets the user recover from a lost code or an
    abandoned verification session.
    """
    user.full_name = data.full_name
    user.password = hash_password(data.password)
    user.role = data.role
    user.is_verified = False
    user.two_factor_enabled = False
    user.two_factor_method = None
    user.google_auth_secret = None
    user.pending_invitation_token = data.invitation_token


def apply_pending_invitation(
    db: Session,
    user: User,
):
    token = user.pending_invitation_token
    if not token:
        return

    invitation = (
        db.query(ProjectInvitation)
        .filter(ProjectInvitation.token == token)
        .first()
    )

    if not invitation:
        user.pending_invitation_token = None
        return

    existing_member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == invitation.project_id,
            ProjectMember.user_id == user.id,
        )
        .first()
    )

    if not existing_member:
        db.add(
            ProjectMember(
                project_id=invitation.project_id,
                user_id=user.id,
                role=invitation.role,
            )
        )
        create_activity(
            db=db,
            action_type="invitation_accepted",
            message=f"{user.full_name} accepted an invitation.",
            user_id=user.id,
            project_id=invitation.project_id,
            entity_type="invitation",
            entity_id=invitation.id,
        )
        create_activity(
            db=db,
            action_type="user_joined_project",
            message=f"{user.full_name} joined the project.",
            user_id=user.id,
            project_id=invitation.project_id,
        )

    invitation.status = "accepted"
    invitation.accepted_at = invitation.accepted_at or datetime.utcnow()
    user.pending_invitation_token = None


@router.post("/register")
def register_user(
    data: RegisterSchema,
    db: Session = Depends(get_db),
):
    existing_user = get_user_by_email(db, data.email)

    if existing_user:
        if existing_user.is_verified:
            raise HTTPException(
                status_code=400,
                detail="Email already registered",
            )

        # Allow unverified users to retry signup without locking the email.
        # Registration retry is a recovery path, not a generic resend action.
        refresh_pending_registration(existing_user, data)
        db.commit()
        db.refresh(existing_user)
        new_user = existing_user
    else:
        new_user = User(
            full_name=data.full_name,
            email=data.email.lower(),
            password=hash_password(data.password),
            role=data.role,
            is_verified=False,
            pending_invitation_token=data.invitation_token,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

    # Attempt to send verification OTP.
    # Email delivery must not be able to crash registration.
    try:
        send_user_verification_otp(db, new_user)
        verification_message = (
            "Account created. Check your email for a verification code."
        )
    except Exception as e:
        print(f"[REGISTER] OTP step failed: {e}")
        verification_message = (
            "Account created successfully! Email verification is "
            "temporarily unavailable. You can verify later from your settings."
        )

    return {
        "success": True,
        "pending_verification": not new_user.is_verified,
        "message": verification_message,
        "email": new_user.email,
        "resend_after": OTP_RESEND_SECONDS,
    }



@router.post("/send-verification")
def send_verification(
    data: SendVerificationSchema,
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, data.email)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email already verified")

    enforce_resend_window(user)
    send_user_verification_otp(db, user)

    return {
        "success": True,
        "message": "Verification code sent",
        "resend_after": OTP_RESEND_SECONDS,
    }


@router.post("/resend-otp")
def resend_otp(
    data: ResendOTPSchema,
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, data.email)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified and not user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="Email already verified")

    enforce_resend_window(user)

    if user.two_factor_enabled and user.two_factor_method == "email":
        send_user_mfa_otp(db, user)
    else:
        send_user_verification_otp(db, user)

    return {
        "success": True,
        "message": "A new code has been sent",
        "resend_after": OTP_RESEND_SECONDS,
    }


@router.post("/verify-email")
def verify_email(
    data: VerifyEmailSchema,
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, data.email)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        return {
            "success": True,
            "message": "Email already verified",
        }

    ok, message = verify_otp(user, data.otp)
    db.commit()

    if not ok:
        raise HTTPException(status_code=400, detail=message)

    user.is_verified = True
    apply_pending_invitation(db, user)
    db.commit()

    token = create_user_token(user)

    return {
        "success": True,
        "message": "Email verified successfully",
        "token": token,
        "user": serialize_user(user),
    }


@router.post("/login")
def login_user(
    data: LoginSchema,
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, data.email)

    if not user or not verify_password(data.password, user.password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password. Please try again.",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Verify your email before signing in",
        )

    if user.two_factor_enabled:
        if user.two_factor_method == "email":
            send_user_mfa_otp(db, user)

        return {
            "success": True,
            "mfa_required": True,
            "mfa_token": create_mfa_token(user),
            "method": user.two_factor_method,
            "message": "Second factor required",
            "resend_after": (
                OTP_RESEND_SECONDS
                if user.two_factor_method == "email"
                else 0
            ),
        }

    token = create_user_token(user)

    return {
        "success": True,
        "token": token,
        "user": serialize_user(user),
    }


@router.post("/verify-mfa")
def verify_mfa(
    data: MFAVerifySchema,
    db: Session = Depends(get_db),
):
    payload = decode_token(data.mfa_token)

    if not payload or payload.get("purpose") != "mfa":
        raise HTTPException(status_code=401, detail="Invalid MFA session")

    user = (
        db.query(User)
        .filter(User.id == payload.get("user_id"))
        .first()
    )

    if not user or not user.two_factor_enabled:
        raise HTTPException(status_code=401, detail="Invalid MFA session")

    if user.two_factor_method == "email":
        ok, message = verify_otp(user, data.code)
        db.commit()
        if not ok:
            raise HTTPException(status_code=400, detail=message)

    elif user.two_factor_method == "google":
        if not user.google_auth_secret:
            raise HTTPException(status_code=400, detail="Authenticator is not configured")

        secret = decrypt_secret(user.google_auth_secret)
        if not verify_totp(secret, data.code):
            raise HTTPException(status_code=400, detail="Invalid authenticator code")

    else:
        raise HTTPException(status_code=400, detail="Unsupported MFA method")

    return {
        "success": True,
        "token": create_user_token(user),
        "user": serialize_user(user),
    }


@router.get("/me")
def read_me(current_user: User = Depends(get_current_user)):
    return {
        "success": True,
        "data": serialize_user(current_user),
    }


@router.get("/mfa/status")
def mfa_status(current_user: User = Depends(get_current_user)):
    return {
        "success": True,
        "data": serialize_user(current_user),
        "max_otp_attempts": MAX_OTP_ATTEMPTS,
    }


@router.post("/mfa/enable-email")
def enable_email_mfa(
    data: TwoFactorSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.method != "email":
        raise HTTPException(status_code=400, detail="Invalid 2FA method")

    current_user.two_factor_enabled = True
    current_user.two_factor_method = "email"
    current_user.google_auth_secret = None
    db.commit()

    return {
        "success": True,
        "message": "Email 2FA enabled",
        "user": serialize_user(current_user),
    }


@router.post("/mfa/setup-google")
def setup_google_authenticator(
    current_user: User = Depends(get_current_user),
):
    secret = generate_totp_secret()
    provisioning_uri, qr_code = build_totp_qr_data_url(
        current_user.email,
        secret,
    )

    return {
        "success": True,
        "secret": secret,
        "setup_token": create_google_setup_token(current_user, secret),
        "provisioning_uri": provisioning_uri,
        "qr_code": qr_code,
    }


@router.post("/mfa/verify-google")
def verify_google_setup(
    data: GoogleAuthenticatorVerifySchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    secret = None

    if data.setup_token:
        payload = decode_token(data.setup_token)

        if (
            not payload
            or payload.get("purpose") != "google_setup"
            or str(payload.get("user_id")) != str(current_user.id)
        ):
            raise HTTPException(
                status_code=400,
                detail="Authenticator setup expired. Start setup again.",
            )

        secret = payload.get("secret")

    elif current_user.google_auth_secret:
        secret = decrypt_secret(current_user.google_auth_secret)

    if not secret:
        raise HTTPException(
            status_code=400,
            detail="Start authenticator setup first",
        )

    if not verify_totp(secret, data.code):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")

    current_user.google_auth_secret = encrypt_secret(secret)
    current_user.two_factor_enabled = True
    current_user.two_factor_method = "google"
    db.commit()

    return {
        "success": True,
        "message": "Google Authenticator enabled",
        "user": serialize_user(current_user),
    }


@router.post("/mfa/disable")
def disable_mfa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.two_factor_enabled = False
    current_user.two_factor_method = None
    current_user.google_auth_secret = None
    db.commit()

    return {
        "success": True,
        "message": "Two-factor authentication disabled",
        "user": serialize_user(current_user),
    }


@router.post("/forgot-password")
def forgot_password(
    data: ForgotPasswordSchema,
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, data.email)

    if not user:
        return {
            "success": True,
            "message": "If the email exists, an OTP has been sent",
        }

    enforce_resend_window(user)
    otp = assign_otp(user)
    db.commit()
    send_otp_email(user.email, otp)

    return {
        "success": True,
        "message": "If the email exists, an OTP has been sent",
        "resend_after": OTP_RESEND_SECONDS,
    }


@router.post("/verify-otp")
def verify_password_reset_otp(
    data: VerifyEmailSchema,
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, data.email)

    if not user:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    ok, message = verify_otp(user, data.otp)
    db.commit()

    if not ok:
        raise HTTPException(status_code=400, detail=message)

    return {
        "success": True,
        "message": "OTP verified successfully",
    }


@router.post("/reset-password")
def reset_password(
    data: ResetPasswordSchema,
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, data.email)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password = hash_password(data.new_password)
    db.commit()

    return {
        "success": True,
        "message": "Password reset successful",
    }
