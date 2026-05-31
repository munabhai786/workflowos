import json

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.services.realtime_service import schedule_user_event


def create_notification(
    db: Session,
    user_id: int | None,
    title: str,
    message: str,
    type: str = "info",
    severity: str = "low",
    priority: str = "normal",
    entity_type: str | None = None,
    entity_id: int | None = None,
    metadata: dict | None = None,
):
    if not user_id:
        return None

    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        severity=severity,
        priority=priority,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=json.dumps(metadata or {}),
        is_read=False,
    )

    db.add(notification)

    return notification


def deliver_notification(db: Session, notification: Notification | None):
    if notification is None:
        return None

    db.flush()
    metadata = {}
    if notification.metadata_json:
        try:
            metadata = json.loads(notification.metadata_json)
        except Exception:
            metadata = {}

    schedule_user_event(
        notification.user_id,
        "notification.created",
        {
            "notification_id": notification.id,
            "title": notification.title,
            "message": notification.message,
            "type": notification.type,
            "severity": notification.severity,
            "priority": notification.priority,
            "entity_type": notification.entity_type,
            "entity_id": notification.entity_id,
            "actions": metadata.get("actions", []),
            "created_at": notification.created_at,
            "is_read": notification.is_read,
            "user_id": notification.user_id,
        },
    )
    return notification
