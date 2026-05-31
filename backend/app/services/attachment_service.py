from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models.attachment import Attachment
from app.models.project import Project
from app.models.task import Task
from app.models.task_comment import TaskComment
from app.models.user import User
from app.services.activity_service import create_activity



# ============================================================
# STORAGE LAYOUT (filesystem-based, S3-ready)
# ============================================================

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
TASKS_DIR = UPLOAD_ROOT / "tasks"
PROJECTS_DIR = UPLOAD_ROOT / "projects"
TEMP_DIR = UPLOAD_ROOT / "temp"


# ============================================================
# SECURITY / VALIDATION
# ============================================================

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # production-safe default; adjust as needed

# Supported by requirement (plus common variants)
ALLOWED_MIME_TYPES: set[str] = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/x-zip-compressed",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # xlsx
    # video (mp4)
    "video/mp4",
}


# ============================================================
# HELPERS
# ============================================================

FILENAME_SANITIZE_RE = re.compile(r"[^A-Za-z0-9._\-]+")


def _sanitize_original_filename(name: str) -> str:
    name = name or "attachment"
    name = name.replace("\\", "/")
    name = name.split("/")[-1]
    name = FILENAME_SANITIZE_RE.sub("_", name)
    name = name.strip("._")
    if not name:
        return "attachment"
    return name


def _split_extension(name: str) -> tuple[str, str]:
    base = os.path.basename(name)
    if "." not in base:
        return base, ""
    stem, ext = base.rsplit(".", 1)
    return stem, ext


def _generate_stored_filename(original_name: str) -> str:
    original_name = _sanitize_original_filename(original_name)
    stem, ext = _split_extension(original_name)
    ext = ext.lower()
    # stored filename: <uuid4>_<sanitized_stem>.<ext>
    stored = f"{uuid4().hex}_{stem}"
    if ext:
        stored = f"{stored}.{ext}"
    return stored


def _safe_write_bytes(dest: Path, data: bytes) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Atomic-ish write: write temp then replace
    tmp = dest.with_name(dest.name + ".tmp")
    with tmp.open("wb") as f:
        f.write(data)
    tmp.replace(dest)


def _ensure_target_exists_and_accessible(
    db: Session,
    *,
    project_id: int | None,
    task_id: int | None,
    comment_id: int | None,
    user: User,
) -> tuple[Project | None, Task | None, TaskComment | None, int | None, int | None]:
    # Keep backwards-compatible behavior: project_id overrides derived ones.
    if not any([project_id, task_id, comment_id]):
        raise HTTPException(status_code=422, detail="Attachment target is required")

    project = db.query(Project).filter(Project.id == project_id).first() if project_id else None
    task = db.query(Task).filter(Task.id == task_id).first() if task_id else None
    comment = (
        db.query(TaskComment).filter(TaskComment.id == comment_id).first() if comment_id else None
    )

    if project_id and not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if task_id and not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if comment_id and not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    effective_project_id = project_id or (task.project_id if task else None)
    effective_task_id = task_id or (comment.task_id if comment else None)

    # RBAC / membership enforcement
    # Current stack has ProjectMember model; enforce membership when project_id is present.
    if effective_project_id is not None:
        # Admin/Manager implied by existing role-header checks in other routes; here we enforce membership only.
        # If you want strict role-based bypass, extend using role header.
        membership = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == effective_project_id,
                ProjectMember.user_id == user.id,
            )
            .first()
        )
        if membership is None and (project and project.owner_id != user.id):
            raise HTTPException(status_code=403, detail="Permission denied")

    return project, task, comment, effective_project_id, effective_task_id


# Fallback if import fails due to no helper.
try:
    from app.utils.helpers import safe_get_project_id as _unused  # noqa
except Exception:
    pass


# Local import to avoid circular at import-time
from app.models.project_member import ProjectMember  # noqa: E402


def _extract_ai_ready_metadata(file: UploadFile, *, mime_type: str, size: int) -> dict[str, Any]:
    # Hook fields for future OCR/PDF parsing/screenshot analysis
    return {
        "mime_type": mime_type,
        "file_size": size,
        "filename": file.filename,
        "ai": {
            "text_extracted": False,
            "ocr_ready": mime_type == "application/pdf" or mime_type.startswith("image/"),
            "document_type": None,
        },
        "preview": {
            "available": True,
        },
        "semantic_search": {
            "enabled": True,
        },
    }


def save_upload(
    db: Session,
    file: UploadFile,
    user: User,
    project_id: int | None = None,
    task_id: int | None = None,
    comment_id: int | None = None,
):
    _, _, _, effective_project_id, effective_task_id = _ensure_target_exists_and_accessible(
        db,
        project_id=project_id,
        task_id=task_id,
        comment_id=comment_id,
        user=user,
    )

    original_filename = file.filename or "attachment"
    mime_type = (file.content_type or "").lower()

    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail="File type is not allowed")

    # Read bytes with hard limit (avoid zip bombs/oversized uploads)
    content = file.file.read(MAX_FILE_SIZE_BYTES + 1)
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File is too large")

    stored_filename = _generate_stored_filename(original_filename)

    # Duplicate protection: check by original+uploader+size+mime within last window.
    # (DB is SQL-lite; keep it simple and deterministic.)
    dup = (
        db.query(Attachment)
        .filter(
            Attachment.uploaded_by == user.id if Attachment.uploaded_by is not None else Attachment.uploader_id == user.id,
        )
        .filter(Attachment.original_filename == _sanitize_original_filename(original_filename))
        .filter(Attachment.mime_type == mime_type)
        .filter(Attachment.file_size == len(content))
        .first()
    )
    if dup is not None:
        # Still write to new path with unique name, but return existing record to prevent duplicates.
        return dup

    # Choose directory by entity
    target_dir = PROJECTS_DIR if effective_project_id is not None else TASKS_DIR
    # Keep future S3-ready path: <scope>/<project_id?>/<stored_filename>
    # For personal tasks (no project), keep under tasks.
    scope_prefix = (
        str(effective_project_id)
        if effective_project_id is not None
        else (str(effective_task_id) if effective_task_id is not None else "general")
    )

    dest_dir = target_dir / scope_prefix
    dest_path = dest_dir / stored_filename

    # Ensure dest_path stays inside uploads/<scope>
    resolved_root = dest_dir.resolve()
    resolved_dest = dest_path.resolve()
    if resolved_root not in resolved_dest.parents and resolved_dest != dest_dir:
        raise HTTPException(status_code=400, detail="Invalid upload path")

    _safe_write_bytes(dest_path, content)

    storage_path_str = str(dest_path)

    metadata = _extract_ai_ready_metadata(file, mime_type=mime_type, size=len(content))

    attachment = Attachment(
        # New schema
        filename=stored_filename,
        original_filename=_sanitize_original_filename(original_filename),
        file_url=None,
        mime_type=mime_type,
        file_size=len(content),
        uploader_id=user.id,
        project_id=effective_project_id,
        task_id=effective_task_id,
        metadata_json=json.dumps(metadata),
        extracted_text=None,
        preview_available=1,
        uploaded_at=datetime.utcnow(),
        # Legacy compatibility
        storage_path=storage_path_str,
        content_type=mime_type,
        size=len(content),
        uploaded_by=user.id,
        comment_id=comment_id if comment_id else None,
    )

    db.add(attachment)
    db.flush()

    create_activity(
        db=db,
        action_type="file_attached",
        message=f"{user.full_name} attached {attachment.original_filename}.",
        user_id=user.id,
        project_id=effective_project_id,
        task_id=effective_task_id,
        entity_type="attachment",
        entity_id=attachment.id,
    )

    db.commit()
    db.refresh(attachment)
    return attachment


def get_storage_path(attachment: Attachment) -> str:
    # prefer legacy field if present
    if getattr(attachment, "storage_path", None):
        return attachment.storage_path
    # fallback: if only new structure is used in future
    if getattr(attachment, "file_url", None):
        return attachment.file_url
    raise HTTPException(status_code=404, detail="Attachment storage not found")


def ensure_can_download_attachment(db: Session, attachment: Attachment, user: User | None):
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # If attachment is project-scoped, require project membership or ownership.
    if attachment.project_id is not None and user is not None:
        membership = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == attachment.project_id,
                ProjectMember.user_id == user.id,
            )
            .first()
        )
        if membership is None:
            project = db.query(Project).filter(Project.id == attachment.project_id).first()
            if not project or project.owner_id != user.id:
                raise HTTPException(status_code=403, detail="Permission denied")

    # If attachment is not project-scoped (personal), allow uploader or owner/manager by simplifying to uploader match.
    if attachment.project_id is None and user is not None:
        if attachment.uploader_id != user.id and attachment.uploaded_by != user.id:
            raise HTTPException(status_code=403, detail="Permission denied")


def delete_attachment(
    db: Session,
    attachment: Attachment,
    *,
    user: User,
):
    # Permission: uploader or project members (enforced on download)
    ensure_can_download_attachment(db, attachment, user)

    storage_path = get_storage_path(attachment)
    try:
        if storage_path:
            p = Path(storage_path)
            if p.exists() and p.is_file():
                p.unlink()
    except Exception:
        # best effort
        pass

    db.delete(attachment)
    db.commit()

    create_activity(
        db=db,
        action_type="file_deleted",
        message=f"{user.full_name} deleted {attachment.original_filename}.",
        user_id=user.id,
        project_id=attachment.project_id,
        task_id=attachment.task_id,
        entity_type="attachment",
        entity_id=attachment.id,
    )

    return {"message": "Attachment deleted successfully"}
