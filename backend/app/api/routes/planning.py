from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_optional_current_user
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.sprint import Sprint, SprintTask
from app.models.task import Task
from app.models.user import User
from app.services.activity_service import create_activity
from app.services.notification_service import create_notification
from app.services.realtime_service import schedule_global_event, schedule_project_event
from app.services.automation_service import schedule_trigger


router = APIRouter()

MANAGEMENT_ROLES = {"Admin", "Manager"}
ACTIVE_STATUSES = {"planned", "active"}


class MilestonePayload(BaseModel):
    title: str = Field(..., min_length=2, max_length=180)
    description: str | None = None
    due_date: date
    status: str = "planned"
    project_id: int


class SprintPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=180)
    goal: str | None = None
    start_date: date
    end_date: date
    velocity: int = 0
    status: str = "planned"
    project_id: int | None = None


class SprintUpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    velocity: int | None = None
    status: str | None = None


class SprintTaskPayload(BaseModel):
    task_id: int
    position: int = 0


class TaskSchedulePayload(BaseModel):
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    due_date: datetime | None = None
    estimate_points: int | None = None


def require_manager(role: str | None):
    if role not in MANAGEMENT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")


def actor_label(user: User | None):
    return user.full_name if user else "A teammate"


def parse_dt(value):
    if value is None or isinstance(value, datetime):
        return value
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=None)


def project_ids_for_user(db: Session, user: User | None, role: str | None):
    if role in MANAGEMENT_ROLES:
        return None

    if not user:
        return set()

    owned = {
        project_id
        for (project_id,) in db.query(Project.id)
        .filter(Project.owner_id == user.id)
        .all()
    }
    member = {
        project_id
        for (project_id,) in db.query(ProjectMember.project_id)
        .filter(ProjectMember.user_id == user.id)
        .all()
    }
    assigned = {
        project_id
        for (project_id,) in db.query(Task.project_id)
        .filter(Task.assigned_to == user.id)
        .filter(Task.project_id.isnot(None))
        .all()
    }

    return owned | member | assigned


def can_access_project(
    db: Session,
    project_id: int | None,
    user: User | None,
    role: str | None,
):
    if project_id is None:
        return True
    if role in MANAGEMENT_ROLES:
        return True
    if not user:
        return False

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return False
    if project.owner_id == user.id:
        return True

    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .filter(ProjectMember.user_id == user.id)
        .first()
        is not None
    )


def task_query(db: Session, user: User | None, role: str | None):
    query = db.query(Task).options(joinedload(Task.project), joinedload(Task.assignee))
    project_ids = project_ids_for_user(db, user, role)

    if project_ids is None:
        return query

    filters = [Task.assigned_to == user.id] if user else []
    if project_ids:
        filters.append(Task.project_id.in_(project_ids))
    if not filters:
        return query.filter(Task.id == -1)
    return query.filter(or_(*filters))


def project_query(db: Session, user: User | None, role: str | None):
    query = db.query(Project).options(
        joinedload(Project.tasks).joinedload(Task.assignee),
        joinedload(Project.milestones),
        joinedload(Project.sprints).joinedload(Sprint.tasks).joinedload(SprintTask.task),
    )
    project_ids = project_ids_for_user(db, user, role)

    if project_ids is None:
        return query
    if not project_ids:
        return query.filter(Project.id == -1)
    return query.filter(Project.id.in_(project_ids))


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
        "priority": project.priority,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "progress": project.progress or 0,
        "owner_id": project.owner_id,
    }


def serialize_task(task: Task):
    scheduled_start = task.scheduled_start
    scheduled_end = task.scheduled_end or task.due_date
    estimate_points = task.estimate_points if task.estimate_points is not None else 1

    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "status": task.status,
        "created_at": task.created_at,
        "due_date": task.due_date,
        "scheduled_start": scheduled_start,
        "scheduled_end": scheduled_end,
        "estimate_points": estimate_points,
        "project_id": task.project_id,
        "assigned_to": task.assigned_to,
        "assignee": serialize_user(task.assignee),
        "project": serialize_project(task.project),
        "type": "task",
    }


def serialize_milestone(milestone: Milestone):
    return {
        "id": milestone.id,
        "title": milestone.title,
        "description": milestone.description,
        "due_date": milestone.due_date,
        "status": milestone.status,
        "project_id": milestone.project_id,
        "project": serialize_project(milestone.project),
        "type": "milestone",
    }


def sprint_metrics(sprint: Sprint):
    task_links = sprint.tasks or []
    tasks = [link.task for link in task_links if link.task]
    committed = sum((task.estimate_points or 1) for task in tasks)
    completed = sum((task.estimate_points or 1) for task in tasks if task.status == "completed")
    blocked = len([task for task in tasks if task.status == "blocked"])
    progress = round((completed / committed) * 100) if committed else 0

    return {
        "committed_points": committed,
        "completed_points": completed,
        "remaining_points": max(committed - completed, 0),
        "completion_rate": progress,
        "blocked_tasks": blocked,
        "task_count": len(tasks),
    }


def serialize_sprint(sprint: Sprint):
    metrics = sprint_metrics(sprint)
    return {
        "id": sprint.id,
        "name": sprint.name,
        "goal": sprint.goal,
        "start_date": sprint.start_date,
        "end_date": sprint.end_date,
        "velocity": sprint.velocity or 0,
        "status": sprint.status,
        "project_id": sprint.project_id,
        "project": serialize_project(sprint.project),
        "metrics": metrics,
        "tasks": [
            {
                **serialize_task(link.task),
                "sprint_position": link.position or 0,
            }
            for link in sorted(sprint.tasks or [], key=lambda link: link.position or 0)
            if link.task
        ],
    }


def task_window(task: Task):
    start = task.scheduled_start
    end = task.scheduled_end or task.due_date
    if start and end and end < start:
        end = start
    return start, end


def build_workload(tasks: list[Task], users: list[User]):
    user_map = {user.id: user for user in users}
    load_by_user: dict[int, dict[str, object]] = {}
    conflicts = []

    for task in tasks:
        if not task.assigned_to:
            continue

        start, end = task_window(task)
        points = task.estimate_points or 1
        row = load_by_user.setdefault(
            task.assigned_to,
            {
                "user": serialize_user(user_map.get(task.assigned_to)),
                "points": 0,
                "scheduled_tasks": 0,
                "overdue_tasks": 0,
                "days": defaultdict(int),
                "tasks": [],
            },
        )
        row["points"] += points
        row["scheduled_tasks"] += 1 if start or end else 0
        row["tasks"].append(serialize_task(task))

        if end and end < datetime.utcnow() and task.status != "completed":
            row["overdue_tasks"] += 1

        active_day = (start or end or datetime.utcnow()).date()
        last_day = (end or start or datetime.utcnow()).date()
        while active_day <= last_day:
            row["days"][active_day.isoformat()] += points
            active_day += timedelta(days=1)

    workload = []
    for row in load_by_user.values():
        daily_peak = max(row["days"].values()) if row["days"] else 0
        utilization = min(round((daily_peak / 8) * 100), 200)
        overloaded = daily_peak > 8 or row["points"] > 40
        row["daily_peak"] = daily_peak
        row["utilization"] = utilization
        row["overloaded"] = overloaded
        row["days"] = dict(row["days"])
        workload.append(row)
        if overloaded:
            conflicts.append({
                "type": "workload_overload",
                "severity": "high",
                "message": f"{row['user']['full_name'] if row['user'] else 'A teammate'} is over planned capacity.",
                "user": row["user"],
            })

    return sorted(workload, key=lambda item: item["points"], reverse=True), conflicts


def build_ai_insights(tasks: list[Task], sprints: list[Sprint], workload_conflicts: list[dict]):
    now = datetime.utcnow()
    insights = []

    overdue = [
        task for task in tasks
        if (task.scheduled_end or task.due_date)
        and (task.scheduled_end or task.due_date) < now
        and task.status != "completed"
    ]
    if overdue:
        insights.append({
            "type": "delivery_risk",
            "severity": "critical",
            "title": "Overdue scheduled work",
            "message": f"{len(overdue)} scheduled task(s) are past their planned finish date.",
        })

    for sprint in sprints:
        metrics = sprint_metrics(sprint)
        if sprint.velocity and metrics["committed_points"] > sprint.velocity:
            insights.append({
                "type": "sprint_overload",
                "severity": "high",
                "title": "Sprint commitment exceeds velocity",
                "message": f"{sprint.name} is committed at {metrics['committed_points']} points against a velocity of {sprint.velocity}.",
            })
        if sprint.status in ACTIVE_STATUSES and sprint.end_date < date.today() and metrics["completion_rate"] < 100:
            insights.append({
                "type": "missed_velocity_target",
                "severity": "high",
                "title": "Sprint target at risk",
                "message": f"{sprint.name} has passed its end date with {metrics['remaining_points']} point(s) remaining.",
            })

    for conflict in workload_conflicts:
        insights.append({
            "type": conflict["type"],
            "severity": conflict["severity"],
            "title": "Workload imbalance",
            "message": conflict["message"],
        })

    if not insights:
        insights.append({
            "type": "planning_health",
            "severity": "low",
            "title": "Plan is balanced",
            "message": "No major deadline, sprint, or workload risks detected in the current plan.",
        })

    return insights


@router.get("/workspace")
def get_planning_workspace(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    tasks = task_query(db, current_user, role).order_by(Task.created_at.desc()).all()
    projects = project_query(db, current_user, role).order_by(Project.created_at.desc()).all()
    project_ids = [project.id for project in projects]

    milestones = (
        db.query(Milestone)
        .options(joinedload(Milestone.project))
        .filter(Milestone.project_id.in_(project_ids))
        .order_by(Milestone.due_date.asc())
        .all()
        if project_ids
        else []
    )
    sprints = (
        db.query(Sprint)
        .options(
            joinedload(Sprint.project),
            joinedload(Sprint.tasks).joinedload(SprintTask.task).joinedload(Task.assignee),
            joinedload(Sprint.tasks).joinedload(SprintTask.task).joinedload(Task.project),
        )
        .filter(or_(Sprint.project_id.in_(project_ids), Sprint.project_id.is_(None)))
        .order_by(Sprint.start_date.asc())
        .all()
        if role in MANAGEMENT_ROLES
        else db.query(Sprint)
        .options(
            joinedload(Sprint.project),
            joinedload(Sprint.tasks).joinedload(SprintTask.task).joinedload(Task.assignee),
            joinedload(Sprint.tasks).joinedload(SprintTask.task).joinedload(Task.project),
        )
        .filter(Sprint.project_id.in_(project_ids))
        .order_by(Sprint.start_date.asc())
        .all()
        if project_ids
        else []
    )

    users = db.query(User).all() if role in MANAGEMENT_ROLES else ([current_user] if current_user else [])
    workload, workload_conflicts = build_workload(tasks, users)

    return {
        "calendar": {
            "tasks": [serialize_task(task) for task in tasks if task.due_date or task.scheduled_start or task.scheduled_end],
            "milestones": [serialize_milestone(milestone) for milestone in milestones],
        },
        "timeline": [
            {
                **serialize_project(project),
                "tasks": [serialize_task(task) for task in project.tasks],
                "milestones": [serialize_milestone(milestone) for milestone in project.milestones],
            }
            for project in projects
        ],
        "sprints": [serialize_sprint(sprint) for sprint in sprints],
        "workload": workload,
        "ai_insights": build_ai_insights(tasks, sprints, workload_conflicts),
        "projects": [serialize_project(project) for project in projects],
        "unscheduled_tasks": [
            serialize_task(task)
            for task in tasks
            if not task.scheduled_start and not task.scheduled_end and not task.due_date
        ],
    }


@router.get("/calendar")
def get_calendar_items(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    return get_planning_workspace(db, role, current_user)["calendar"]


@router.get("/timeline")
def get_timeline(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    return get_planning_workspace(db, role, current_user)["timeline"]


@router.get("/sprints")
def get_sprints(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    return get_planning_workspace(db, role, current_user)["sprints"]


@router.post("/sprints")
def create_sprint(
    payload: SprintPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_manager(role)
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="Sprint end date cannot be before start date")
    if payload.project_id and not can_access_project(db, payload.project_id, current_user, role):
        raise HTTPException(status_code=403, detail="Permission denied")

    sprint = Sprint(
        name=payload.name,
        goal=payload.goal,
        start_date=payload.start_date,
        end_date=payload.end_date,
        velocity=payload.velocity,
        status=payload.status,
        project_id=payload.project_id,
        created_by=current_user.id if current_user else None,
    )
    db.add(sprint)
    db.flush()

    create_activity(
        db=db,
        action_type="sprint_created",
        message=f"{actor_label(current_user)} created sprint {sprint.name}.",
        user_id=current_user.id if current_user else None,
        project_id=sprint.project_id,
        entity_type="sprint",
        entity_id=sprint.id,
    )
    db.commit()
    db.refresh(sprint)

    schedule_project_event(sprint.project_id, "sprint.created", {"sprint_id": sprint.id})
    if sprint.project_id is None:
        schedule_global_event("sprint.created", {"sprint_id": sprint.id})
    schedule_global_event("analytics.updated", {"source": "sprint.created", "sprint_id": sprint.id})

    return serialize_sprint(sprint)


@router.put("/sprints/{sprint_id}")
def update_sprint(
    sprint_id: int,
    payload: SprintUpdatePayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_manager(role)
    sprint = db.query(Sprint).options(joinedload(Sprint.tasks).joinedload(SprintTask.task)).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    if not can_access_project(db, sprint.project_id, current_user, role):
        raise HTTPException(status_code=403, detail="Permission denied")

    updates = payload.model_dump(exclude_unset=True)
    start_date = updates.get("start_date", sprint.start_date)
    end_date = updates.get("end_date", sprint.end_date)
    if end_date < start_date:
        raise HTTPException(status_code=422, detail="Sprint end date cannot be before start date")

    for key, value in updates.items():
        setattr(sprint, key, value)

    metrics = sprint_metrics(sprint)
    sprint.committed_points = metrics["committed_points"]
    sprint.completed_points = metrics["completed_points"]

    create_activity(
        db=db,
        action_type="sprint_updated",
        message=f"{actor_label(current_user)} updated sprint {sprint.name}.",
        user_id=current_user.id if current_user else None,
        project_id=sprint.project_id,
        entity_type="sprint",
        entity_id=sprint.id,
    )
    db.commit()
    db.refresh(sprint)

    schedule_project_event(sprint.project_id, "sprint.updated", {"sprint_id": sprint.id})
    schedule_global_event("analytics.updated", {"source": "sprint.updated", "sprint_id": sprint.id})
    return serialize_sprint(sprint)


@router.post("/sprints/{sprint_id}/tasks")
def add_task_to_sprint(
    sprint_id: int,
    payload: SprintTaskPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_manager(role)
    sprint = db.query(Sprint).options(joinedload(Sprint.tasks).joinedload(SprintTask.task)).filter(Sprint.id == sprint_id).first()
    task = db.query(Task).filter(Task.id == payload.task_id).first()
    if not sprint or not task:
        raise HTTPException(status_code=404, detail="Sprint or task not found")
    if not can_access_project(db, sprint.project_id, current_user, role) or not can_access_project(db, task.project_id, current_user, role):
        raise HTTPException(status_code=403, detail="Permission denied")

    existing = db.query(SprintTask).filter(SprintTask.task_id == task.id).first()
    if existing:
        existing.sprint_id = sprint.id
        existing.position = payload.position
    else:
        db.add(SprintTask(sprint_id=sprint.id, task_id=task.id, position=payload.position))

    db.flush()
    metrics = sprint_metrics(sprint)
    sprint.committed_points = metrics["committed_points"]
    sprint.completed_points = metrics["completed_points"]

    create_activity(
        db=db,
        action_type="sprint_updated",
        message=f"{actor_label(current_user)} planned {task.title} into {sprint.name}.",
        user_id=current_user.id if current_user else None,
        project_id=task.project_id or sprint.project_id,
        task_id=task.id,
        entity_type="sprint",
        entity_id=sprint.id,
    )
    db.commit()

    schedule_project_event(task.project_id or sprint.project_id, "sprint.updated", {"sprint_id": sprint.id, "task_id": task.id})
    schedule_global_event("analytics.updated", {"source": "sprint.updated", "sprint_id": sprint.id, "task_id": task.id})
    return serialize_sprint(sprint)


@router.put("/tasks/{task_id}/schedule")
def schedule_task(
    task_id: int,
    payload: TaskSchedulePayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_manager(role)
    task = db.query(Task).options(joinedload(Task.project), joinedload(Task.assignee)).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_access_project(db, task.project_id, current_user, role):
        raise HTTPException(status_code=403, detail="Permission denied")

    old_start = task.scheduled_start
    old_end = task.scheduled_end or task.due_date
    updates = payload.model_dump(exclude_unset=True)

    if "scheduled_start" in updates:
        task.scheduled_start = parse_dt(updates["scheduled_start"])
    if "scheduled_end" in updates:
        task.scheduled_end = parse_dt(updates["scheduled_end"])
    if "due_date" in updates:
        task.due_date = parse_dt(updates["due_date"])
    if "estimate_points" in updates and updates["estimate_points"] is not None:
        task.estimate_points = max(1, int(updates["estimate_points"]))

    if task.scheduled_start and task.scheduled_end and task.scheduled_end < task.scheduled_start:
        raise HTTPException(status_code=422, detail="Scheduled end cannot be before scheduled start")

    create_activity(
        db=db,
        action_type="task_rescheduled",
        message=f"{actor_label(current_user)} rescheduled {task.title}.",
        user_id=current_user.id if current_user else None,
        project_id=task.project_id,
        task_id=task.id,
        entity_type="task",
        entity_id=task.id,
    )

    if (task.scheduled_end or task.due_date) and (task.scheduled_end or task.due_date) < datetime.utcnow() and task.status != "completed":
        create_notification(
            db=db,
            user_id=task.assigned_to,
            title="Scheduling conflict",
            message=f"{task.title} is scheduled past its deadline window.",
            type="warning",
            severity="high",
        )

    db.commit()
    db.refresh(task)

    event = "task.rescheduled" if task.scheduled_start != old_start or (task.scheduled_end or task.due_date) != old_end else "roadmap.updated"
    schedule_project_event(task.project_id, event, {"task_id": task.id, "project_id": task.project_id})
    schedule_global_event(event, {"task_id": task.id, "project_id": task.project_id})
    schedule_global_event("analytics.updated", {"source": event, "task_id": task.id, "project_id": task.project_id})

    return serialize_task(task)


@router.post("/milestones")
def create_milestone(
    payload: MilestonePayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User | None = Depends(get_optional_current_user),
):
    require_manager(role)
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_access_project(db, payload.project_id, current_user, role):
        raise HTTPException(status_code=403, detail="Permission denied")

    milestone = Milestone(
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        status=payload.status,
        project_id=payload.project_id,
        created_by=current_user.id if current_user else None,
    )
    db.add(milestone)
    db.flush()
    create_activity(
        db=db,
        action_type="milestone_created",
        message=f"{actor_label(current_user)} created milestone {milestone.title}.",
        user_id=current_user.id if current_user else None,
        project_id=payload.project_id,
        entity_type="milestone",
        entity_id=milestone.id,
    )
    create_notification(
        db=db,
        user_id=project.owner_id,
        title="Milestone created",
        message=f"{milestone.title} was added to {project.name}.",
        type="info",
    )
    db.commit()
    db.refresh(milestone)

    schedule_project_event(payload.project_id, "milestone.created", {"milestone_id": milestone.id})
    schedule_project_event(payload.project_id, "roadmap.updated", {"project_id": payload.project_id})
    schedule_global_event("analytics.updated", {"source": "milestone.created", "milestone_id": milestone.id, "project_id": payload.project_id})

    if milestone.status == "completed":
        schedule_trigger(
            "milestone.completed",
            {
                "milestone_id": milestone.id,
                "project_id": milestone.project_id,
                "actor_id": current_user.id if current_user else None,
                "entity_type": "milestone",
                "entity_id": milestone.id,
                "message": milestone.title,
            },
        )

    return serialize_milestone(milestone)
