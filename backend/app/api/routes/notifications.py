import json

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationCreate
from app.services.notification_service import create_notification as notify
from app.services.notification_service import deliver_notification
from app.services.realtime_service import schedule_global_event
from app.services.smart_notification_service import run_smart_notification_scan

from app.utils.helpers import success_response



router = APIRouter()


@router.get("/")
def get_notifications(
    unread: bool | None = Query(None),
    type: str | None = Query(None),
    severity: str | None = Query(None),
    priority: str | None = Query(None),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    run_smart_notification_scan(db, current_user, role)

    query = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
    )

    if unread is not None:
        query = query.filter(Notification.is_read == unread)
    if type:
        query = query.filter(Notification.type == type)
    if severity:
        query = query.filter(Notification.severity == severity)
    if priority:
        query = query.filter(Notification.priority == priority)

    notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()

    grouped = {}
    for notification in notifications:
        key = notification.entity_type or notification.type or "general"
        grouped.setdefault(key, 0)
        grouped[key] += 1

    return success_response({
        "items": [serialize_notification(notification) for notification in notifications],
        "groups": grouped,
        "unread_count": (
            db.query(Notification)
            .filter(Notification.user_id == current_user.id)
            .filter(Notification.is_read == False)
            .count()
        ),
    })


def serialize_notification(notification: Notification):
    metadata = {}
    if notification.metadata_json:
        try:
            metadata = json.loads(notification.metadata_json)
        except Exception:
            metadata = {}

    return {
        "id": notification.id,
        "title": notification.title,
        "message": notification.message,
        "type": notification.type,
        "severity": notification.severity,
        "priority": notification.priority,
        "entity_type": notification.entity_type,
        "entity_id": notification.entity_id,
        "metadata": metadata,
        "actions": metadata.get("actions", []),
        "is_read": notification.is_read,
        "user_id": notification.user_id,
        "created_at": notification.created_at,
    }


@router.post("/")
def create_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = notify(
        db=db,
        user_id=current_user.id,
        title=payload.title,
        message=payload.message,
        type=payload.type,
        severity=payload.severity,
        priority=payload.priority,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        metadata=payload.metadata,
    )

    db.commit()
    db.refresh(notification)
    deliver_notification(db, notification)

    # Realtime notification (targeted)
    # Legacy project event scheduler maps to project rooms.
    # For notifications, use notifications:{user_id} via a direct publish.
    schedule_global_event(
        "notification.created",
        {
            "notification_id": notification.id,
            "title": notification.title,
            "message": notification.message,
            "type": notification.type,
            "severity": notification.severity,
            "created_at": notification.created_at,
            "is_read": notification.is_read,
            "user_id": notification.user_id,
        },
    )

    schedule_global_event(
        "activity.created",
        {"project_id": None, "notification_id": notification.id},
    )

    return success_response(
        serialize_notification(notification),
        "Notification created successfully",
        201,
    )




@router.put("/{notification_id}/read")
@router.patch("/{notification_id}/read")
def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id)
        .filter(Notification.user_id == current_user.id)
        .first()
    )

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    notification.is_read = True

    db.commit()
    db.refresh(notification)

    return success_response(
        serialize_notification(notification),
        "Notification marked as read",
    )


@router.put("/read-all")
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .filter(Notification.is_read == False)
        .update({"is_read": True})
    )

    db.commit()

    return success_response(
        message="All notifications marked as read",
    )


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id)
        .filter(Notification.user_id == current_user.id)
        .first()
    )

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    db.delete(notification)
    db.commit()

    return success_response(
        message="Notification deleted",
    )
