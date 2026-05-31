from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    goal = Column(Text, nullable=True)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    velocity = Column(Integer, default=0)
    committed_points = Column(Integer, default=0)
    completed_points = Column(Integer, default=0)
    status = Column(String, default="planned", index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="sprints")
    tasks = relationship(
        "SprintTask",
        back_populates="sprint",
        cascade="all, delete-orphan",
        order_by="SprintTask.position.asc()",
    )


class SprintTask(Base):
    __tablename__ = "sprint_tasks"

    id = Column(Integer, primary_key=True, index=True)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    sprint = relationship("Sprint", back_populates="tasks")
    task = relationship("Task", back_populates="sprint_links")
