from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Text,
)

from sqlalchemy.orm import relationship

from datetime import datetime

from app.core.database import Base


class Activity(Base):

    __tablename__ = "activities"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )


    action = Column(
        String,
        nullable=False
    )


    action_type = Column(
        String,
        nullable=False
    )


    # IMPORTANT
    # KEEP message FOR DB COMPATIBILITY

    message = Column(
        Text,
        nullable=False
    )


    # OPTIONAL
    # legacy compatibility

    description = Column(
        Text,
        nullable=True
    )


    entity_type = Column(
        String,
        nullable=True
    )


    entity_id = Column(
        Integer,
        nullable=True
    )


    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )


    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=True
    )


    task_id = Column(
        Integer,
        ForeignKey("tasks.id"),
        nullable=True
    )


    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


    # RELATIONSHIPS

    user = relationship(
        "User"
    )


    project = relationship(
        "Project"
    )


    task = relationship(
        "Task"
    )