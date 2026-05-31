from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
)

from sqlalchemy.orm import relationship

from datetime import datetime

from app.core.database import Base


class User(Base):

    __tablename__ = "users"


    # =========================
    # BASIC INFO
    # =========================

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    full_name = Column(
        String,
        nullable=False
    )

    email = Column(
        String,
        unique=True,
        nullable=False,
        index=True
    )

    password = Column(
        String,
        nullable=False
    )

    role = Column(
        String,
        default="Team Member"
    )


    # =========================
    # EMAIL VERIFICATION
    # =========================

    is_verified = Column(
        Boolean,
        default=False
    )

    otp_code = Column(
        String,
        nullable=True
    )

    otp_expires_at = Column(
        DateTime,
        nullable=True
    )

    otp_attempts = Column(
        Integer,
        default=0
    )

    otp_last_sent_at = Column(
        DateTime,
        nullable=True
    )

    pending_invitation_token = Column(
        String,
        nullable=True
    )


    # =========================
    # MFA SETTINGS
    # =========================

    two_factor_enabled = Column(
        Boolean,
        default=False
    )

    two_factor_method = Column(
        String,
        nullable=True
    )

    google_auth_secret = Column(
        String,
        nullable=True
    )


    # =========================
    # TIMESTAMPS
    # =========================

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


    # =========================
    # RELATIONSHIPS
    # =========================

    owned_projects = relationship(
        "Project",
        back_populates="owner",
        cascade="all, delete-orphan"
    )

    project_memberships = relationship(
        "ProjectMember",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    notifications = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    comments = relationship(
        "TaskComment",
        back_populates="author",
        cascade="all, delete-orphan"
    )

    attachments = relationship(
        "Attachment",
        back_populates="uploader",
        cascade="all, delete-orphan",
        foreign_keys="Attachment.uploader_id",
    )

