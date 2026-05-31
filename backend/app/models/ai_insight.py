import uuid

from sqlalchemy import Column
from sqlalchemy import Date
from sqlalchemy import DateTime
from sqlalchemy import Float
from sqlalchemy import ForeignKey
from sqlalchemy import Integer
from sqlalchemy import func
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class AIInsight(Base):
    __tablename__ = "ai_insights"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )

    productivity_score = Column(Float)

    tasks_completed_weekly = Column(Integer)

    efficiency_improvement = Column(Float)

    ai_optimized_tasks = Column(Integer)

    time_saved_hours = Column(Float)

    suggestions = Column(JSON)

    week_start = Column(Date)

    week_end = Column(Date)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )