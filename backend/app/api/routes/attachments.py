from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.attachment import Attachment
from app.models.user import User
from app.services.attachment_service import (
    delete_attachment,
    save_upload,
    ensure_can_download_attachment,
    get_storage_path,
)
from app.services.realtime_service import schedule_global_event, schedule_project_event
from app.services.activity_service import create_activity
from app.services.automation_service import schedule_trigger


router = APIRouter()


@router.post("/")
def upload_attachment(
    file: UploadFile = File(...),
    project_id: int | None = None,
    task_id: int | None = None,
    comment_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachment = save_upload(
        db=db,
        file=file,
        user=current_user,
        project_id=project_id,
        task_id=task_id,
        comment_id=comment_id,
    )

    schedule_project_event(
        attachment.project_id,
        "attachment.created",
        {"attachment_id": attachment.id, "task_id": attachment.task_id},
    )
    schedule_global_event(
        "analytics.updated",
        {"source": "attachment.created", "attachment_id": attachment.id, "project_id": attachment.project_id},
    )

    # For realtime-driven activity feed updates
    create_activity(
        db=db,
        action_type="attachment_uploaded",
        message=f"{current_user.full_name} uploaded {attachment.original_filename}.",
        user_id=current_user.id,
        project_id=attachment.project_id,
        task_id=attachment.task_id,
        entity_type="attachment",
        entity_id=attachment.id,
    )

    schedule_trigger(
        "attachment.uploaded",
        {
            "attachment_id": attachment.id,
            "task_id": attachment.task_id,
            "project_id": attachment.project_id,
            "actor_id": current_user.id,
            "entity_type": "attachment",
            "entity_id": attachment.id,
            "message": attachment.original_filename,
        },
    )

    return attachment


@router.get("/")
def list_attachments(
    project_id: int | None = None,
    task_id: int | None = None,
    comment_id: int | None = None,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    # RBAC/membership enforcement happens inside query scoping.
    query = db.query(Attachment)

    if project_id:
        query = query.filter(Attachment.project_id == project_id)
    if task_id:
        query = query.filter(Attachment.task_id == task_id)
    if comment_id:
        query = query.filter(Attachment.comment_id == comment_id)

    attachments = query.order_by(Attachment.uploaded_at.desc()).all()

    # Filter by access
    accessible = []
    for a in attachments:
        try:
            ensure_can_download_attachment(db, a, current_user)
            accessible.append(a)
        except Exception:
            continue

    return accessible


@router.get("/{attachment_id}/preview")
def preview_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    ensure_can_download_attachment(db, attachment, current_user)

    # For now preview is served by the same file endpoint; frontend will render based on mime_type.
    # This endpoint logs activity without forcing download.
    create_activity(
        db=db,
        action_type="file_previewed",
        message=f"{current_user.full_name} previewed {attachment.original_filename}.",
        user_id=current_user.id,
        project_id=attachment.project_id,
        task_id=attachment.task_id,
        entity_type="attachment",
        entity_id=attachment.id,
    )

    storage_path = get_storage_path(attachment)
    return {
        "attachment_id": attachment.id,
        "mime_type": attachment.mime_type,
        "original_filename": attachment.original_filename,
        "file_size": attachment.file_size,
        "preview_available": bool(attachment.preview_available),
        "download_url": f"/api/v1/attachments/{attachment.id}/download",
        "path": storage_path,
    }


@router.get("/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    ensure_can_download_attachment(db, attachment, current_user)

    create_activity(
        db=db,
        action_type="file_downloaded",
        message=f"{current_user.full_name} downloaded {attachment.original_filename}.",
        user_id=current_user.id,
        project_id=attachment.project_id,
        task_id=attachment.task_id,
        entity_type="attachment",
        entity_id=attachment.id,
    )

    storage_path = get_storage_path(attachment)
    return FileResponse(
        storage_path,
        media_type=attachment.mime_type or attachment.content_type,
        filename=attachment.original_filename,
    )


@router.delete("/{attachment_id}")
def remove_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Restrict: uploader or project member; role bypass can be handled via membership check.
    # Use delete service for permission enforcement.
    schedule_project_event(
        attachment.project_id,
        "attachment.deleted",
        {"attachment_id": attachment.id, "task_id": attachment.task_id},
    )

    result = delete_attachment(db, attachment, user=current_user)
    return result
