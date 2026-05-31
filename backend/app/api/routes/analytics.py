import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.activity import Activity
from app.models.project import Project
from app.models.task import Task
from app.models.user import User


router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)

logger = logging.getLogger(__name__)


def _date_value(model, *names):
    for name in names:
        if hasattr(model, name):
            value = getattr(model, name)
            if value:
                return value
    return None


def _safe_iso(value):
    return value.isoformat() if value else None


def _project_deadline(project: Project):
    return _date_value(project, "deadline", "end_date")


def _task_deadline(task: Task):
    return _date_value(task, "deadline", "due_date", "scheduled_end")


def _as_datetime(value):
    if not value:
        return None

    if isinstance(value, datetime):
        return value.replace(tzinfo=None)

    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())

    return None


def _project_progress(project: Project, tasks: list[Task]):
    project_tasks = [task for task in tasks if task.project_id == project.id]

    if not project_tasks:
        return project.progress or 0

    completed = len(
        [task for task in project_tasks if task.status == "completed"]
    )

    return round((completed / len(project_tasks)) * 100)


def _scope_dashboard(all_projects: list[Project], all_tasks: list[Task], current_user: User, role: str | None):
    effective_role = role or current_user.role

    if effective_role in ["Admin", "Manager"]:
        return all_projects, all_tasks

    assigned_tasks = [
        task for task in all_tasks
        if task.assigned_to == current_user.id
    ]
    project_ids = {
        task.project_id
        for task in assigned_tasks
        if task.project_id
    }
    project_ids.update({
        project.id
        for project in all_projects
        if project.owner_id == current_user.id
    })

    scoped_projects = [
        project for project in all_projects
        if project.id in project_ids
    ]
    scoped_tasks = [
        task for task in all_tasks
        if task.assigned_to == current_user.id
        or (task.project_id and task.project_id in project_ids)
    ]

    return scoped_projects, scoped_tasks


@router.get("/dashboard")
def get_dashboard_data(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    try:
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        last_month_start = now - timedelta(days=60)

        all_projects = (
            db.query(Project)
            .order_by(Project.created_at.desc())
            .all()
        )
        all_tasks = db.query(Task).all()
        all_projects, all_tasks = _scope_dashboard(
            all_projects,
            all_tasks,
            current_user,
            role,
        )
        total_projects = len(all_projects)

        projects_this_month = [
            project
            for project in all_projects
            if project.created_at and project.created_at >= month_ago
        ]
        projects_last_month = [
            project
            for project in all_projects
            if project.created_at
            and last_month_start <= project.created_at < month_ago
        ]
        projects_growth = round(
            (
                (len(projects_this_month) - len(projects_last_month))
                / max(len(projects_last_month), 1)
            )
            * 100,
            1,
        )

        total_tasks = len(all_tasks)
        task_ids = [task.id for task in all_tasks]
        completion_activities = []
        if task_ids:
            completion_activities = (
                db.query(Activity)
                .filter(Activity.task_id.in_(task_ids))
                .filter(
                    (Activity.action == "task_completed")
                    | (Activity.action_type == "task_completed")
                )
                .all()
            )

        tasks_completed_this_week = len([
            activity
            for activity in completion_activities
            if activity.created_at and activity.created_at >= week_ago
        ])
        tasks_completed_pct = round(
            (tasks_completed_this_week / max(total_tasks, 1)) * 100,
            1,
        )

        completed_tasks = [
            task for task in all_tasks if task.status == "completed"
        ]
        active_tasks = [
            task for task in all_tasks if task.status != "completed"
        ]
        productivity_score = round(
            (len(completed_tasks) / max(total_tasks, 1)) * 100,
            1,
        )

        tasks_completed_last_week = len([
            activity
            for activity in completion_activities
            if activity.created_at
            and week_ago - timedelta(days=7) <= activity.created_at < week_ago
        ])
        productivity_trend = tasks_completed_this_week - tasks_completed_last_week

        upcoming = []
        for task in all_tasks:
            deadline = _as_datetime(_task_deadline(task))
            if (
                deadline
                and deadline > now
                and deadline <= now + timedelta(days=7)
                and task.status != "completed"
            ):
                upcoming.append(task)

        if upcoming:
            soonest = min(
                upcoming,
                key=lambda task: _as_datetime(_task_deadline(task)),
            )
            soonest_deadline = _as_datetime(_task_deadline(soonest))
            days_away = (soonest_deadline - now).days
            if days_away == 0:
                next_deadline_label = "Due today"
            elif days_away == 1:
                next_deadline_label = "Due tomorrow"
            else:
                next_deadline_label = f"Next due in {days_away} days"
        else:
            next_deadline_label = "No upcoming deadlines"

        overdue_tasks = [
            task
            for task in all_tasks
            if _as_datetime(_task_deadline(task))
            and _as_datetime(_task_deadline(task))
            < now
            and task.status != "completed"
        ]
        task_status_breakdown = {
            "todo": len([task for task in all_tasks if task.status == "todo"]),
                "in_progress": len(
                    [task for task in all_tasks if task.status == "in_progress"]
                ),
            "review": len(
                [task for task in all_tasks if task.status == "review"]
            ),
                "completed": len(completed_tasks),
                "overdue": len(overdue_tasks),
                "active": len(active_tasks),
                "blocked": len(
                    [task for task in all_tasks if task.status == "blocked"]
                ),
        }

        projects_at_risk = []
        for project in all_projects:
            project_tasks = [task for task in all_tasks if task.project_id == project.id]
            progress = _project_progress(project, all_tasks)
            blocked_count = len([task for task in project_tasks if task.status == "blocked"])
            overdue_count = len([
                task
                for task in project_tasks
                if _as_datetime(_task_deadline(task))
                and _as_datetime(_task_deadline(task)) < now
                and task.status != "completed"
            ])
            deadline = _project_deadline(project)
            deadline_dt = _as_datetime(deadline)
            days_left = (deadline_dt - now).days if deadline_dt else None
            is_at_risk = (
                overdue_count > 0
                or blocked_count > 0
                or (
                    days_left is not None
                    and days_left <= 7
                    and project.status != "completed"
                    and progress < 80
                )
            )
            if is_at_risk:
                projects_at_risk.append({
                    "id": str(project.id),
                    "name": project.name,
                    "status": "delayed" if overdue_count else "at_risk",
                    "progress": progress,
                    "deadline": _safe_iso(deadline),
                    "priority": project.priority,
                    "blocked_tasks": blocked_count,
                    "overdue_tasks": overdue_count,
                })

        months_data = []
        for i in range(5, -1, -1):
            target_month = now.month - i
            year = now.year
            while target_month <= 0:
                target_month += 12
                year -= 1
            month_start = datetime(year, target_month, 1)
            if target_month == 12:
                month_end = datetime(year + 1, 1, 1)
            else:
                month_end = datetime(year, target_month + 1, 1)

            month_projects = [
                project
                for project in all_projects
                if project.created_at
                and month_start <= project.created_at < month_end
            ]
            months_data.append(
                {
                    "month": month_start.strftime("%b"),
                    "active": len(
                        [
                            project
                            for project in month_projects
                            if project.status == "active"
                        ]
                    ),
                    "completed": len(
                        [
                            project
                            for project in month_projects
                            if project.status == "completed"
                        ]
                    ),
                    "atRisk": len(
                        [
                            project
                            for project in month_projects
                            if project.status in ["at_risk", "delayed"]
                        ]
                    ),
                }
            )

        projects_list = [
            {
                "id": str(project.id),
                "name": project.name,
                "description": project.description,
                "status": project.status,
                "priority": project.priority,
                "progress": _project_progress(project, all_tasks),
                "deadline": _safe_iso(_project_deadline(project)),
                "created_at": _safe_iso(project.created_at),
            }
            for project in all_projects
        ]

        logger.info(
            "dashboard.analytics user_id=%s projects=%s tasks=%s completed=%s active=%s overdue=%s upcoming=%s productivity=%s",
            current_user.id,
            total_projects,
            total_tasks,
            len(completed_tasks),
            len(active_tasks),
            len(overdue_tasks),
            len(upcoming),
            productivity_score,
        )

        return {
            "stats": {
                "total_projects": total_projects,
                "projects_growth": projects_growth,
                "total_tasks": total_tasks,
                "completed_tasks": len(completed_tasks),
                "active_tasks": len(active_tasks),
                "overdue_tasks": len(overdue_tasks),
                "tasks_completed_pct": tasks_completed_pct,
                "productivity_score": productivity_score,
                "productivity_trend": productivity_trend,
                "upcoming_deadlines": len(upcoming),
                "next_deadline_label": next_deadline_label,
            },
            "task_status_breakdown": task_status_breakdown,
            "projects_at_risk": projects_at_risk,
            "project_chart_data": months_data,
            "projects": projects_list,
        }
    except Exception as error:
        print(f"Dashboard error: {error}")
        import traceback

        traceback.print_exc()
        return {
            "stats": {
                "total_projects": 0,
                "projects_growth": 0,
                "total_tasks": 0,
                "tasks_completed_pct": 0,
                "productivity_score": 0,
                "productivity_trend": 0,
                "upcoming_deadlines": 0,
                "next_deadline_label": "No upcoming deadlines",
            },
            "task_status_breakdown": {
                "todo": 0,
                "in_progress": 0,
                "review": 0,
                "completed": 0,
                "overdue": 0,
            },
            "projects_at_risk": [],
            "project_chart_data": [],
            "projects": [],
        }
