from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.agents.ai_memory_engine import memory_engine
from app.agents.collaboration_agent import CollaborationAgent
from app.agents.context_builder import context_builder
from app.agents.copilot_agent import WorkspaceCopilotAgent
from app.agents.executive_agent import ExecutiveIntelligenceAgent
from app.agents.multi_agent_coordinator import multi_agent_coordinator
from app.agents.project_manager_agent import ProjectManagerAgent
from app.agents.scheduling_agent import SchedulingAgent
from app.agents.workflow_agent import WorkflowOptimizationAgent
from app.models.ai_agent import AIRecommendation, AISummary
from app.models.user import User
from app.services.realtime_service import schedule_global_event, schedule_project_event


def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _dumps(value):
    return json.dumps(value, default=_json_default)


class AgentManager:
    def __init__(self):
        self.agents = [
            ProjectManagerAgent(),
            SchedulingAgent(),
            WorkflowOptimizationAgent(),
            CollaborationAgent(),
            ExecutiveIntelligenceAgent(),
        ]
        self.copilot = WorkspaceCopilotAgent()

    def list_agents(self):
        return [
            {
                "key": agent.key,
                "name": agent.name,
                "description": agent.description,
            }
            for agent in [*self.agents, self.copilot]
        ]

    def run_analysis(
        self,
        db: Session,
        current_user: User | None = None,
        role: str | None = None,
        project_id: int | None = None,
        persist: bool = True,
    ) -> dict[str, Any]:
        context = context_builder.build(db, current_user, role, project_id)
        recommendations = []
        for agent in self.agents:
            recommendations.extend(agent.analyze(db, context))

        recommendations = multi_agent_coordinator.coordinate(db, context, recommendations)
        persisted = []
        if persist:
            for recommendation in recommendations:
                if self._recent_duplicate(db, recommendation.title, recommendation.project_id, recommendation.task_id):
                    continue
                model = AIRecommendation(
                    agent_key=recommendation.agent_key,
                    category=recommendation.category,
                    title=recommendation.title,
                    message=recommendation.message,
                    reasoning=recommendation.reasoning,
                    recommendation_type=recommendation.recommendation_type,
                    action_type=recommendation.action_type,
                    action_payload_json=_dumps(recommendation.action_payload or {}),
                    severity=recommendation.severity,
                    confidence=recommendation.confidence,
                    status="pending_approval" if recommendation.action_type else "open",
                    approval_required=1 if recommendation.action_type else 0,
                    project_id=recommendation.project_id,
                    task_id=recommendation.task_id,
                    user_id=recommendation.user_id,
                    created_by=current_user.id if current_user else None,
                )
                db.add(model)
                db.flush()
                memory_engine.remember_recommendation(db, recommendation, model.id)
                persisted.append(model)
            summary = self._persist_summary(db, context, recommendations, current_user, project_id)
            db.commit()
            for item in persisted:
                payload = self.serialize_recommendation(item)
                schedule_global_event("ai.recommendation.created", payload)
                schedule_global_event("ai.action.suggested", payload)
                if item.project_id:
                    schedule_project_event(item.project_id, "ai.recommendation.created", payload)
            if summary:
                schedule_global_event("ai.summary.generated", {"summary_id": summary.id, "title": summary.title})
        return {
            "context_hash": context["context_hash"],
            "agents": self.list_agents(),
            "recommendations": [self.serialize_recommendation(item) for item in persisted] if persist else [
                recommendation.__dict__ for recommendation in recommendations
            ],
        }

    def copilot_answer(
        self,
        db: Session,
        prompt: str,
        current_user: User | None = None,
        role: str | None = None,
        project_id: int | None = None,
        memory: list[dict] | None = None,
        workspace_context: dict | None = None,
        file_context: list[dict] | None = None,
    ):
        context = context_builder.build(db, current_user, role, project_id, persist_snapshot=False)
        context["conversation_memory"] = memory or []
        context["client_workspace_context"] = workspace_context or {}
        context["file_context"] = file_context or []
        result = self.copilot.answer(db, context, prompt)
        summary = AISummary(
            agent_key=self.copilot.key,
            summary_type="copilot_response",
            title=prompt[:120],
            body=result["answer"],
            payload_json=_dumps(result),
            project_id=project_id,
            user_id=current_user.id if current_user else None,
        )
        db.add(summary)
        memory_engine.remember_decision(
            db,
            agent_key=self.copilot.key,
            decision_type="copilot_response",
            decision={
                "prompt": prompt,
                "answer": result["answer"],
                "file_count": len(file_context or []),
            },
            reasoning="Context-aware workspace copilot response generated from accessible operational context.",
            confidence=0.72,
            project_id=project_id,
            user_id=current_user.id if current_user else None,
        )
        db.commit()
        schedule_global_event("ai.summary.generated", {"summary_id": summary.id, "title": summary.title})
        return result

    def _recent_duplicate(self, db: Session, title: str, project_id: int | None, task_id: int | None):
        since = datetime.utcnow() - timedelta(hours=6)
        query = db.query(AIRecommendation).filter(AIRecommendation.title == title).filter(AIRecommendation.created_at >= since)
        if project_id is None:
            query = query.filter(AIRecommendation.project_id.is_(None))
        else:
            query = query.filter(AIRecommendation.project_id == project_id)
        if task_id is None:
            query = query.filter(AIRecommendation.task_id.is_(None))
        else:
            query = query.filter(AIRecommendation.task_id == task_id)
        return query.first() is not None

    def _persist_summary(self, db: Session, context: dict, recommendations: list, current_user: User | None, project_id: int | None):
        if not recommendations:
            return None
        high = len([item for item in recommendations if item.severity in {"high", "critical"}])
        title = "AI operational intelligence refreshed"
        body = f"{len(recommendations)} recommendation(s) generated across {len(context['projects'])} project(s); {high} high-priority signal(s)."
        summary = AISummary(
            agent_key="agent_manager",
            summary_type="operational_refresh",
            title=title,
            body=body,
            payload_json=_dumps({"context_hash": context["context_hash"], "recommendation_count": len(recommendations)}),
            project_id=project_id,
            user_id=current_user.id if current_user else None,
        )
        db.add(summary)
        return summary

    def serialize_recommendation(self, item: AIRecommendation):
        return {
            "id": item.id,
            "agent_key": item.agent_key,
            "category": item.category,
            "title": item.title,
            "message": item.message,
            "reasoning": item.reasoning,
            "recommendation_type": item.recommendation_type,
            "action_type": item.action_type,
            "action_payload": json.loads(item.action_payload_json or "{}"),
            "severity": item.severity,
            "confidence": item.confidence,
            "status": item.status,
            "approval_required": bool(item.approval_required),
            "project_id": item.project_id,
            "task_id": item.task_id,
            "user_id": item.user_id,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }


agent_manager = AgentManager()
