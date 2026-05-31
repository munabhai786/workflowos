from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services.ai_intelligence_service import clamp


def task_priority_score(task: Task):
    priority_weight = {
        "high": 35,
        "medium": 20,
        "low": 8,
    }.get(task.priority, 15)
    due_weight = 0
    if task.due_date:
        hours = (task.due_date - datetime.utcnow()).total_seconds() / 3600
        due_weight = 40 if hours < 0 else max(0, 30 - hours / 8)
    status_weight = 18 if task.status in ["blocked", "review"] else 8
    return clamp(priority_weight + due_weight + status_weight)


def generate_subtasks(task: Task):
    title = task.title.strip()
    return [
        f"Clarify acceptance criteria for {title}",
        f"Break implementation work for {title} into owner-sized steps",
        f"Validate dependencies and blockers for {title}",
        f"Prepare review checklist for {title}",
    ]


def analyze_task_intelligence(db: Session):
    tasks = db.query(Task).all()
    projects = db.query(Project).all()
    users = db.query(User).all()
    activities = db.query(Activity).all()
    now = datetime.utcnow()

    workload = defaultdict(lambda: {"open": 0, "overdue": 0, "completed": 0})
    for task in tasks:
        if not task.assigned_to:
            continue
        if task.status == "completed":
            workload[task.assigned_to]["completed"] += 1
        else:
            workload[task.assigned_to]["open"] += 1
            if task.due_date and task.due_date < now:
                workload[task.assigned_to]["overdue"] += 1

    user_lookup = {user.id: user for user in users}
    workload_balancing = []
    for user_id, stats in workload.items():
        user = user_lookup.get(user_id)
        workload_balancing.append({
            "user_id": user_id,
            "user": user.full_name if user else "Unknown user",
            "open_tasks": stats["open"],
            "overdue_tasks": stats["overdue"],
            "completed_tasks": stats["completed"],
            "capacity_state": (
                "overloaded"
                if stats["open"] >= 6 or stats["overdue"] >= 2
                else "healthy"
                if stats["open"] >= 2
                else "available"
            ),
        })

    prioritized_tasks = sorted(
        [
            {
                "id": task.id,
                "title": task.title,
                "project_id": task.project_id,
                "priority": task.priority,
                "status": task.status,
                "due_date": task.due_date,
                "priority_score": task_priority_score(task),
                "suggested_subtasks": generate_subtasks(task),
            }
            for task in tasks
            if task.status != "completed"
        ],
        key=lambda item: item["priority_score"],
        reverse=True,
    )[:10]

    delivery_risks = []
    for project in projects:
        project_tasks = [task for task in tasks if task.project_id == project.id]
        if not project_tasks:
            continue
        overdue = [
            task for task in project_tasks
            if task.due_date and task.due_date < now and task.status != "completed"
        ]
        blocked = [task for task in project_tasks if task.status == "blocked"]
        completed = [task for task in project_tasks if task.status == "completed"]
        completion_rate = len(completed) / max(len(project_tasks), 1) * 100
        days_left = (
            (project.end_date - now.date()).days
            if project.end_date
            else 30
        )
        risk = clamp(
            len(overdue) * 20 +
            len(blocked) * 16 +
            max(0, 45 - completion_rate) +
            (25 if days_left < 3 and completion_rate < 80 else 0)
        )
        delivery_risks.append({
            "project_id": project.id,
            "project": project.name,
            "risk_score": risk,
            "delivery_confidence": clamp(100 - risk),
            "overdue_tasks": len(overdue),
            "blocked_tasks": len(blocked),
            "completion_rate": clamp(completion_rate),
        })

    recent_completions = [
        activity for activity in activities
        if activity.action == "task_completed"
        and activity.created_at >= now - timedelta(days=14)
    ]

    return {
        "workload_balancing": workload_balancing,
        "prioritized_tasks": prioritized_tasks,
        "delivery_risks": sorted(delivery_risks, key=lambda item: item["risk_score"], reverse=True),
        "sprint_recommendations": [
            "Pull high-priority overdue work into the next sprint review.",
            "Cap in-progress work before creating new assignments.",
            "Route review tasks to available teammates with low open load.",
        ],
        "productivity_forecast": {
            "completed_last_14_days": len(recent_completions),
            "forecast_next_14_days": max(1, round(len(recent_completions) * 1.15)),
            "confidence": clamp(55 + len(recent_completions) * 4),
        },
    }
