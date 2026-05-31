from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.services.demo_seed_service import seed_demo_for_user


router = APIRouter(prefix="/demo", tags=["Demo"])

logger = logging.getLogger(__name__)


@router.post("/seed")
def seed_demo(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = seed_demo_for_user(db, current_user)
        return {
            "success": True,
            "seeded": result.seeded,
            "details": result.details,
        }
    except Exception as exc:
        logger.exception(
            "Demo seed failed user_id=%s error=%s",
            current_user.id,
            str(exc),
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to create demo workspace right now. Please try again.",
        )

