from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.agents.base_agent import AgentRecommendation
from app.models.ai_agent import AIAgentMemory, AIDecisionHistory, AIOperationalObservation


class AIMemoryEngine:
    def remember_recommendation(
        self,
        db: Session,
        recommendation: AgentRecommendation,
        persisted_id: int | None = None,
    ):
        data = {
            "recommendation_id": persisted_id,
            "category": recommendation.category,
            "action_type": recommendation.action_type,
            "metadata": recommendation.metadata,
        }
        db.add(AIAgentMemory(
            scope="project" if recommendation.project_id else "organization",
            agent_key=recommendation.agent_key,
            memory_type="recommendation",
            project_id=recommendation.project_id,
            user_id=recommendation.user_id,
            entity_type="task" if recommendation.task_id else "project" if recommendation.project_id else "organization",
            entity_id=recommendation.task_id or recommendation.project_id,
            summary=recommendation.message,
            data_json=json.dumps(data),
            confidence=recommendation.confidence,
        ))
        db.add(AIOperationalObservation(
            agent_key=recommendation.agent_key,
            observation_type=recommendation.category,
            severity=recommendation.severity,
            title=recommendation.title,
            body=recommendation.reasoning,
            payload_json=json.dumps(data),
            confidence=recommendation.confidence,
            project_id=recommendation.project_id,
            task_id=recommendation.task_id,
            user_id=recommendation.user_id,
        ))

    def remember_decision(
        self,
        db: Session,
        *,
        agent_key: str,
        decision_type: str,
        decision: dict[str, Any],
        reasoning: str | None = None,
        confidence: float = 0.0,
        project_id: int | None = None,
        user_id: int | None = None,
    ):
        db.add(AIDecisionHistory(
            agent_key=agent_key,
            decision_type=decision_type,
            decision_json=json.dumps(decision),
            reasoning=reasoning,
            confidence=confidence,
            project_id=project_id,
            user_id=user_id,
        ))


memory_engine = AIMemoryEngine()
