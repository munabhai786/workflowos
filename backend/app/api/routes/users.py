import base64

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.database import get_db, engine
from app.core.deps import get_current_user
from app.core.security import (
    get_password_hash,
    verify_password,
)
from app.models.user import User
from app.schemas.user import (
    PasswordUpdateRequest,
    UserProfileUpdate,
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


def serialize_user(user: User, avatar_url: str | None = None) -> dict:
    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "avatar_url": avatar_url,
        "role": user.role,
    }


@router.get("/")
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()

    return users


@router.post("/upload-avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_types = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    ]

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only JPG, PNG, WEBP, and GIF images are allowed."
            ),
        )

    file_bytes = await file.read()

    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Image too large. Maximum 5MB.",
        )

    b64_string = base64.b64encode(file_bytes).decode("utf-8")
    avatar_url = f"data:{file.content_type};base64,{b64_string}"

    ensure_avatar_column()
    db.execute(
        text(
            """
            UPDATE users
            SET avatar_url = :avatar_url
            WHERE id = :user_id
            """
        ),
        {
            "avatar_url": avatar_url,
            "user_id": current_user.id,
        },
    )
    db.commit()
    db.refresh(current_user)

    return {
        "message": "Profile picture updated",
        "avatar_url": avatar_url,
    }


@router.put("/profile")
def update_profile(
    data: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.full_name:
        current_user.full_name = data.full_name

    if data.email:
        existing = (
            db.query(User)
            .filter(
                User.email == data.email.lower(),
                User.id != current_user.id,
            )
            .first()
        )

        if existing:
            raise HTTPException(
                status_code=400,
                detail="Email already in use by another account.",
            )

        current_user.email = data.email.lower()

    db.commit()
    db.refresh(current_user)

    return {
        "message": "Profile updated successfully",
        "user": serialize_user(
            current_user,
            get_avatar_url(db, current_user.id),
        ),
    }


@router.put("/password")
def update_password(
    data: PasswordUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    password_is_correct = verify_password(
        data.current_password,
        current_user.password,
    )

    if not password_is_correct:
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect.",
        )

    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 8 characters long.",
        )

    if data.new_password == data.current_password:
        raise HTTPException(
            status_code=400,
            detail=(
                "New password must be different from your current password."
            ),
        )

    current_user.password = get_password_hash(data.new_password)

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return {
        "message": "Password updated successfully",
    }
