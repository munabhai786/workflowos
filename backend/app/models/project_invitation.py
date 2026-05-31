from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime,
)

from sqlalchemy.orm import relationship

from datetime import datetime, timedelta

from app.core.database import Base


class ProjectInvitation(Base):

    __tablename__ = "project_invitations"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    email = Column(
        String,
        nullable=False
    )

    role = Column(
        String,
        default="Viewer"
    )

    token = Column(
        String,
        unique=True,
        nullable=False
    )

    status = Column(
        String,
        default="pending"
    )

    project_id = Column(
        Integer,
        ForeignKey("projects.id")
    )

    invited_by = Column(
        Integer,
        ForeignKey("users.id")
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    expires_at = Column(
        DateTime,
        default=lambda: datetime.utcnow() + timedelta(days=7)
    )

    accepted_at = Column(
        DateTime,
        nullable=True
    )


    # RELATIONSHIPS

    project = relationship(
        "Project"
    )

    inviter = relationship(
        "User"
    )