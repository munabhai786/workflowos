import base64
import hashlib
import hmac
import secrets
from functools import lru_cache

from cryptography.fernet import Fernet

from app.core.config import settings


@lru_cache(maxsize=1)
def _fernet():
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")


def hash_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_secret(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(32)}"


def verify_hmac_sha256(secret: str, raw_body: bytes, signature: str | None, prefix: str = "") -> bool:
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    candidate = signature.removeprefix(prefix) if prefix else signature
    return hmac.compare_digest(expected, candidate)
