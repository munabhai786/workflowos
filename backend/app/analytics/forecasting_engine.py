from __future__ import annotations

from datetime import datetime

from app.analytics.metrics_aggregator import clamp, serialize_project


def build_forecasts(data: dict, productivity: dict, workload: dict, sprint: dict):
    now = data["now"]
    forecasts = []

    team_completion = productivity["team"]["completion_rate"]
    overdue_rate = productivity["team"]["overdue_rate"]
    workload_penalty = sum(1 for item in workload["users"] if item["overloaded"]) * 8
    sprint_predictability = sprint["summary"]["predictability"]

    for project in data["projects"]:
        project_tasks = [task for task in data["tasks"] if task.project_id == project.id]
        completed = len([task for task in project_tasks if task.status == "completed"])
        overdue = len([task for task in project_tasks if task.due_date and task.due_date < now and task.status != "completed"])
        blocked = len([task for task in project_tasks if task.status == "blocked"])
        progress = project.progress if project.progress is not None else clamp(completed / max(len(project_tasks), 1) * 100)
        deadline_penalty = 0
        if project.end_date:
            days_left = (project.end_date - now.date()).days
            if days_left < 0 and progress < 100:
                deadline_penalty = 35
            elif days_left <= 7 and progress < 80:
                deadline_penalty = 18
        confidence = clamp(progress * 0.35 + team_completion * 0.25 + sprint_predictability * 0.2 - overdue * 8 - blocked * 10 - deadline_penalty - workload_penalty)
        forecasts.append({
            "entity_type": "project",
            "entity_id": project.id,
            "project": serialize_project(project),
            "delivery_confidence": confidence,
            "delay_risk": clamp(100 - confidence),
            "milestone_success": clamp(confidence - overdue * 4),
            "staffing_pressure": clamp(workload_penalty + blocked * 8 + overdue * 10),
            "drivers": {
                "progress": progress,
                "overdue_tasks": overdue,
                "blocked_tasks": blocked,
                "deadline_penalty": deadline_penalty,
            },
        })

    organization_confidence = clamp(
        team_completion * 0.32 +
        sprint_predictability * 0.28 +
        (100 - overdue_rate) * 0.22 +
        (100 - workload_penalty) * 0.18
    )

    return {
        "organization": {
            "delivery_confidence": organization_confidence,
            "delay_risk": clamp(100 - organization_confidence),
            "workload_overload_probability": clamp(workload_penalty * 2),
            "staffing_pressure": clamp(workload_penalty + overdue_rate * 0.5),
        },
        "projects": sorted(forecasts, key=lambda item: item["delivery_confidence"]),
    }
