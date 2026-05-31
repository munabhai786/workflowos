from fastapi import Depends
from fastapi import Header
from fastapi import HTTPException
from fastapi import status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login"
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    user_id = (
        payload.get("sub")
        or payload.get("user_id")
    )

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


def get_optional_current_user(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or not token:
        return None

    payload = decode_token(token)

    if not payload:
        return None

    user_id = (
        payload.get("sub")
        or payload.get("user_id")
    )

    if not user_id:
        return None

    return (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )
