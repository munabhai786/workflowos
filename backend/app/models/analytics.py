from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class AnalyticsSnapshot(Base):
    __tablename__ = "analytics_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    scope = Column(String, default="organization", index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    health_score = Column(Integer, default=0)
    delivery_confidence = Column(Integer, default=0)
    productivity_score = Column(Integer, default=0)
    metrics_json = Column(Text, nullable=True)
    summary_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    project = relationship("Project")
    user = relationship("User")


class ProductivityMetric(Base):
    __tablename__ = "productivity_metrics"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    score = Column(Integer, default=0)
    completed_tasks = Column(Integer, default=0)
    overdue_tasks = Column(Integer, default=0)
    collaboration_events = Column(Integer, default=0)
    focus_score = Column(Integer, default=0)
    period = Column(String, default="daily", index=True)
    metrics_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class SprintMetric(Base):
    __tablename__ = "sprint_metrics"

    id = Column(Integer, primary_key=True, index=True)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    velocity = Column(Integer, default=0)
    committed_points = Column(Integer, default=0)
    completed_points = Column(Integer, default=0)
    predictability = Column(Integer, default=0)
    blocked_work = Column(Integer, default=0)
    metrics_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class WorkloadMetric(Base):
    __tablename__ = "workload_metrics"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    utilization = Column(Integer, default=0)
    capacity_points = Column(Integer, default=40)
    assigned_points = Column(Integer, default=0)
    burnout_risk = Column(Integer, default=0)
    metrics_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ForecastingResult(Base):
    __tablename__ = "forecasting_results"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, nullable=False, index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    confidence = Column(Integer, default=0)
    risk_score = Column(Integer, default=0)
    forecast_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class AIAnalyticsSummary(Base):
    __tablename__ = "ai_analytics_summaries"

    id = Column(Integer, primary_key=True, index=True)
    scope = Column(String, default="organization", index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    summary = Column(Text, nullable=False)
    recommendations_json = Column(Text, nullable=True)
    risk_level = Column(String, default="low", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
