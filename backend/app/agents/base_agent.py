from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session


def clamp(value: int | float, minimum: int = 0, maximum: int = 100):
    return max(minimum, min(maximum, round(value)))


@dataclass
class AgentRecommendation:
    agent_key: str
    category: str
    title: str
    message: str
    reasoning: str
    recommendation_type: str = "insight"
    action_type: str | None = None
    action_payload: dict[str, Any] | None = None
    severity: str = "medium"
    confidence: float = 0.75
    project_id: int | None = None
    task_id: int | None = None
    user_id: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseAgent:
    key = "base"
    name = "Base Agent"
    description = "Shared enterprise AI agent contract."

    def analyze(self, db: Session, context: dict[str, Any]) -> list[AgentRecommendation]:
        raise NotImplementedError

    def summarize(self, context: dict[str, Any]) -> dict[str, Any]:
        return {
            "agent_key": self.key,
            "name": self.name,
            "description": self.description,
        }

    def recommendation(
        self,
        *,
        category: str,
        title: str,
        message: str,
        reasoning: str,
        recommendation_type: str = "insight",
        action_type: str | None = None,
        action_payload: dict[str, Any] | None = None,
        severity: str = "medium",
        confidence: float = 0.75,
        project_id: int | None = None,
        task_id: int | None = None,
        user_id: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentRecommendation:
        return AgentRecommendation(
            agent_key=self.key,
            category=category,
            title=title,
            message=message,
            reasoning=reasoning,
            recommendation_type=recommendation_type,
            action_type=action_type,
            action_payload=action_payload,
            severity=severity,
            confidence=confidence,
            project_id=project_id,
            task_id=task_id,
            user_id=user_id,
            metadata=metadata or {},
        )
