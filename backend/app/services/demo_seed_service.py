from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, date
import logging

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.user import User
from app.models.project import Project
from app.models.task import Task
from app.models.milestone import Milestone
from app.models.sprint import Sprint, SprintTask
from app.models.notification import Notification
from app.models.activity import Activity
from app.models.analytics import AnalyticsSnapshot

from app.models.automation import AutomationRule, AutomationExecution
from app.models.ai_copilot import AIConversation

from app.services.activity_service import create_activity
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)


@dataclass
class DemoSeedResult:
    user_id: int
    seeded: bool
    details: dict


DEMO_PROJECTS = [
    {
        "name": "Ecommerce Launch",
        "description": "Coordinate product, engineering, and operations for a reliable ecommerce release.",
        "priority": "high",
        "status": "active",
        "start_date_offset_days": -20,
        "end_date_offset_days": 12,
    },
    {
        "name": "Mobile App Redesign",
        "description": "Rebuild navigation, polish UI flows, and ensure performance on key screens.",
        "priority": "medium",
        "status": "active",
        "start_date_offset_days": -12,
        "end_date_offset_days": 18,
    },
    {
        "name": "Marketing Sprint",
        "description": "Launch campaign assets, landing page experiments, and weekly conversion reporting.",
        "priority": "medium",
        "status": "active",
        "start_date_offset_days": -7,
        "end_date_offset_days": 25,
    },
]


BOARD_STATUSES = [
    "todo",
    "in_progress",
    "review",
    "blocked",
    "completed",
]


def _now() -> datetime:
    return datetime.utcnow().replace(tzinfo=None)


def _date_now() -> date:
    return datetime.utcnow().date()


def _ensure_user_seed_columns(db: Session):
    """Idempotently add a seed marker column if migrations haven't run.

    Avoids full infra rewrite. Uses the same style as backend/app/main.py.
    """
    inspector = db.get_bind().dialect  # just to access bind

    # Use raw SQL in SQLite-safe way (ALTER TABLE ADD COLUMN supports SQLite)
    existing = db.execute(
        text("PRAGMA table_info(users)")
    ).fetchall()
    existing_cols = {row[1] for row in existing}

    if "demo_seeded_at" not in existing_cols:
        db.execute(
            text("ALTER TABLE users ADD COLUMN demo_seeded_at DATETIME")
        )
        db.commit()

    if "onboarding_completed_at" not in existing_cols:
        db.execute(
            text("ALTER TABLE users ADD COLUMN onboarding_completed_at DATETIME")
        )
        db.commit()


def _user_demo_seeded(user: User) -> bool:
    return bool(getattr(user, "demo_seeded_at", None))


def _set_user_demo_seeded(db: Session, user: User):
    setattr(user, "demo_seeded_at", _now())
    db.add(user)
    db.commit()


def _seed_notification(db: Session, user_id: int, title: str, message: str, *, type_: str, severity: str = "low", priority: str = "normal", entity_type: str | None = None, entity_id: int | None = None):
    # Create via service so realtime/event wiring remains consistent.
    create_notification(
        db=db,
        user_id=user_id,
        title=title,
        message=message,
        type=type_,
        severity=severity,
        priority=priority,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata={},
    )
    db.commit()


def _get_or_create_project(db: Session, user: User, project_payload: dict) -> Project:
    project = db.query(Project).filter(Project.name == project_payload["name"], Project.owner_id == user.id).first()
    if project:
        return project

    start_date = _date_now() + timedelta(days=project_payload["start_date_offset_days"])
    end_date = _date_now() + timedelta(days=project_payload["end_date_offset_days"])

    project = Project(
        name=project_payload["name"],
        description=project_payload["description"],
        priority=project_payload["priority"],
        status=project_payload["status"],
        start_date=start_date,
        end_date=end_date,
        owner_id=user.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    create_activity(
        db=db,
        action_type="demo_seed.project_created",
        message=f"Demo seeded project: {project.name}.",
        user_id=user.id,
        project_id=project.id,
        entity_type="project",
        entity_id=project.id,
    )
    db.commit()

    return project


def _seed_tasks_for_project(db: Session, user: User, project: Project, status: str, task_defs: list[dict], *, position_offset: int = 0):
    for i, td in enumerate(task_defs):
        task_title = td["title"]
        existing = (
            db.query(Task)
            .filter(Task.title == task_title, Task.project_id == project.id, Task.assigned_to == user.id)
            .first()
        )
        if existing:
            # ensure status if changed
            existing.status = status
            if existing.position is None:
                existing.position = 0
            db.add(existing)
            continue

        due_dt = _now() + timedelta(days=td.get("due_in_days", 10))
        task = Task(
            title=task_title,
            description=td.get("description"),
            priority=td.get("priority", "medium"),
            status=status,
            due_date=due_dt,
            project_id=project.id,
            assigned_to=user.id,
            position=position_offset + i,
            labels=td.get("labels", ""),
            estimate_points=td.get("estimate_points", 2),
        )
        db.add(task)
        db.flush()

        create_activity(
            db=db,
            action_type="demo_seed.task_created",
            message=f"Demo seeded task: {task.title}.",
            user_id=user.id,
            project_id=project.id,
            task_id=task.id,
            entity_type="task",
            entity_id=task.id,
        )
        # one notification per important state
        if status == "blocked":
            _seed_notification(
                db,
                user.id,
                title="Blocked work",
                message=f"{task.title} is blocked. Review dependencies and unblock next.",
                type_="task_blocked",
                severity="warning",
                priority="normal",
                entity_type="task",
                entity_id=task.id,
            )

    db.commit()


def _seed_milestones(db: Session, user: User, project: Project):
    milestones_payload = [
        {
            "title": "Plan & Scope",
            "description": "Align goals, owners, and delivery checkpoints.",
            "due_in_days": 6,
            "status": "completed",
        },
        {
            "title": "Build",
            "description": "Execution across primary workflow lanes.",
            "due_in_days": 14,
            "status": "active",
        },
        {
            "title": "Review & Launch",
            "description": "QA validation, approval gates, and release readiness.",
            "due_in_days": 22,
            "status": "planned",
        },
    ]

    for m in milestones_payload:
        existing = db.query(Milestone).filter(Milestone.title == m["title"], Milestone.project_id == project.id).first()
        if existing:
            continue

        ms = Milestone(
            title=m["title"],
            description=m["description"],
            due_date=_date_now() + timedelta(days=m["due_in_days"]),
            status=m["status"],
            project_id=project.id,
            created_by=user.id,
        )
        db.add(ms)
        db.commit()
        db.refresh(ms)

        create_activity(
            db=db,
            action_type="demo_seed.milestone_created",
            message=f"Demo seeded milestone: {ms.title}.",
            user_id=user.id,
            project_id=project.id,
            task_id=None,
        )
        db.commit()


def _seed_sprints(db: Session, user: User, project: Project, tasks_by_status: dict[str, list[Task]]):
    # Only seed if Sprint models are present.
    sprint_name = "Sprint 1 — Execution"
    existing = db.query(Sprint).filter(Sprint.name == sprint_name, Sprint.project_id == project.id).first()
    if existing:
        return

    start = _date_now() - timedelta(days=5)
    end = _date_now() + timedelta(days=5)

    sprint = Sprint(
        name=sprint_name,
        goal=f"Ship priority outcomes for {project.name}.",
        start_date=start,
        end_date=end,
        velocity=28,
        committed_points=40,
        completed_points=22,
        status="active",
        project_id=project.id,
        created_by=user.id,
    )
    db.add(sprint)
    db.commit()
    db.refresh(sprint)

    # Attach a few tasks to sprint.
    attach_candidates: list[Task] = []
    for st in ["todo", "in_progress", "review"]:
        attach_candidates.extend(tasks_by_status.get(st, [])[:3])

    for idx, t in enumerate(attach_candidates[:6]):
        existing_link = (
            db.query(SprintTask)
            .filter(SprintTask.sprint_id == sprint.id, SprintTask.task_id == t.id)
            .first()
        )
        if existing_link:
            continue
        db.add(SprintTask(sprint_id=sprint.id, task_id=t.id, position=idx))

    db.commit()

    create_activity(
        db=db,
        action_type="demo_seed.sprint_created",
        message=f"Demo seeded sprint: {sprint.name}.",
        user_id=user.id,
        project_id=project.id,
    )
    db.commit()


def _seed_analytics_snapshot(db: Session, user: User, project: Project):
    existing = (
        db.query(AnalyticsSnapshot)
        .filter(AnalyticsSnapshot.user_id == user.id, AnalyticsSnapshot.project_id == project.id)
        .first()
    )
    if existing:
        return

    # Minimal realistic metrics so dashboards don’t feel empty.
    metrics = {
        "task_distribution": {"todo": 2, "in_progress": 4, "review": 2, "blocked": 1, "completed": 3},
    }
    summary = (
        f"Execution confidence is trending up for {project.name}. "
        "Next: unblock key dependency and move review tasks into completion."
    )

    snap = AnalyticsSnapshot(
        scope="project",
        project_id=project.id,
        user_id=user.id,
        health_score=82,
        delivery_confidence=77,
        productivity_score=74,
        metrics_json=str(metrics),
        summary_json=summary,
    )
    db.add(snap)
    db.commit()

    create_activity(
        db=db,
        action_type="demo_seed.analytics_snapshot",
        message=f"Demo seeded analytics snapshot for {project.name}.",
        user_id=user.id,
        project_id=project.id,
    )
    db.commit()


def seed_demo_for_user(db: Session, user: User) -> DemoSeedResult:
    _ensure_user_seed_columns(db)

    if _user_demo_seeded(user):
        return DemoSeedResult(user_id=user.id, seeded=False, details={"reason": "already_seeded"})

    # Seed marker: avoid partial duplicates.
    # Use a transaction-like sequence; if something fails, caller can retry.
    try:
        user_demo_seed_marker_before = _now()
        setattr(user, "demo_seeded_at", user_demo_seed_marker_before)
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create demo projects and related data.
        tasks_by_project_and_status: dict[int, dict[str, list[Task]]] = {}

        for p in DEMO_PROJECTS:
            project = _get_or_create_project(db, user, p)
            _seed_milestones(db, user, project)

            # Task templates per project.
            task_templates = {
                "todo": [
                    {
                        "title": "Draft execution checklist",
                        "description": "Define owners, dependencies, and measurable success criteria.",
                        "priority": "medium",
                        "due_in_days": 6,
                        "labels": "planning,quality",
                        "estimate_points": 2,
                    },
                    {
                        "title": "Set up sprint goals",
                        "description": "Convert objectives into sprint scope with acceptance signals.",
                        "priority": "medium",
                        "due_in_days": 7,
                        "labels": "sprint,alignment",
                        "estimate_points": 3,
                    },
                ],
                "in_progress": [
                    {
                        "title": "Implement core feature lane",
                        "description": "Build and wire the primary workflow path end-to-end.",
                        "priority": "high",
                        "due_in_days": 5,
                        "labels": "build",
                        "estimate_points": 5,
                    },
                    {
                        "title": "Instrument analytics events",
                        "description": "Ensure delivery signals, metrics, and health scoring are captured.",
                        "priority": "medium",
                        "due_in_days": 4,
                        "labels": "analytics",
                        "estimate_points": 3,
                    },
                ],
                "review": [
                    {
                        "title": "QA review & regression pass",
                        "description": "Validate key flows and prevent last-minute surprises.",
                        "priority": "medium",
                        "due_in_days": 3,
                        "labels": "qa,review",
                        "estimate_points": 3,
                    },
                    {
                        "title": "Stakeholder sign-off prep",
                        "description": "Package a short proof brief: risks, progress, and next actions.",
                        "priority": "medium",
                        "due_in_days": 2,
                        "labels": "leadership,communication",
                        "estimate_points": 2,
                    },
                ],
                "blocked": [
                    {
                        "title": "Unblock dependency",
                        "description": "Resolve the current blocker and restore workflow throughput.",
                        "priority": "high",
                        "due_in_days": 2,
                        "labels": "dependency,blocker",
                        "estimate_points": 2,
                    }
                ],
                "completed": [
                    {
                        "title": "Approve kickoff checklist",
                        "description": "Confirm plan and baseline metrics for the sprint.",
                        "priority": "medium",
                        "due_in_days": -2,
                        "labels": "approval,starter",
                        "estimate_points": 2,
                    },
                    {
                        "title": "Publish interim metrics",
                        "description": "Show early velocity and delivery confidence trend.",
                        "priority": "low",
                        "due_in_days": -1,
                        "labels": "reporting",
                        "estimate_points": 1,
                    },
                ],
            }

            # Seed milestones (premium onboarding moment)
            _seed_milestones(db, user, project)

            # Seed tasks by status.
            status_task_counts = {}
            for status in BOARD_STATUSES:
                td = task_templates[status]
                position_offset = (status_task_counts.get(status, 0) * 10) + 0
                _seed_tasks_for_project(db, user, project, status, td, position_offset=position_offset)
                status_task_counts[status] = len(td)

            # Collect tasks for sprint linkage.
            all_tasks = db.query(Task).filter(Task.project_id == project.id, Task.assigned_to == user.id).all()
            by_status: dict[str, list[Task]] = {st: [] for st in BOARD_STATUSES}
            for t in all_tasks:
                if t.status in by_status:
                    by_status[t.status].append(t)

            tasks_by_project_and_status[project.id] = by_status

            _seed_sprints(db, user, project, by_status)
            _seed_analytics_snapshot(db, user, project)

            # Seed 2 general notifications per project.
            _seed_notification(
                db,
                user.id,
                title="Weekly delivery update",
                message=f"Your team delivered visible progress in {project.name}. Next: focus on review + unblock work.",
                type_="weekly_update",
                severity="low",
                priority="normal",
                entity_type="project",
                entity_id=project.id,
            )
            _seed_notification(
                db,
                user.id,
                title="AI suggestion ready",
                message=f"WorkflowOS generated next steps for {project.name}. Open AI Copilot to review risks and plan sprint work.",
                type_="ai_suggestion",
                severity="low",
                priority="normal",
                entity_type="project",
                entity_id=project.id,
            )

        # Finalize.
        _set_user_demo_seeded(db, user)

        return DemoSeedResult(user_id=user.id, seeded=True, details={"projects": len(DEMO_PROJECTS)})

    except Exception as exc:
        logger.exception("Demo seed failed user_id=%s", user.id)
        # Do not clear marker automatically; better to allow a manual retry later.
        # But we can set marker back to null so retries work.
        try:
            setattr(user, "demo_seeded_at", None)
            db.add(user)
            db.commit()
        except Exception:
            pass

        raise exc

