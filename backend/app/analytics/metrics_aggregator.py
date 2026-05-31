from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models.activity import Activity
from app.models.attachment import Attachment
from app.models.automation import AutomationExecution, AutomationRule
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.sprint import Sprint, SprintTask
from app.models.task import Task
from app.models.task_comment import TaskComment
from app.models.user import User


MANAGEMENT_ROLES = {"Admin", "Manager"}


def clamp(value: int | float, minimum: int = 0, maximum: int = 100):
    return max(minimum, min(maximum, round(value)))


def serialize_user(user: User | None):
    if not user:
        return None
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
    }


def serialize_project(project: Project | None):
    if not project:
        return None
    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
        "progress": project.progress or 0,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "owner_id": project.owner_id,
    }


def scoped_project_ids(db: Session, current_user: User | None, role: str | None):
    if role in MANAGEMENT_ROLES:
        return None
    if not current_user:
        return set()

    owned = {
        project_id for (project_id,) in db.query(Project.id)
        .filter(Project.owner_id == current_user.id)
        .all()
    }
    member = {
        project_id for (project_id,) in db.query(ProjectMember.project_id)
        .filter(ProjectMember.user_id == current_user.id)
        .all()
    }
    assigned = {
        project_id for (project_id,) in db.query(Task.project_id)
        .filter(Task.assigned_to == current_user.id)
        .filter(Task.project_id.isnot(None))
        .all()
    }
    return owned | member | assigned


def collect_operational_data(db: Session, current_user: User | None, role: str | None):
    project_ids = scoped_project_ids(db, current_user, role)

    project_query = db.query(Project)
    task_query = db.query(Task).options(joinedload(Task.assignee), joinedload(Task.project))
    sprint_query = db.query(Sprint).options(joinedload(Sprint.tasks).joinedload(SprintTask.task))
    milestone_query = db.query(Milestone)
    activity_query = db.query(Activity)
    comment_query = db.query(TaskComment)
    attachment_query = db.query(Attachment)
    automation_rule_query = db.query(AutomationRule)
    automation_execution_query = db.query(AutomationExecution)

    if project_ids is not None:
        if not project_ids and current_user:
            task_query = task_query.filter(Task.assigned_to == current_user.id)
            project_query = project_query.filter(Project.id == -1)
            sprint_query = sprint_query.filter(Sprint.id == -1)
            milestone_query = milestone_query.filter(Milestone.id == -1)
            activity_query = activity_query.filter(
                or_(Activity.user_id == current_user.id, Activity.task_id.in_(
                    [task.id for task in task_query.all()]
                ))
            )
        else:
            task_query = task_query.filter(
                or_(
                    Task.project_id.in_(project_ids),
                    Task.assigned_to == current_user.id if current_user else Task.id == -1,
                )
            )
            project_query = project_query.filter(Project.id.in_(project_ids))
            sprint_query = sprint_query.filter(Sprint.project_id.in_(project_ids))
            milestone_query = milestone_query.filter(Milestone.project_id.in_(project_ids))
            activity_query = activity_query.filter(
                or_(
                    Activity.project_id.in_(project_ids),
                    Activity.user_id == current_user.id if current_user else Activity.id == -1,
                )
            )
            comment_query = comment_query.join(Task).filter(Task.project_id.in_(project_ids))
            attachment_query = attachment_query.filter(Attachment.project_id.in_(project_ids))
            automation_rule_query = automation_rule_query.filter(
                or_(
                    AutomationRule.project_id.in_(project_ids),
                    AutomationRule.owner_id == current_user.id if current_user else AutomationRule.id == -1,
                )
            )

    projects = project_query.all()
    tasks = task_query.all()
    task_ids = [task.id for task in tasks]
    rule_ids = [rule.id for rule in automation_rule_query.all()]

    if task_ids and project_ids is not None:
        comment_query = db.query(TaskComment).filter(TaskComment.task_id.in_(task_ids))
        attachment_query = db.query(Attachment).filter(
            or_(Attachment.task_id.in_(task_ids), Attachment.project_id.in_(project_ids or {-1}))
        )

    if rule_ids:
        automation_execution_query = automation_execution_query.filter(AutomationExecution.rule_id.in_(rule_ids))
    elif project_ids is not None:
        automation_execution_query = automation_execution_query.filter(AutomationExecution.id == -1)

    users = db.query(User).all() if role in MANAGEMENT_ROLES else ([current_user] if current_user else [])

    return {
        "now": datetime.utcnow(),
        "period_start": datetime.utcnow() - timedelta(days=30),
        "projects": projects,
        "tasks": tasks,
        "users": users,
        "sprints": sprint_query.all(),
        "milestones": milestone_query.all(),
        "activities": activity_query.all(),
        "comments": comment_query.all(),
        "attachments": attachment_query.all(),
        "automation_rules": automation_rule_query.all(),
        "automation_executions": automation_execution_query.all(),
        "scope": "organization" if role in MANAGEMENT_ROLES else "personal",
        "project_ids": project_ids,
        "current_user": current_user,
        "role": role,
    }


def daily_series(records, date_getter, days: int = 14):
    now = datetime.utcnow().date()
    buckets = {
        (now - timedelta(days=offset)).isoformat(): 0
        for offset in range(days - 1, -1, -1)
    }
    for record in records:
        value = date_getter(record)
        if not value:
            continue
        key = value.date().isoformat()
        if key in buckets:
            buckets[key] += 1
    return [
        {"date": key, "value": value}
        for key, value in buckets.items()
    ]
