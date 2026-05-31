from __future__ import annotations

import json
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.ai_agent import AIApprovalHistory, AIExecutionLog, AIRecommendation
from app.models.automation import AutomationRule
from app.models.task import Task
from app.models.user import User
from app.services.realtime_service import schedule_global_event, schedule_project_event, schedule_user_event


MANAGEMENT_ROLES = {"Admin", "Manager"}


def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _loads(value):
    if not value:
        return {}
    try:
        return json.loads(value)
    except Exception:
        return {}


def _dumps(value):
    return json.dumps(value, default=_json_default)


class ApprovalEngine:
    def require_manager(self, user: User, role: str | None):
        effective_role = role or user.role
        if effective_role not in MANAGEMENT_ROLES:
            raise HTTPException(status_code=403, detail="AI action approval requires Admin or Manager access.")

    def approve(
        self,
        db: Session,
        recommendation_id: int,
        reviewer: User,
        role: str | None,
        modified_payload: dict | None = None,
    ):
        self.require_manager(reviewer, role)
        recommendation = db.query(AIRecommendation).filter(AIRecommendation.id == recommendation_id).first()
        if not recommendation:
            raise HTTPException(status_code=404, detail="AI recommendation not found.")

        payload = modified_payload or _loads(recommendation.action_payload_json)
        execution = self.execute(db, recommendation, reviewer, payload)
        recommendation.status = "approved" if execution.status == "executed" else "approved_pending_execution"
        recommendation.updated_at = datetime.utcnow()
        approval = AIApprovalHistory(
            recommendation_id=recommendation.id,
            action="approve",
            status=recommendation.status,
            reviewer_id=reviewer.id,
            modified_payload_json=_dumps(modified_payload) if modified_payload else None,
            confidence=recommendation.confidence,
            execution_log_id=execution.id,
        )
        db.add(approval)
        db.commit()
        db.refresh(execution)
        schedule_global_event("ai.action.executed", {"recommendation_id": recommendation.id, "execution_id": execution.id})
        if recommendation.project_id:
            schedule_project_event(recommendation.project_id, "ai.action.executed", {"recommendation_id": recommendation.id})
        return execution

    def reject(
        self,
        db: Session,
        recommendation_id: int,
        reviewer: User,
        role: str | None,
        reason: str | None = None,
    ):
        self.require_manager(reviewer, role)
        recommendation = db.query(AIRecommendation).filter(AIRecommendation.id == recommendation_id).first()
        if not recommendation:
            raise HTTPException(status_code=404, detail="AI recommendation not found.")

        recommendation.status = "rejected"
        recommendation.updated_at = datetime.utcnow()
        approval = AIApprovalHistory(
            recommendation_id=recommendation.id,
            action="reject",
            status="rejected",
            reviewer_id=reviewer.id,
            rejection_reason=reason,
            confidence=recommendation.confidence,
        )
        db.add(approval)
        db.commit()
        schedule_global_event("ai.action.suggested", {"recommendation_id": recommendation.id, "status": "rejected"})
        return approval

    def modify(
        self,
        db: Session,
        recommendation_id: int,
        reviewer: User,
        role: str | None,
        payload: dict,
    ):
        self.require_manager(reviewer, role)
        recommendation = db.query(AIRecommendation).filter(AIRecommendation.id == recommendation_id).first()
        if not recommendation:
            raise HTTPException(status_code=404, detail="AI recommendation not found.")
        recommendation.action_payload_json = _dumps(payload)
        recommendation.status = "modified"
        recommendation.updated_at = datetime.utcnow()
        approval = AIApprovalHistory(
            recommendation_id=recommendation.id,
            action="modify",
            status="modified",
            reviewer_id=reviewer.id,
            modified_payload_json=_dumps(payload),
            confidence=recommendation.confidence,
        )
        db.add(approval)
        db.commit()
        return recommendation

    def execute(self, db: Session, recommendation: AIRecommendation, actor: User, payload: dict):
        execution = AIExecutionLog(
            recommendation_id=recommendation.id,
            agent_key=recommendation.agent_key,
            action_type=recommendation.action_type or "record_decision",
            action_payload_json=_dumps(payload),
            status="queued",
            confidence=recommendation.confidence,
            reasoning_summary=recommendation.reasoning,
            approval_status="approved",
            project_id=recommendation.project_id,
            task_id=recommendation.task_id,
            requested_by=recommendation.created_by,
            executed_by=actor.id,
        )
        db.add(execution)
        db.flush()

        result = {"message": "AI action recorded for human-led execution."}
        rollback = {}
        status = "recorded"

        action = recommendation.action_type
        if action == "reschedule_task":
            task = db.query(Task).filter(Task.id == payload.get("task_id")).first()
            if task:
                rollback = {"task_id": task.id, "due_date": task.due_date}
                due_date = payload.get("due_date")
                if due_date:
                    task.due_date = datetime.fromisoformat(due_date)
                    task.scheduled_end = task.due_date
                result = {"task_id": task.id, "due_date": task.due_date, "message": "Task rescheduled."}
                status = "executed"
                if task.assigned_to:
                    schedule_user_event(task.assigned_to, "ai.action.executed", result)
        elif action == "rebalance_due_dates":
            task_ids = payload.get("task_ids", [])
            offset_days = int(payload.get("offset_days", 1))
            changed = []
            for task in db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []:
                rollback[str(task.id)] = {"due_date": task.due_date}
                if task.due_date:
                    task.due_date = task.due_date + timedelta(days=offset_days)
                    task.scheduled_end = task.due_date
                    changed.append({"task_id": task.id, "due_date": task.due_date})
            result = {"changed": changed, "message": "Due dates rebalanced."}
            status = "executed" if changed else "recorded"
        elif action == "auto_prioritize_tasks":
            task_ids = payload.get("task_ids", [])
            changed = []
            for task in db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []:
                rollback[str(task.id)] = {"priority": task.priority}
                task.priority = payload.get("priority", "high")
                changed.append({"task_id": task.id, "priority": task.priority})
            result = {"changed": changed, "message": "Task priorities updated."}
            status = "executed" if changed else "recorded"
        elif action == "create_workflow_automation":
            rule = AutomationRule(
                name=payload.get("name", recommendation.title),
                description=recommendation.message,
                trigger_type=payload.get("trigger_type", "manual_ai_recommendation"),
                conditions_json=_dumps(payload.get("conditions", {})),
                actions_json=_dumps(payload.get("actions", [])),
                scope="project" if recommendation.project_id else "organization",
                project_id=recommendation.project_id,
                owner_id=actor.id,
                enabled=False,
            )
            db.add(rule)
            db.flush()
            result = {"rule_id": rule.id, "enabled": False, "message": "Automation draft created disabled for final review."}
            status = "executed"
        elif action in {
            "escalate_blocked_items",
            "rebalance_workload",
            "suggest_sprint_adjustment",
            "create_collaboration_reminder",
            "suggest_reviewers",
            "generate_recovery_plan",
        }:
            status = "recorded"
            result = {"message": "AI recommendation approved and queued for operational follow-through.", "payload": payload}

        execution.status = status
        execution.execution_result_json = _dumps(result)
        execution.rollback_state_json = _dumps(rollback)
        execution.executed_at = datetime.utcnow()
        db.commit()
        return execution


approval_engine = ApprovalEngine()
