from datetime import datetime
from datetime import timedelta

from app.services.ai_intelligence_service import analyze_operational_intelligence


def scope_dashboard_records(projects, tasks, current_user, role):
    if role in ["Admin", "Manager"] or not current_user:
        return projects, tasks

    assigned_tasks = [
        task for task in tasks
        if task.assigned_to == current_user.id
    ]
    project_ids = {
        task.project_id
        for task in assigned_tasks
        if task.project_id
    }
    project_ids.update({
        project.id
        for project in projects
        if project.owner_id == current_user.id
    })

    scoped_projects = [
        project for project in projects
        if project.id in project_ids
    ]
    scoped_task_ids = {
        task.id for task in assigned_tasks
    }
    scoped_tasks = [
        task for task in tasks
        if task.id in scoped_task_ids
        or task.project_id in project_ids
    ]

    return scoped_projects, scoped_tasks


def dashboard_analytics(
    projects,
    tasks,
    db=None,
    current_user=None,
    role=None,
):
    projects, tasks = scope_dashboard_records(
        projects,
        tasks,
        current_user,
        role,
    )
    completed_tasks = [
        task for task in tasks
        if task.status == "completed"
    ]

    completed_projects = [
        project for project in projects
        if project.status == "completed"
        or (project.progress or 0) >= 100
    ]

    overdue_projects = [
        project for project in projects
        if project.end_date
        and project.end_date < datetime.utcnow().date()
        and project.status != "completed"
        and (project.progress or 0) < 100
    ]

    active_projects = [
        project for project in projects
        if project.status != "completed"
        and (project.progress or 0) < 100
        and project not in overdue_projects
    ]

    upcoming_deadlines = [
        task for task in tasks
        if task.due_date
        and task.due_date < (
            datetime.utcnow() + timedelta(days=7)
        )
        and task.status != "completed"
    ]

    task_distribution = {
        "todo": len([
            t for t in tasks
            if t.status == "todo"
        ]),
        "in_progress": len([
            t for t in tasks
            if t.status == "in_progress"
        ]),
        "review": len([
            t for t in tasks
            if t.status == "review"
        ]),
        "completed": len([
            t for t in tasks
            if t.status == "completed"
        ]),
    }

    analytics = {
        "total_projects": len(projects),
        "active_projects": len(active_projects),
        "completed_projects": len(completed_projects),
        "overdue_projects": len(overdue_projects),
        "total_tasks": len(tasks),
        "completed_tasks": len(completed_tasks),
        "upcoming_deadlines": len(upcoming_deadlines),
        "task_distribution": task_distribution,
    }

    if db:
        ai = analyze_operational_intelligence(
            db=db,
            current_user=current_user,
            role=role,
        )
        analytics.update({
            "risk_score": ai.get("risk_score", 0),
            "urgency_level": ai.get("urgency_level", "low"),
            "delay_probability": ai.get("delay_probability", 0),
            "workflow_health_score": ai.get("workflow_health_score", 0),
            "projects_at_risk": ai.get("projects_at_risk", []),
            "deadline_alerts": ai.get("deadline_alerts", []),
            "overloaded_users": ai.get("overloaded_users", []),
            "workflow_bottlenecks": ai.get("workflow_bottlenecks", []),
        })

    return analytics