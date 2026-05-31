from sqlalchemy import (
    Column,
    Integer,
    ForeignKey,
    String,
)

from sqlalchemy.orm import relationship

from app.core.database import Base


class ProjectMember(Base):

    __tablename__ = "project_members"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    project_id = Column(
        Integer,
        ForeignKey("projects.id")
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id")
    )

    role = Column(
        String,
        default="Viewer"
    )


    project = relationship(
        "Project",
        back_populates="members"
    )

    user = relationship(
        "User",
        back_populates="project_memberships"
    )
