from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)

from datetime import datetime

from sqlalchemy.orm import relationship

from app.core.database import Base


class Notification(Base):

    __tablename__ = "notifications"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    title = Column(
        String,
        nullable=False
    )

    message = Column(
        String,
        nullable=False
    )

    type = Column(
        String,
        default="info"
    )

    severity = Column(
        String,
        default="low"
    )

    priority = Column(
        String,
        default="normal"
    )

    entity_type = Column(
        String,
        nullable=True
    )

    entity_id = Column(
        Integer,
        nullable=True
    )

    metadata_json = Column(
        Text,
        nullable=True
    )

    is_read = Column(
        Boolean,
        default=False
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    user = relationship(
        "User"
    )
