from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_current_user
from app.models.user import User
from app.services.comment_service import (
    create_comment,
    delete_comment,
    list_comments,
    update_comment,
)
from app.services.realtime_service import schedule_global_event, schedule_project_event
from app.services.automation_service import schedule_trigger


router = APIRouter()


class CommentPayload(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    parent_id: int | None = None


@router.get("/tasks/{task_id}/comments")
def get_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    return list_comments(db, task_id, current_user, role)


@router.post("/tasks/{task_id}/comments")
def add_task_comment(
    task_id: int,
    payload: CommentPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    comment = create_comment(
        db=db,
        task_id=task_id,
        body=payload.body,
        parent_id=payload.parent_id,
        user=current_user,
        role=role,
    )
    schedule_project_event(
        comment.task.project_id,
        "comment.created",
        {"comment_id": comment.id, "task_id": task_id},
    )
    schedule_global_event(
        "analytics.updated",
        {"source": "comment.created", "comment_id": comment.id, "task_id": task_id},
    )
    schedule_trigger(
        "comment.added",
        {
            "comment_id": comment.id,
            "task_id": task_id,
            "project_id": comment.task.project_id,
            "actor_id": current_user.id,
            "entity_type": "comment",
            "entity_id": comment.id,
            "message": payload.body,
        },
    )
    return comment



@router.put("/comments/{comment_id}")
def edit_comment(
    comment_id: int,
    payload: CommentPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    comment = update_comment(
        db=db,
        comment_id=comment_id,
        body=payload.body,
        user=current_user,
        role=role,
    )
    schedule_project_event(
        comment.task.project_id,
        "comment.updated",
        {"comment_id": comment.id, "task_id": comment.task_id},
    )
    return comment



@router.delete("/comments/{comment_id}")
def remove_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    result = delete_comment(db, comment_id, current_user, role)

    # Best-effort: deletion payload includes minimal identifiers.
    schedule_project_event(None, "comment.deleted", {"comment_id": comment_id})

    return result
