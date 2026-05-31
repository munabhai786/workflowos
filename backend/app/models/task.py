from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime,
    Text,
)

from datetime import datetime

from sqlalchemy.orm import relationship

from app.core.database import Base


class Task(Base):

    __tablename__ = "tasks"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    title = Column(
        String,
        nullable=False
    )

    description = Column(
        String,
        nullable=True
    )

    priority = Column(
        String,
        default="medium"
    )

    status = Column(
        String,
        default="todo"
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    due_date = Column(
        DateTime,
        nullable=True
    )

    scheduled_start = Column(
        DateTime,
        nullable=True
    )

    scheduled_end = Column(
        DateTime,
        nullable=True
    )

    estimate_points = Column(
        Integer,
        default=1
    )

    project_id = Column(
    Integer,
    ForeignKey("projects.id"),
    nullable=True
)

    assigned_to = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    position = Column(
        Integer,
        default=0
    )

    labels = Column(
        Text,
        nullable=True
    )


    assignee = relationship(
        "User"
    )

    project = relationship(
        "Project",
        back_populates="tasks"
    )

    comments = relationship(
        "TaskComment",
        back_populates="task",
        cascade="all, delete-orphan"
    )

    attachments = relationship(
        "Attachment",
        back_populates="task",
        cascade="all, delete-orphan",
        primaryjoin="Task.id == Attachment.task_id"
    )

    sprint_links = relationship(
        "SprintTask",
        back_populates="task",
        cascade="all, delete-orphan"
    )
