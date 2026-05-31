from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models.ai_agent import AIRecommendation
from app.models.analytics import ProductivityMetric
from app.models.notification import Notification
from app.models.project import Project
from app.models.sprint import Sprint, SprintTask
from app.models.task import Task
from app.models.task_comment import TaskComment
from app.models.user import User
from app.services.notification_service import create_notification, deliver_notification


MANAGEMENT_ROLES = {"Admin", "Manager"}


def _priority(level: str):
    if level == "critical":
        return "critical", "critical"
    if level == "warning":
        return "warning", "high"
    return "info", "normal"


def _metadata(key: str, actions: list[dict] | None = None, **extra):
    return {
        "smart_key": key,
        "actions": actions or [],
        **extra,
    }


def _already_exists(db: Session, user_id: int, smart_key: str):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .filter(Notification.metadata_json.contains(smart_key))
        .first()
    )


def _emit(
    db: Session,
    user_id: int | None,
    smart_key: str,
    title: str,
    message: str,
    type: str,
    level: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actions: list[dict] | None = None,
    extra: dict | None = None,
):
    if not user_id or _already_exists(db, user_id, smart_key):
        return None

    severity, priority = _priority(level)
    notification = create_notification(
        db=db,
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        severity=severity,
        priority=priority,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=_metadata(smart_key, actions, **(extra or {})),
    )
    deliver_notification(db, notification)
    return notification


def task_actions(task: Task):
    return [
        {"label": "Open Task", "action": "open", "path": f"/tasks?task={task.id}"},
        {"label": "Mark Complete", "action": "mark_complete", "task_id": task.id},
        {"label": "Reassign", "action": "reassign", "path": f"/tasks?task={task.id}&quick=reassign"},
    ]


def project_actions(project: Project):
    return [
        {"label": "Open Project", "action": "open", "path": "/projects"},
        {"label": "Review Tasks", "action": "open", "path": f"/tasks?project={project.id}"},
    ]


def _user_aliases(user: User):
    aliases = {
        str(user.id).lower(),
        (user.email or "").split("@")[0].lower(),
        (user.email or "").lower(),
    }
    for part in (user.full_name or "").split():
        aliases.add(part.lower())
    return {alias for alias in aliases if alias}


def _managers(db: Session):
    return (
        db.query(User)
        .filter(User.role.in_(["Admin", "Manager"]))
        .all()
    )


def run_smart_notification_scan(
    db: Session,
    current_user: User | None = None,
    role: str | None = None,
):
    now = datetime.utcnow()
    created = []
    scan_users = [current_user] if current_user else _managers(db)
    scan_users = [user for user in scan_users if user]

    for user in scan_users:
        effective_role = role or user.role
        can_manage = effective_role in MANAGEMENT_ROLES

        task_query = (
            db.query(Task)
            .options(joinedload(Task.project), joinedload(Task.assignee))
        )
        if not can_manage:
            task_query = task_query.filter(Task.assigned_to == user.id)

        tasks = task_query.all()
        overdue_tasks = [
            task
            for task in tasks
            if task.due_date and task.due_date < now and task.status != "completed"
        ]

        for task in overdue_tasks[:8]:
            created.append(_emit(
                db,
                user.id,
                f"overdue_task:{task.id}",
                "Task overdue",
                f"{task.title} is past its due date.",
                "overdue_task",
                "critical",
                "task",
                task.id,
                task_actions(task),
                {"due_date": task.due_date.isoformat() if task.due_date else None},
            ))

        due_soon = [
            task
            for task in tasks
            if task.due_date
            and now <= task.due_date <= now + timedelta(days=3)
            and task.status != "completed"
        ]
        if len(due_soon) >= 3:
            created.append(_emit(
                db,
                user.id,
                f"deadline_risk:{user.id}:{now.date().isoformat()}",
                "Deadline risk detected",
                f"{len(due_soon)} tasks are due within 3 days.",
                "deadline_risk",
                "warning",
                "task",
                due_soon[0].id,
                [{"label": "Review Deadlines", "action": "open", "path": "/tasks"}],
                {"task_ids": [task.id for task in due_soon]},
            ))

        if not can_manage:
            recent_assignments = [
                task
                for task in tasks
                if task.assigned_to == user.id
                and task.status != "completed"
                and task.created_at
                and task.created_at >= now - timedelta(days=7)
            ]
            for task in recent_assignments[:5]:
                created.append(_emit(
                    db,
                    user.id,
                    f"assignment:{task.id}:{user.id}",
                    "New assignment",
                    f"{task.title} is assigned to you.",
                    "assignment_notification",
                    "info",
                    "task",
                    task.id,
                    task_actions(task),
                ))

        owned_projects = (
            db.query(Project)
            .options(joinedload(Project.tasks))
            .filter(Project.owner_id == user.id if not can_manage else Project.id > 0)
            .all()
        )
        for project in owned_projects:
            project_tasks = project.tasks or []
            if not project.end_date or project.status == "completed":
                continue
            open_count = len([task for task in project_tasks if task.status != "completed"])
            blocked = len([task for task in project_tasks if task.status == "blocked"])
            overdue = len([
                task
                for task in project_tasks
                if task.due_date and task.due_date < now and task.status != "completed"
            ])
            days_left = (project.end_date - now.date()).days
            progress = project.progress or 0
            if open_count and (overdue or blocked or (days_left <= 7 and progress < 80)):
                level = "critical" if overdue or days_left < 0 else "warning"
                created.append(_emit(
                    db,
                    user.id,
                    f"project_health:{project.id}:{project.end_date.isoformat()}:{overdue}:{blocked}",
                    "Project health decreased",
                    f"{project.name} has {open_count} open tasks, {blocked} blocked, and {overdue} overdue.",
                    "deadline_risk",
                    level,
                    "project",
                    project.id,
                    project_actions(project),
                    {"open_tasks": open_count, "blocked_tasks": blocked, "overdue_tasks": overdue},
                ))

        approval_query = db.query(AIRecommendation).filter(
            AIRecommendation.status.in_(["open", "pending"]),
            AIRecommendation.approval_required == 1,
        )
        if not can_manage:
            approval_query = approval_query.filter(
                or_(AIRecommendation.user_id == user.id, AIRecommendation.created_by == user.id)
            )
        for recommendation in approval_query.order_by(AIRecommendation.created_at.desc()).limit(10).all():
            created.append(_emit(
                db,
                user.id,
                f"approval:{recommendation.id}:{user.id}",
                "Approval pending",
                recommendation.title,
                "approval_reminder",
                "warning" if recommendation.severity != "high" else "critical",
                "approval",
                recommendation.id,
                [{"label": "Open Approval", "action": "open", "path": "/ai-approvals"}],
                {"recommendation_id": recommendation.id},
            ))

            created.append(_emit(
                db,
                user.id,
                f"ai_recommendation:{recommendation.id}:{user.id}",
                "AI recommendation ready",
                recommendation.message,
                "ai_recommendation",
                "warning" if recommendation.severity == "high" else "info",
                "recommendation",
                recommendation.id,
                [{"label": "Review Recommendation", "action": "open", "path": "/ai-recommendations"}],
            ))

        if can_manage:
            risky_sprints = (
                db.query(Sprint)
                .options(joinedload(Sprint.tasks).joinedload(SprintTask.task))
                .filter(Sprint.status != "completed")
                .all()
            )
            for sprint in risky_sprints:
                sprint_tasks = [link.task for link in sprint.tasks or [] if link.task]
                if not sprint_tasks:
                    continue
                committed = sum((task.estimate_points or 1) for task in sprint_tasks)
                completed = sum((task.estimate_points or 1) for task in sprint_tasks if task.status == "completed")
                blocked = len([task for task in sprint_tasks if task.status == "blocked"])
                days_total = max((sprint.end_date - sprint.start_date).days + 1, 1)
                days_elapsed = max((now.date() - sprint.start_date).days + 1, 0)
                expected_completion = min(days_elapsed / days_total, 1)
                actual_completion = completed / max(committed, 1)
                if blocked or actual_completion + 0.15 < expected_completion:
                    created.append(_emit(
                        db,
                        user.id,
                        f"sprint_risk:{sprint.id}:{blocked}:{completed}",
                        "Sprint risk detected",
                        f"{sprint.name} is tracking below expected progress with {blocked} blocked task(s).",
                        "sprint_risk",
                        "warning",
                        "sprint",
                        sprint.id,
                        [{"label": "Open Planning", "action": "open", "path": "/planning"}],
                        {
                            "committed_points": committed,
                            "completed_points": completed,
                            "blocked_tasks": blocked,
                        },
                    ))

        latest_metric = (
            db.query(ProductivityMetric)
            .filter(ProductivityMetric.user_id == user.id)
            .order_by(ProductivityMetric.created_at.desc())
            .first()
        )
        previous_metric = None
        if latest_metric:
            previous_metric = (
                db.query(ProductivityMetric)
                .filter(ProductivityMetric.user_id == user.id)
                .filter(ProductivityMetric.id != latest_metric.id)
                .order_by(ProductivityMetric.created_at.desc())
                .first()
            )
        if latest_metric and previous_metric and latest_metric.score <= previous_metric.score - 15:
            created.append(_emit(
                db,
                user.id,
                f"productivity_drop:{user.id}:{latest_metric.id}",
                "Productivity dropped",
                f"Productivity moved from {previous_metric.score}% to {latest_metric.score}%.",
                "productivity_drop",
                "warning",
                "user",
                user.id,
                [{"label": "Open Analytics", "action": "open", "path": "/team-analytics"}],
                {"previous_score": previous_metric.score, "current_score": latest_metric.score},
            ))

        aliases = _user_aliases(user)
        recent_comments = (
            db.query(TaskComment)
            .options(joinedload(TaskComment.task))
            .filter(TaskComment.created_at >= now - timedelta(days=14))
            .filter(TaskComment.author_id != user.id)
            .filter(TaskComment.mentions.isnot(None))
            .all()
        )
        for comment in recent_comments:
            mentions = {
                mention.strip().lower()
                for mention in (comment.mentions or "").split(",")
                if mention.strip()
            }
            if aliases & mentions:
                created.append(_emit(
                    db,
                    user.id,
                    f"mention:{comment.id}:{user.id}",
                    "You were mentioned",
                    f"You were mentioned on {comment.task.title if comment.task else 'a task'}.",
                    "mention_alert",
                    "info",
                    "comment",
                    comment.id,
                    [{"label": "Open Task", "action": "open", "path": f"/tasks?task={comment.task_id}"}],
                    {"task_id": comment.task_id},
                ))

    db.commit()
    return [item for item in created if item is not None]
