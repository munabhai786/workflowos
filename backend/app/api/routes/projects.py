import logging
from datetime import date, datetime

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
)

from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_optional_current_user
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.activity_service import create_activity
from app.services.notification_service import create_notification
from app.services.realtime_service import schedule_global_event, schedule_project_event
from app.core.rbac import RBAC

router = APIRouter()

logger = logging.getLogger(__name__)


WRITE_ROLES = [
    "Admin",
    "Manager",
]


def require_admin_or_manager(current_user_role: str | None):
    decision = RBAC.check_global_permission(
        user_role=current_user_role or "",
        permission="projects_write",
    )
    if not decision.allowed:
        raise HTTPException(
            status_code=403,
            detail="Permission denied",
        )



def calculate_progress(tasks: list[Task]):
    if not tasks:
        return 0

    completed_tasks = [
        task for task in tasks
        if task.status == "completed"
    ]

    return round(
        (len(completed_tasks) / len(tasks)) * 100
    )


def serialize_project(project: Project):
    tasks = project.tasks or []
    completed_task_count = len([
        task for task in tasks
        if task.status == "completed"
    ])

    progress = calculate_progress(tasks)
    project.progress = progress

    is_completed = (
        project.status == "completed" or
        progress == 100
    )

    is_overdue = (
        project.end_date is not None and
        project.end_date < date.today() and
        not is_completed
    )

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "priority": project.priority,
        "status": project.status,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "progress": progress,
        "owner_id": project.owner_id,
        "created_at": project.created_at,
        "email_sent": project.email_sent,
        "last_alert_at": project.last_alert_at,
        "alert_level": project.alert_level,
        "owner": project.owner,
        "task_count": len(tasks),
        "completed_task_count": completed_task_count,
        "is_overdue": is_overdue,
    }


def normalize_project_payload(payload: dict):
    if payload.get("deadline") and not payload.get("end_date"):
        payload["end_date"] = payload.get("deadline")

    payload.pop("deadline", None)
    payload.pop("progress", None)

    for field in ["start_date", "end_date"]:
        if isinstance(payload.get(field), datetime):
            payload[field] = payload[field].date()

    return payload


def validate_project_date_range(
    start_date: date | None,
    end_date: date | None,
):
    if not start_date:
        raise HTTPException(
            status_code=422,
            detail="Start date is required.",
        )

    if not end_date:
        raise HTTPException(
            status_code=422,
            detail="End date is required.",
        )

    if end_date < start_date:
        raise HTTPException(
            status_code=422,
            detail="End date cannot be earlier than start date.",
        )


def ensure_owner_exists(owner_id: int | None, db: Session):
    if owner_id is None:
        return

    owner = (
        db.query(User)
        .filter(User.id == owner_id)
        .first()
    )

    if not owner:
        raise HTTPException(
            status_code=404,
            detail="Owner not found",
        )


def actor_label(user: User | None):
    return user.full_name if user else "A teammate"


def notify_project_owner(
    db: Session,
    project: Project,
    title: str,
    message: str,
    type: str = "info",
):
    if project.owner_id:
        create_notification(
            db=db,
            user_id=project.owner_id,
            title=title,
            message=message,
            type=type,
        )


@router.get("/")
def get_projects(
    db: Session = Depends(get_db),
):
    projects = (
        db.query(Project)
        .options(
            joinedload(Project.owner),
            joinedload(Project.tasks),
        )
        .order_by(Project.created_at.desc())
        .all()
    )

    return [
        serialize_project(project)
        for project in projects
    ]


@router.get("/analytics/summary")
def get_project_analytics(
    db: Session = Depends(get_db),
):
    projects = (
        db.query(Project)
        .options(joinedload(Project.tasks))
        .all()
    )

    serialized_projects = [
        serialize_project(project)
        for project in projects
    ]

    overdue_projects = [
        project for project in serialized_projects
        if project["is_overdue"]
    ]

    completed_projects = [
        project for project in serialized_projects
        if (
            project["status"] == "completed" or
            project["progress"] == 100
        )
    ]

    active_projects = [
        project for project in serialized_projects
        if (
            project["status"] == "active" and
            not project["is_overdue"] and
            project["progress"] < 100
        )
    ]

    return {
        "total": len(serialized_projects),
        "active": len(active_projects),
        "overdue": len(overdue_projects),
        "completed": len(completed_projects),
    }


@router.post("/")
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_admin_or_manager(current_user.role if current_user else None)


    payload = normalize_project_payload(
        project.model_dump()
    )

    validate_project_date_range(
        payload.get("start_date"),
        payload.get("end_date"),
    )

    ensure_owner_exists(
        payload.get("owner_id"),
        db,
    )

    new_project = Project(**payload)

    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    create_activity(
        db=db,
        action_type="project_created",
        message=f"{actor_label(current_user)} created project {new_project.name}.",
        user_id=current_user.id if current_user else None,
        project_id=new_project.id,
    )

    if new_project.owner_id:
        create_activity(
            db=db,
            action_type="user_assigned_to_project",
            message=f"{new_project.owner.full_name if new_project.owner else 'A user'} was assigned to project {new_project.name}.",
            user_id=current_user.id if current_user else None,
            project_id=new_project.id,
        )
        notify_project_owner(
            db=db,
            project=new_project,
            title="You were assigned to a project",
            message=f"You are the owner of {new_project.name}.",
            type="info",
        )

    if new_project.end_date and new_project.end_date <= date.today():
        notify_project_owner(
            db=db,
            project=new_project,
            title="Project deadline needs attention",
            message=f"{new_project.name} has a deadline that is due now or overdue.",
            type="warning",
        )

    db.commit()

    logger.info(
        "project.created project_id=%s status=%s owner_id=%s end_date=%s",
        new_project.id,
        new_project.status,
        new_project.owner_id,
        new_project.end_date,
    )

    schedule_project_event(
        new_project.id,
        "project.created",
        {"project_id": new_project.id, "name": new_project.name},
    )
    schedule_global_event(
        "analytics.updated",
        {"source": "project.created", "project_id": new_project.id},
    )

    return serialize_project(new_project)


@router.put("/{project_id}")
def update_project(
    project_id: int,
    updated_project: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_admin_or_manager(current_user.role if current_user else None)


    project = (
        db.query(Project)
        .options(
            joinedload(Project.owner),
            joinedload(Project.tasks),
        )
        .filter(Project.id == project_id)
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    previous_status = project.status
    previous_owner_id = project.owner_id
    previous_end_date = project.end_date

    payload = normalize_project_payload(
        updated_project.model_dump(
            exclude_unset=True
        )
    )

    next_start_date = payload.get(
        "start_date",
        project.start_date,
    )
    next_end_date = payload.get(
        "end_date",
        project.end_date,
    )

    if "start_date" in payload or "end_date" in payload:
        validate_project_date_range(
            next_start_date,
            next_end_date,
        )

    ensure_owner_exists(
        payload.get("owner_id"),
        db,
    )

    for key, value in payload.items():
        setattr(project, key, value)

    if (
        "end_date" in payload and
        payload.get("end_date") != previous_end_date
    ):
        project.email_sent = False
        project.last_alert_at = None
        project.alert_level = "none"

    db.commit()
    db.refresh(project)

    create_activity(
        db=db,
        action_type="project_updated",
        message=f"{actor_label(current_user)} updated project {project.name}.",
        user_id=current_user.id if current_user else None,
        project_id=project.id,
    )

    if (
        "status" in payload and
        payload.get("status") != previous_status
    ):
        create_activity(
            db=db,
            action_type="project_status_changed",
            message=f"{actor_label(current_user)} changed {project.name} from {previous_status} to {project.status}.",
            user_id=current_user.id if current_user else None,
            project_id=project.id,
        )

        notify_project_owner(
            db=db,
            project=project,
            title="Project status changed",
            message=f"{project.name} is now {project.status}.",
            type="info",
        )

        if project.status == "completed":
            create_activity(
                db=db,
                action_type="project_completed",
                message=f"{actor_label(current_user)} completed project {project.name}.",
                user_id=current_user.id if current_user else None,
                project_id=project.id,
            )
            notify_project_owner(
                db=db,
                project=project,
                title="Project completed",
                message=f"{project.name} has been completed.",
                type="success",
            )

    if (
        "owner_id" in payload and
        payload.get("owner_id") != previous_owner_id
    ):
        create_activity(
            db=db,
            action_type="user_assigned_to_project",
            message=f"{project.owner.full_name if project.owner else 'A user'} was assigned to project {project.name}.",
            user_id=current_user.id if current_user else None,
            project_id=project.id,
        )
        notify_project_owner(
            db=db,
            project=project,
            title="You were assigned to a project",
            message=f"You are now responsible for {project.name}.",
            type="info",
        )

    if project.end_date:
        days_until_due = (
            project.end_date - date.today()
        ).days

        if 0 <= days_until_due <= 3 and project.status != "completed":
            notify_project_owner(
                db=db,
                project=project,
                title="Project deadline approaching",
                message=f"{project.name} is due in {days_until_due} day(s).",
                type="warning",
            )

    db.commit()

    logger.info(
        "project.updated project_id=%s status=%s owner_id=%s end_date=%s",
        project.id,
        project.status,
        project.owner_id,
        project.end_date,
    )

    schedule_project_event(
        project.id,
        "project.updated",
        {"project_id": project.id, "name": project.name},
    )
    schedule_global_event(
        "analytics.updated",
        {"source": "project.updated", "project_id": project.id},
    )

    return serialize_project(project)


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_admin_or_manager(current_user.role if current_user else None)


    project = (
        db.query(Project)
        .filter(Project.id == project_id)
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    db.delete(project)
    db.commit()

    logger.info("project.deleted project_id=%s", project_id)

    schedule_project_event(
        project_id,
        "project.deleted",
        {"project_id": project_id},
    )
    schedule_global_event(
        "analytics.updated",
        {"source": "project.deleted", "project_id": project_id},
    )

    return {
        "message": "Project deleted successfully",
    }
