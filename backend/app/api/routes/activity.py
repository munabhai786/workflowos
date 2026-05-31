from fastapi import APIRouter, Depends, Header
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_optional_current_user
from app.models.activity import Activity
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.user import User
from app.utils.helpers import success_response


router = APIRouter()


def serialize_activity(activity: Activity):
    return {
        "id": activity.id,
        "action": activity.action,
        "description": activity.description,
        "action_type": activity.action,
        "message": activity.description,
        "entity_type": activity.entity_type,
        "entity_id": activity.entity_id,
        "user_id": activity.user_id,
        "project_id": activity.project_id,
        "task_id": activity.task_id,
        "created_at": activity.created_at,
        "user": activity.user,
        "project": activity.project,
        "task": activity.task,
    }


def scoped_activity_query(
    db: Session,
    current_user: User | None,
    role: str | None,
):
    query = (
        db.query(Activity)
        .options(
            joinedload(Activity.user),
            joinedload(Activity.project),
            joinedload(Activity.task),
        )
    )

    if role in ["Admin", "Manager"]:
        return query

    if not current_user:
        return query.filter(Activity.id == -1)

    assigned_project_ids = [
        project_id for (project_id,) in (
            db.query(ProjectMember.project_id)
            .filter(ProjectMember.user_id == current_user.id)
            .all()
        )
    ]

    owned_project_ids = [
        project_id for (project_id,) in (
            db.query(Project.id)
            .filter(Project.owner_id == current_user.id)
            .all()
        )
    ]

    task_project_ids = [
        project_id for (project_id,) in (
            db.query(Task.project_id)
            .filter(Task.assigned_to == current_user.id)
            .filter(Task.project_id.isnot(None))
            .all()
        )
    ]

    task_ids = [
        task_id for (task_id,) in (
            db.query(Task.id)
            .filter(Task.assigned_to == current_user.id)
            .all()
        )
    ]

    visible_project_ids = list(set(
        assigned_project_ids +
        owned_project_ids +
        task_project_ids
    ))

    filters = [
        Activity.user_id == current_user.id,
    ]

    if visible_project_ids:
        filters.append(
            Activity.project_id.in_(visible_project_ids)
        )

    if task_ids:
        filters.append(
            Activity.task_id.in_(task_ids)
        )

    return query.filter(or_(*filters))


@router.get("/")
def get_activities(
    limit: int = 30,
    project_id: int | None = None,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    query = scoped_activity_query(
        db,
        current_user,
        role,
    )

    if project_id:
        query = query.filter(
            Activity.project_id == project_id
        )

    activities = (
        query.order_by(Activity.created_at.desc())
        .limit(min(limit, 100))
        .all()
    )

    return success_response([
        serialize_activity(activity)
        for activity in activities
    ])
