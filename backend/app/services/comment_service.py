import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.task import Task
from app.models.task_comment import TaskComment
from app.models.user import User
from app.services.activity_service import create_activity
from app.services.notification_service import create_notification, deliver_notification

MENTION_PATTERN = re.compile(r"@([A-Za-z0-9_.-]+)")
MANAGEMENT_ROLES = ["Admin", "Manager"]


def resolve_mentioned_users(db: Session, task: Task, handles: list[str]) -> list[int]:
    """MVP mention resolution: match by user.handle OR full_name tokens.
    Falls back to no notifications to avoid regressions.
    """
    if not handles:
        return []

    # Collect unique user ids from project membership.
    q = db.query(User).filter(User.project_id == task.project_id) if hasattr(User, "project_id") else None
    # If model doesn't support project_id, fall back to broad search (best-effort).
    if q is None:
        pass

    mentioned_ids: set[int] = set()
    users = db.query(User).all()
    handle_set = set(h.lower() for h in handles if h)
    for u in users:
        # user.username may not exist; use common fields defensively.
        possible = []
        for attr in ["username", "handle", "slug", "email"]:
            if hasattr(u, attr):
                val = getattr(u, attr)
                if isinstance(val, str) and val:
                    possible.append(val.lower())
        if hasattr(u, "full_name") and isinstance(u.full_name, str):
            possible.append(u.full_name.lower())

        if any(p in handle_set for p in possible):
            mentioned_ids.add(u.id)

    # Never notify author.
    return list(mentioned_ids)



def extract_mentions(body: str):
    return ",".join(sorted(set(MENTION_PATTERN.findall(body or ""))))


def can_access_task(db: Session, task: Task, user: User | None, role: str | None):
    if role in MANAGEMENT_ROLES:
        return True

    if not user:
        return False

    return task.assigned_to == user.id or task.project and task.project.owner_id == user.id


def can_mutate_comment(comment: TaskComment, user: User | None, role: str | None):
    return role in MANAGEMENT_ROLES or (user and comment.author_id == user.id)


def list_comments(db: Session, task_id: int, user: User | None, role: str | None):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_access_task(db, task, user, role):
        raise HTTPException(status_code=403, detail="Permission denied")

    return (
        db.query(TaskComment)
        .options(joinedload(TaskComment.author), joinedload(TaskComment.attachments))
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc())
        .all()
    )


def create_comment(
    db: Session,
    task_id: int,
    body: str,
    parent_id: int | None,
    user: User,
    role: str | None,
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_access_task(db, task, user, role):
        raise HTTPException(status_code=403, detail="Permission denied")

    if parent_id:
        parent = (
            db.query(TaskComment)
            .filter(TaskComment.id == parent_id, TaskComment.task_id == task_id)
            .first()
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")

    comment = TaskComment(
        task_id=task_id,
        author_id=user.id,
        parent_id=parent_id,
        body=body.strip(),
        mentions=extract_mentions(body),
    )
    db.add(comment)
    db.flush()

    create_activity(
        db=db,
        action_type="comment_added",
        message=f"{user.full_name} commented on task {task.title}.",
        user_id=user.id,
        project_id=task.project_id,
        task_id=task.id,
        entity_type="comment",
        entity_id=comment.id,
    )

    # Mention notifications (MVP, best-effort). Never block comment creation.
    try:
        handles: list[str] = []
        if isinstance(comment.mentions, str) and comment.mentions.strip():
            handles = [h.strip() for h in comment.mentions.split(",") if h.strip()]

        if handles:
            mentioned_user_ids = resolve_mentioned_users(db, task, handles)
            for mentioned_user_id in mentioned_user_ids:
                if mentioned_user_id == user.id:
                    continue

                notif = create_notification(
                    db=db,
                    user_id=mentioned_user_id,
                    title="Mentioned in a task comment",
                    message=f"{user.full_name} mentioned you in a discussion on {task.title}.",
                    type="mention_alert",
                    severity="info",
                    priority="normal",
                    entity_type="comment",
                    entity_id=comment.id,
                    metadata={
                        "task_id": task.id,
                        "project_id": task.project_id,
                        "comment_id": comment.id,
                        "mentions": handles,
                    },
                )
                if notif is not None:
                    deliver_notification(db, notif)
    except Exception:
        pass

    db.commit()
    db.refresh(comment)
    return comment



def update_comment(
    db: Session,
    comment_id: int,
    body: str,
    user: User,
    role: str | None,
):
    comment = db.query(TaskComment).filter(TaskComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not can_mutate_comment(comment, user, role):
        raise HTTPException(status_code=403, detail="Permission denied")

    comment.body = body.strip()
    comment.mentions = extract_mentions(body)
    comment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, comment_id: int, user: User, role: str | None):
    comment = db.query(TaskComment).filter(TaskComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not can_mutate_comment(comment, user, role):
        raise HTTPException(status_code=403, detail="Permission denied")

    db.delete(comment)
    db.commit()
    return {"message": "Comment deleted successfully"}
