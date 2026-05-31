from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class WorkflowTrigger(Base):
    __tablename__ = "workflow_triggers"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    entity_type = Column(String, nullable=True)
    is_system = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    trigger_type = Column(String, nullable=False, index=True)
    conditions_json = Column(Text, nullable=True)
    actions_json = Column(Text, nullable=False)
    scope = Column(String, default="personal", index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    enabled = Column(Boolean, default=True, index=True)
    run_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project")
    owner = relationship("User")
    executions = relationship(
        "AutomationExecution",
        back_populates="rule",
        cascade="all, delete-orphan",
        order_by="AutomationExecution.created_at.desc()",
    )


class AutomationExecution(Base):
    __tablename__ = "automation_executions"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("automation_rules.id"), nullable=False, index=True)
    trigger_type = Column(String, nullable=False, index=True)
    status = Column(String, default="queued", index=True)
    input_json = Column(Text, nullable=True)
    output_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    rule = relationship("AutomationRule", back_populates="executions")
