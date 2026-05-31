from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
)

from datetime import datetime

from sqlalchemy.orm import relationship

from app.core.database import Base


class Project(Base):

    __tablename__ = "projects"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
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
        default="active"
    )

    start_date = Column(
        Date,
        nullable=True
    )

    end_date = Column(
        Date,
        nullable=True
    )

    progress = Column(
        Integer,
        default=0
    )

    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    email_sent = Column(
        Boolean,
        default=False
    )

    last_alert_at = Column(
        DateTime,
        nullable=True
    )

    alert_level = Column(
        String,
        default="none"
    )

    owner = relationship(
        "User",
        back_populates="owned_projects"
    )

    tasks = relationship(
        "Task",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    members = relationship(
        "ProjectMember",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    attachments = relationship(
        "Attachment",
        back_populates="project",
        cascade="all, delete-orphan",
        primaryjoin="Project.id == Attachment.project_id"
    )

    milestones = relationship(
        "Milestone",
        back_populates="project",
        cascade="all, delete-orphan"
    )

    sprints = relationship(
        "Sprint",
        back_populates="project",
        cascade="all, delete-orphan"
    )
