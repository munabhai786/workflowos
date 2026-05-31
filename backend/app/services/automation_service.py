from __future__ import annotations

import asyncio
import json
import threading
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.activity import Activity
from app.models.automation import AutomationExecution, AutomationRule, WorkflowTrigger
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.task_comment import TaskComment
from app.models.user import User
from app.services.activity_service import create_activity
from app.services.notification_service import create_notification, deliver_notification
from app.services.realtime_service import schedule_global_event, schedule_project_event


TRIGGERS = [
    ("task.created", "Task created", "Runs when a task is created.", "task"),
    ("task.moved", "Task moved", "Runs when a task changes workflow status.", "task"),
    ("task.overdue", "Task overdue", "Runs when a task passes its due date.", "task"),
    ("sprint.completed", "Sprint completed", "Runs when a sprint is completed.", "sprint"),
    ("project.status_changed", "Project status changed", "Runs when project status changes.", "project"),
    ("attachment.uploaded", "Attachment uploaded", "Runs when a file is attached.", "attachment"),
    ("comment.added", "Comment added", "Runs when a comment is posted.", "comment"),
    ("milestone.completed", "Milestone completed", "Runs when a milestone is completed.", "milestone"),
    ("deadline.approaching", "Deadline approaching", "Runs for upcoming deadlines.", "deadline"),
    ("workload.overload", "Workload overload", "Runs when assigned work exceeds capacity.", "workload"),
]


def seed_workflow_triggers(db: Session):
    existing = {
        key for (key,) in db.query(WorkflowTrigger.key).all()
    }
    for key, name, description, entity_type in TRIGGERS:
        if key not in existing:
            db.add(
                WorkflowTrigger(
                    key=key,
                    name=name,
                    description=description,
                    entity_type=entity_type,
                    is_system=True,
                )
            )
    db.commit()


def json_loads(value: str | None, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def json_dumps(value: Any):
    return json.dumps(value, default=str)


def actor_name(db: Session, user_id: int | None):
    if not user_id:
        return "WorkflowOS"
    user = db.query(User).filter(User.id == user_id).first()
    return user.full_name if user else "WorkflowOS"


def project_recipients(db: Session, project_id: int | None):
    recipients = set()
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project and project.owner_id:
            recipients.add(project.owner_id)
        recipients.update(
            user_id for (user_id,) in db.query(ProjectMember.user_id)
            .filter(ProjectMember.project_id == project_id)
            .all()
        )
    recipients.update(
        user_id for (user_id,) in db.query(User.id)
        .filter(User.role.in_(["Admin", "Manager"]))
        .all()
    )
    return [recipient for recipient in recipients if recipient]


def get_context_value(context: dict, field: str):
    current: Any = context
    for part in field.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)
        if current is None:
            return None
    return current


def compare(left, operator: str, right):
    if operator in ["eq", "equals", "is"]:
        return str(left) == str(right)
    if operator in ["neq", "not_equals", "is_not"]:
        return str(left) != str(right)
    if operator == "contains":
        return str(right).lower() in str(left or "").lower()
    if operator == "in":
        return str(left) in [str(item) for item in (right or [])]
    if operator in ["gt", "gte", "lt", "lte"]:
        try:
            left_value = float(left)
            right_value = float(right)
        except Exception:
            return False
        if operator == "gt":
            return left_value > right_value
        if operator == "gte":
            return left_value >= right_value
        if operator == "lt":
            return left_value < right_value
        return left_value <= right_value
    if operator == "exists":
        return left is not None
    if operator == "missing":
        return left is None
    return False


def conditions_match(conditions: dict | list | None, context: dict):
    if not conditions:
        return True

    if isinstance(conditions, list):
        return all(conditions_match(condition, context) for condition in conditions)

    mode = str(conditions.get("mode", "and")).lower()
    rules = conditions.get("rules") or []
    if not rules:
        return True

    results = []
    for rule in rules:
        if "rules" in rule:
            results.append(conditions_match(rule, context))
            continue
        field = rule.get("field")
        operator = rule.get("operator", "eq")
        expected = rule.get("value")
        results.append(compare(get_context_value(context, field or ""), operator, expected))

    return any(results) if mode == "or" else all(results)


def rule_scope_filter(db: Session, trigger_type: str, context: dict):
    project_id = context.get("project_id")
    owner_id = context.get("actor_id")
    query = db.query(AutomationRule).filter(
        AutomationRule.enabled == True,
        AutomationRule.trigger_type == trigger_type,
    )
    return query.filter(
        or_(
            AutomationRule.scope == "organization",
            AutomationRule.project_id == project_id if project_id else AutomationRule.id == -1,
            AutomationRule.owner_id == owner_id if owner_id else AutomationRule.id == -1,
        )
    )


def execute_action(db: Session, rule: AutomationRule, action: dict, context: dict):
    action_type = action.get("type")
    task_id = action.get("task_id") or context.get("task_id")
    project_id = action.get("project_id") or context.get("project_id")

    if action_type == "assign_task" and task_id:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task:
            task.assigned_to = action.get("user_id") or action.get("assigned_to")
            return {"assigned_to": task.assigned_to}

    if action_type == "change_status" and task_id:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task:
            task.status = action.get("status", task.status)
            schedule_project_event(task.project_id, "task.updated", {"task_id": task.id, "status": task.status})
            return {"status": task.status}

    if action_type == "update_priority" and task_id:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task:
            task.priority = action.get("priority", task.priority)
            return {"priority": task.priority}

    if action_type == "create_comment" and task_id:
        body = action.get("body") or action.get("message") or f"Automation {rule.name} added an update."
        comment = TaskComment(
            task_id=task_id,
            author_id=rule.owner_id,
            body=body,
        )
        db.add(comment)
        return {"comment": body}

    if action_type in ["send_notification", "create_reminder", "notify_manager"]:
        recipients = action.get("user_ids") or []
        if action_type == "notify_manager":
            recipients = project_recipients(db, project_id)
        if action.get("user_id"):
            recipients.append(action["user_id"])
        if not recipients and context.get("assignee_id"):
            recipients.append(context["assignee_id"])
        if not recipients and rule.owner_id:
            recipients.append(rule.owner_id)

        delivered = []
        for user_id in set(recipients):
            notification = create_notification(
                db=db,
                user_id=user_id,
                title=action.get("title") or f"Automation: {rule.name}",
                message=action.get("message") or context.get("message") or "Workflow automation delivered an update.",
                type=action.get("notification_type", "automation"),
                severity=action.get("severity", "medium"),
                priority=action.get("priority", "normal"),
                entity_type=context.get("entity_type"),
                entity_id=context.get("entity_id"),
                metadata={"automation_rule_id": rule.id, "trigger_type": context.get("trigger_type")},
            )
            deliver_notification(db, notification)
            delivered.append(user_id)
        return {"notified": delivered}

    if action_type == "create_activity":
        create_activity(
            db=db,
            action_type="workflow_executed",
            message=action.get("message") or f"Automation {rule.name} executed.",
            user_id=rule.owner_id,
            project_id=project_id,
            task_id=task_id,
            entity_type="automation",
            entity_id=rule.id,
        )
        return {"activity": True}

    if action_type == "trigger_ai_analysis":
        notification = create_notification(
            db=db,
            user_id=rule.owner_id,
            title="AI workflow analysis queued",
            message=f"WorkflowOS is analyzing {rule.name} for delivery and bottleneck risk.",
            type="automation",
            severity="low",
            priority="normal",
            entity_type="automation",
            entity_id=rule.id,
            metadata={"trigger_type": context.get("trigger_type")},
        )
        deliver_notification(db, notification)
        return {"ai_analysis": "queued"}

    if action_type == "move_sprint":
        return {"move_sprint": "prepared"}

    return {"skipped": action_type}


def execute_rule(db: Session, rule: AutomationRule, context: dict):
    execution = AutomationExecution(
        rule_id=rule.id,
        trigger_type=context.get("trigger_type") or rule.trigger_type,
        status="running",
        input_json=json_dumps(context),
        started_at=datetime.utcnow(),
    )
    db.add(execution)
    db.flush()

    try:
        actions = json_loads(rule.actions_json, [])
        results = [
            execute_action(db, rule, action, context)
            for action in actions
            if isinstance(action, dict)
        ]

        rule.run_count = (rule.run_count or 0) + 1
        rule.last_run_at = datetime.utcnow()
        execution.status = "success"
        execution.output_json = json_dumps(results)
        execution.finished_at = datetime.utcnow()

        create_activity(
            db=db,
            action_type="automation_triggered",
            message=f"Automation {rule.name} executed from {execution.trigger_type}.",
            user_id=rule.owner_id,
            project_id=context.get("project_id"),
            task_id=context.get("task_id"),
            entity_type="automation",
            entity_id=rule.id,
        )

        db.commit()
        schedule_project_event(context.get("project_id"), "automation.executed", {"rule_id": rule.id, "execution_id": execution.id})
        schedule_global_event("automation.executed", {"rule_id": rule.id, "execution_id": execution.id})
        schedule_global_event("analytics.updated", {"source": "automation.executed", "rule_id": rule.id})
    except Exception as exc:
        rule.failure_count = (rule.failure_count or 0) + 1
        execution.status = "failed"
        execution.error = str(exc)
        execution.finished_at = datetime.utcnow()
        db.commit()
        schedule_project_event(context.get("project_id"), "automation.failed", {"rule_id": rule.id, "execution_id": execution.id})
        schedule_global_event("automation.failed", {"rule_id": rule.id, "execution_id": execution.id})
        schedule_global_event("analytics.updated", {"source": "automation.failed", "rule_id": rule.id})


def process_trigger(db: Session, trigger_type: str, context: dict):
    context = {
        **context,
        "trigger_type": trigger_type,
        "automation_depth": int(context.get("automation_depth", 0)),
    }
    if context["automation_depth"] > 2:
        return []

    matched = []
    for rule in rule_scope_filter(db, trigger_type, context).all():
        conditions = json_loads(rule.conditions_json, {})
        if not conditions_match(conditions, context):
            continue
        matched.append(rule.id)
        execute_rule(db, rule, {**context, "automation_depth": context["automation_depth"] + 1})

    if matched:
        schedule_project_event(context.get("project_id"), "workflow.triggered", {"trigger_type": trigger_type, "rule_ids": matched})
        schedule_global_event("workflow.triggered", {"trigger_type": trigger_type, "rule_ids": matched})

    return matched


def schedule_trigger(trigger_type: str, context: dict):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        def _thread_run():
            db = SessionLocal()
            try:
                process_trigger(db, trigger_type, context)
            finally:
                db.close()

        threading.Thread(target=_thread_run, daemon=True).start()
        return

    async def _run():
        db = SessionLocal()
        try:
            process_trigger(db, trigger_type, context)
        finally:
            db.close()

    loop.create_task(_run())


def run_scheduled_automations(db: Session):
    now = datetime.utcnow()

    overdue_tasks = (
        db.query(Task)
        .filter(Task.due_date.isnot(None))
        .filter(Task.due_date < now)
        .filter(Task.status != "completed")
        .all()
    )
    for task in overdue_tasks:
        process_trigger(
            db,
            "task.overdue",
            {
                "task_id": task.id,
                "project_id": task.project_id,
                "assignee_id": task.assigned_to,
                "entity_type": "task",
                "entity_id": task.id,
                "task": {
                    "id": task.id,
                    "title": task.title,
                    "status": task.status,
                    "priority": task.priority,
                    "due_date": task.due_date,
                },
            },
        )

    approaching = now + timedelta(days=2)
    due_soon = (
        db.query(Task)
        .filter(Task.due_date.isnot(None))
        .filter(Task.due_date >= now)
        .filter(Task.due_date <= approaching)
        .filter(Task.status != "completed")
        .all()
    )
    for task in due_soon:
        process_trigger(
            db,
            "deadline.approaching",
            {
                "task_id": task.id,
                "project_id": task.project_id,
                "assignee_id": task.assigned_to,
                "entity_type": "task",
                "entity_id": task.id,
                "task": {
                    "id": task.id,
                    "title": task.title,
                    "status": task.status,
                    "priority": task.priority,
                    "due_date": task.due_date,
                },
            },
        )


def automation_recommendations(db: Session, user: User | None):
    blocked_count = db.query(Task).filter(Task.status == "blocked").count()
    overdue_count = (
        db.query(Task)
        .filter(Task.due_date.isnot(None))
        .filter(Task.due_date < datetime.utcnow())
        .filter(Task.status != "completed")
        .count()
    )
    stale_count = (
        db.query(Task)
        .filter(Task.status.in_(["todo", "in_progress"]))
        .filter(Task.created_at < datetime.utcnow() - timedelta(days=7))
        .count()
    )

    recommendations = []
    if blocked_count:
        recommendations.append({
            "title": "Escalate blocked tasks after 3 days",
            "trigger_type": "task.moved",
            "reason": f"{blocked_count} blocked task(s) need escalation coverage.",
            "actions": [{"type": "notify_manager", "severity": "high", "message": "A task is blocked and needs manager attention."}],
        })
    if overdue_count:
        recommendations.append({
            "title": "Notify assignees and managers for overdue work",
            "trigger_type": "task.overdue",
            "reason": f"{overdue_count} overdue task(s) were detected.",
            "actions": [{"type": "send_notification", "severity": "critical", "message": "A task is overdue."}],
        })
    if stale_count:
        recommendations.append({
            "title": "Move stale tasks into review",
            "trigger_type": "deadline.approaching",
            "reason": f"{stale_count} active task(s) have not moved recently.",
            "actions": [{"type": "create_activity", "message": "WorkflowOS detected stale execution risk."}],
        })

    recommendations.append({
        "title": "Auto-assign frontend bugs to frontend owners",
        "trigger_type": "task.created",
        "reason": "Route repetitive triage work automatically using labels and priority conditions.",
        "actions": [{"type": "assign_task", "user_id": user.id if user else None}],
    })
    recommendations.append({
        "title": "Notify managers when sprint velocity drops",
        "trigger_type": "sprint.completed",
        "reason": "Protect delivery confidence by escalating missed velocity targets.",
        "actions": [{"type": "notify_manager", "severity": "high"}],
    })

    return recommendations[:5]
