import base64
import hashlib
import hmac
import io
import secrets
from datetime import datetime, timedelta

import pyotp
import qrcode
import qrcode.image.svg
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.services.email_service import (
    send_mfa_email,
    send_verification_email,
)


OTP_TTL_MINUTES = 10
OTP_RESEND_SECONDS = 60
MAX_OTP_ATTEMPTS = 5
MFA_TOKEN_TTL_MINUTES = 5


def utcnow() -> datetime:
    return datetime.utcnow()


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(email: str, otp: str) -> str:
    message = f"{email.lower()}:{otp}".encode()
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def otp_matches(user: User, otp: str) -> bool:
    if not user.otp_code:
        return False

    candidate = hash_otp(user.email, otp)
    return hmac.compare_digest(user.otp_code, candidate)


def assign_otp(user: User, otp: str | None = None) -> str:
    code = otp or generate_otp()
    user.otp_code = hash_otp(user.email, code)
    user.otp_expires_at = utcnow() + timedelta(minutes=OTP_TTL_MINUTES)
    user.otp_attempts = 0
    user.otp_last_sent_at = utcnow()
    return code


def clear_otp(user: User):
    user.otp_code = None
    user.otp_expires_at = None
    user.otp_attempts = 0


def seconds_until_resend_allowed(user: User) -> int:
    if not user.otp_last_sent_at:
        return 0

    elapsed = (utcnow() - user.otp_last_sent_at).total_seconds()
    return max(0, OTP_RESEND_SECONDS - int(elapsed))


def verify_otp(user: User, otp: str) -> tuple[bool, str]:
    if not user.otp_code or not user.otp_expires_at:
        return False, "No active verification code. Request a new OTP."

    if utcnow() > user.otp_expires_at:
        clear_otp(user)
        return False, "Verification code expired. Request a new OTP."

    if user.otp_attempts >= MAX_OTP_ATTEMPTS:
        clear_otp(user)
        return False, "Too many invalid attempts. Request a new OTP."

    if not otp_matches(user, otp):
        user.otp_attempts = (user.otp_attempts or 0) + 1
        remaining = MAX_OTP_ATTEMPTS - user.otp_attempts
        if remaining <= 0:
            clear_otp(user)
            return False, "Too many invalid attempts. Request a new OTP."
        return False, f"Invalid verification code. {remaining} attempts remaining."

    clear_otp(user)
    return True, "Verification successful."


def send_user_verification_otp(db: Session, user: User) -> int:
    """Send verification OTP.

    Must never crash registration even if email delivery fails.
    """
    try:
        code = assign_otp(user)
        db.commit()

        email_sent = send_verification_email(user.email, code)
        if not email_sent:
            print(
                f"[OTP] Email not sent for {user.email}. "
                f"OTP stored in DB for resend/verification."
            )

    except Exception as e:
        # Do not re-raise; registration flow should continue.
        print(
            f"[OTP ERROR] Failed sending verification OTP for {getattr(user, 'email', None)}: {e}"
        )

    return OTP_RESEND_SECONDS



def send_user_mfa_otp(db: Session, user: User) -> int:
    code = assign_otp(user)
    db.commit()
    send_mfa_email(user.email, code)
    return OTP_RESEND_SECONDS


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(encrypted_secret: str) -> str:
    return _fernet().decrypt(encrypted_secret.encode()).decode()


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def build_totp_qr_data_url(email: str, secret: str) -> tuple[str, str]:
    issuer = "WorkflowOS"
    uri = pyotp.TOTP(secret).provisioning_uri(
        name=email,
        issuer_name=issuer,
    )

    qr = qrcode.QRCode(
        image_factory=qrcode.image.svg.SvgPathImage,
        border=2,
    )
    qr.add_data(uri)
    qr.make(fit=True)

    image = qr.make_image()
    buffer = io.BytesIO()
    image.save(buffer)
    encoded = base64.b64encode(buffer.getvalue()).decode()
    return uri, f"data:image/svg+xml;base64,{encoded}"


def verify_totp(secret: str, code: str) -> bool:
    normalized_secret = secret.replace(" ", "").upper()
    normalized_code = "".join(
        character for character in code if character.isdigit()
    )

    if len(normalized_code) != 6:
        return False

    return pyotp.TOTP(normalized_secret).verify(
        normalized_code,
        valid_window=4,
    )
