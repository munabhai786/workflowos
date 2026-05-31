from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text


# IMPORTANT:
# This codebase currently runs migrations inconsistently in SQLite.
# Older SQLite DBs may miss columns like `file_url`, but SQLAlchemy will still
# include them in SELECTs if they're mapped.
# To keep project deletion and other cascade flows operational across DBs,
# we keep legacy columns mapped and avoid runtime-breaking columns.



from sqlalchemy.orm import relationship


from app.core.database import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)

    # AI-ready core file properties
    filename = Column(String, nullable=False, index=True)  # stored filename
    original_filename = Column(String, nullable=False)

    # IMPORTANT: existing SQLite DB may not have file_url.
    # Keep this column NOT mapped so legacy DBs don't crash.
    # NOTE: real column should be added via migration when enabling S3/cloud.
    # Disabled in SQLite runtime by not mapping it.
    # (Kept as a class attribute only; not a SQLAlchemy Column.)
    file_url = None






    # SQLite compatibility:
    # Keep this runtime stable even if the DB schema is older than this model.



    mime_type = Column(String, nullable=False)

    file_size = Column(Integer, nullable=False)

    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Entity linkage
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)

    # Optional legacy link (kept for compatibility)
    comment_id = Column(Integer, ForeignKey("task_comments.id"), nullable=True, index=True)

    # Storage reference (filesystem-based for now)
    uploaded_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Extra metadata stored in DB (AI-ready)
    metadata_json = Column(Text, nullable=True)
    extracted_text = Column(Text, nullable=True)

    preview_available = Column(Integer, nullable=False, default=0)  # 0/1

    # Deprecated/legacy columns (kept to avoid breaking existing migrations/runtime)
    # Some parts of the app still reference `storage_path`/`content_type`/`size`/`uploaded_by`.
    storage_path = Column(String, nullable=True)
    content_type = Column(String, nullable=True)
    size = Column(Integer, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    uploader = relationship(
        "User",
        back_populates="attachments",
        foreign_keys=[uploader_id],
    )

    project = relationship(
        "Project",
        back_populates="attachments",
        foreign_keys=[project_id],
    )
    task = relationship(
        "Task",
        back_populates="attachments",
        foreign_keys=[task_id],
    )

    comment = relationship("TaskComment", back_populates="attachments")

