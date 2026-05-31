from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("task_comments.id"), nullable=True)
    body = Column(Text, nullable=False)
    mentions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=True)

    task = relationship("Task", back_populates="comments")
    author = relationship("User", back_populates="comments")
    parent = relationship("TaskComment", remote_side=[id], backref="replies")
    attachments = relationship(
        "Attachment",
        back_populates="comment",
        cascade="all, delete-orphan",
        primaryjoin="TaskComment.id == Attachment.comment_id",
    )
