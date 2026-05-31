from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.notification import Notification
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.user import User
from app.services.activity_service import create_activity
from app.services.email_service import send_deadline_email
from app.services.notification_service import create_notification


MANAGEMENT_ROLES = ["Admin", "Manager"]


def clamp(value: int | float, minimum: int = 0, maximum: int = 100):
    return max(minimum, min(maximum, round(value)))


def project_deadline_at(project: Project):
    if not project.end_date:
        return None

    return datetime.combine(project.end_date, time.max)


def remaining_time_label(deadline: datetime, now: datetime):
    seconds = max(0, int((deadline - now).total_seconds()))
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60

    if hours <= 0:
        return f"{minutes} minute(s)"

    return f"{hours} hour(s) {minutes} minute(s)"


def scoped_records(
    db: Session,
    current_user: User | None,
    role: str | None,
):
    if role in MANAGEMENT_ROLES:
        return (
            db.query(Project).all(),
            db.query(Task).all(),
            db.query(User).all(),
            db.query(Activity).all(),
        )

    if not current_user:
        return [], [], [], []

    member_project_ids = [
        project_id for (project_id,) in (
            db.query(ProjectMember.project_id)
            .filter(ProjectMember.user_id == current_user.id)
            .all()
        )
    ]

    assigned_tasks = (
        db.query(Task)
        .filter(Task.assigned_to == current_user.id)
        .all()
    )

    assigned_project_ids = [
        task.project_id
        for task in assigned_tasks
        if task.project_id
    ]

    owned_project_ids = [
        project_id for (project_id,) in (
            db.query(Project.id)
            .filter(Project.owner_id == current_user.id)
            .all()
        )
    ]

    project_ids = list(set(
        member_project_ids +
        assigned_project_ids +
        owned_project_ids
    ))

    projects = (
        db.query(Project)
        .filter(Project.id.in_(project_ids))
        .all()
        if project_ids
        else []
    )

    project_tasks = (
        db.query(Task)
        .filter(Task.project_id.in_(project_ids))
        .all()
        if project_ids
        else []
    )

    tasks_by_id = {
        task.id: task
        for task in project_tasks + assigned_tasks
    }

    activities = (
        db.query(Activity)
        .filter(
            or_(
                Activity.user_id == current_user.id,
                Activity.project_id.in_(project_ids)
                if project_ids else Activity.id == -1,
                Activity.task_id.in_(list(tasks_by_id.keys()))
                if tasks_by_id else Activity.id == -1,
            )
        )
        .all()
    )

    return (
        projects,
        list(tasks_by_id.values()),
        [current_user],
        activities,
    )


def notification_exists(
    db: Session,
    user_id: int,
    message: str,
):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .filter(Notification.message == message)
        .first()
        is not None
    )


def recent_activity_exists(
    db: Session,
    message: str,
):
    return (
        db.query(Activity)
        .filter(Activity.description == message)
        .filter(Activity.created_at >= datetime.utcnow() - timedelta(hours=6))
        .first()
        is not None
    )


def recipient_ids_for_project(
    db: Session,
    project: Project,
):
    recipients = set()

    if project.owner_id:
        recipients.add(project.owner_id)

    recipients.update([
        user_id for (user_id,) in (
            db.query(ProjectMember.user_id)
            .filter(ProjectMember.project_id == project.id)
            .all()
        )
    ])

    recipients.update([
        user_id for (user_id,) in (
            db.query(User.id)
            .filter(User.role.in_(MANAGEMENT_ROLES))
            .all()
        )
    ])

    return [
        recipient for recipient in recipients
        if recipient
    ]


def run_deadline_monitoring(db: Session):
    now = datetime.utcnow()
    twelve_hours = now + timedelta(hours=12)
    today = date.today()
    alerts = []

    projects = db.query(Project).all()
    tasks = db.query(Task).all()

    for project in projects:
        deadline = project_deadline_at(project)
        if project.status == "completed":
            continue

        if deadline and now <= deadline <= twelve_hours:
            remaining_time = remaining_time_label(
                deadline,
                now,
            )
            message = (
                f"Project {project.name} deadline is approaching in less than 12 hours. "
                "Critical delivery risk detected."
            )
            alerts.append({
                "type": "deadline_12h",
                "severity": "critical",
                "message": message,
                "project_id": project.id,
                "email_sent": bool(project.email_sent),
                "remaining_time": remaining_time,
            })

            for user_id in recipient_ids_for_project(db, project):
                if not notification_exists(db, user_id, message):
                    create_notification(
                        db=db,
                        user_id=user_id,
                        title="Critical delivery risk detected",
                        message=message,
                        type="critical",
                        severity="critical",
                    )

            if not project.email_sent and project.owner and project.owner.email:
                try:
                    send_deadline_email(
                        receiver_email=project.owner.email,
                        project_name=project.name,
                        remaining_time=remaining_time,
                        deadline=deadline.strftime("%Y-%m-%d %H:%M UTC"),
                        project_status=project.status,
                    )
                    project.email_sent = True
                    project.alert_level = "critical"
                    project.last_alert_at = now
                except Exception as exc:
                    project.alert_level = "email_failed"
                    project.last_alert_at = now
                    create_activity(
                        db=db,
                        action_type="deadline_email_failed",
                        message=f"Deadline email failed for project {project.name}: {str(exc)}",
                        project_id=project.id,
                    )

            if not recent_activity_exists(db, message):
                create_activity(
                    db=db,
                    action_type="ai_deadline_alert",
                    message=message,
                    project_id=project.id,
                )

        if project.end_date and project.end_date < today:
            message = f"Project {project.name} is overdue and needs intervention."
            alerts.append({
                "type": "overdue_project",
                "severity": "critical",
                "message": message,
                "project_id": project.id,
            })

            for user_id in recipient_ids_for_project(db, project):
                if not notification_exists(db, user_id, message):
                    create_notification(
                        db=db,
                        user_id=user_id,
                        title="Overdue project",
                        message=message,
                        type="warning",
                        severity="critical",
                    )

    for task in tasks:
        if (
            task.due_date and
            task.due_date < now and
            task.status != "completed"
        ):
            message = f"Task {task.title} is overdue and blocking workflow progress."
            alerts.append({
                "type": "overdue_task",
                "severity": "high",
                "message": message,
                "project_id": task.project_id,
                "task_id": task.id,
            })

            if task.assigned_to and not notification_exists(
                db,
                task.assigned_to,
                message,
            ):
                create_notification(
                    db=db,
                    user_id=task.assigned_to,
                    title="Overdue task",
                    message=message,
                    type="warning",
                    severity="high",
                )

    db.commit()

    return alerts


def last_activity_by_project(activities: list[Activity]):
    latest = {}

    for activity in activities:
        if not activity.project_id:
            continue

        current = latest.get(activity.project_id)
        if not current or activity.created_at > current:
            latest[activity.project_id] = activity.created_at

    return latest


def build_insight(
    title: str,
    message: str,
    severity: str,
    category: str,
    recommendation: str,
    project_id: int | None = None,
    user_id: int | None = None,
):
    return {
        "title": title,
        "message": message,
        "severity": severity,
        "category": category,
        "recommendation": recommendation,
        "project_id": project_id,
        "user_id": user_id,
    }


def analyze_operational_intelligence(
    db: Session,
    current_user: User | None = None,
    role: str | None = None,
):
    deadline_alerts = run_deadline_monitoring(db)
    projects, tasks, users, activities = scoped_records(
        db,
        current_user,
        role,
    )

    now = datetime.utcnow()
    today = date.today()
    total_tasks = len(tasks)
    completed_tasks = [
        task for task in tasks
        if task.status == "completed"
    ]
    open_tasks = [
        task for task in tasks
        if task.status != "completed"
    ]
    overdue_tasks = [
        task for task in open_tasks
        if task.due_date and task.due_date < now
    ]
    in_progress_tasks = [
        task for task in tasks
        if task.status == "in_progress"
    ]
    review_tasks = [
        task for task in tasks
        if task.status == "review"
    ]
    completed_recently = [
        activity for activity in activities
        if activity.action_type == "task_completed"
        and activity.created_at >= now - timedelta(days=7)
    ]

    overdue_projects = [
        project for project in projects
        if project.end_date
        and project.end_date < today
        and project.status != "completed"
    ]
    completed_projects = [
        project for project in projects
        if project.status == "completed"
        or (project.progress or 0) >= 100
    ]
    deadline_projects = [
        project for project in projects
        if project_deadline_at(project)
        and now <= project_deadline_at(project) <= now + timedelta(hours=12)
        and project.status != "completed"
    ]

    latest_project_activity = last_activity_by_project(activities)
    inactive_projects = [
        project for project in projects
        if project.status != "completed"
        and latest_project_activity.get(project.id, project.created_at or now)
        < now - timedelta(days=7)
    ]
    stagnant_projects = [
        project for project in inactive_projects
        if (project.progress or 0) < 80
    ]

    workload = defaultdict(lambda: {
        "assigned": 0,
        "completed": 0,
        "overdue": 0,
        "in_progress": 0,
        "review": 0,
    })

    for task in tasks:
        if not task.assigned_to:
            continue

        workload[task.assigned_to]["assigned"] += 1

        if task.status == "completed":
            workload[task.assigned_to]["completed"] += 1
        if task.status == "in_progress":
            workload[task.assigned_to]["in_progress"] += 1
        if task.status == "review":
            workload[task.assigned_to]["review"] += 1
        if (
            task.due_date and
            task.due_date < now and
            task.status != "completed"
        ):
            workload[task.assigned_to]["overdue"] += 1

    user_lookup = {
        user.id: user for user in users
    }

    workload_analysis = []

    for user_id, stats in workload.items():
        user = user_lookup.get(user_id)
        completion_rate = (
            (stats["completed"] / stats["assigned"]) * 100
            if stats["assigned"]
            else 0
        )
        overload_score = clamp(
            stats["assigned"] * 10 +
            stats["overdue"] * 18 +
            stats["in_progress"] * 8
        )

        workload_analysis.append({
            "user_id": user_id,
            "user": user.full_name if user else "Unknown user",
            "role": user.role if user else "Unknown",
            "assigned_tasks": stats["assigned"],
            "completed_tasks": stats["completed"],
            "overdue_tasks": stats["overdue"],
            "in_progress_tasks": stats["in_progress"],
            "review_tasks": stats["review"],
            "completion_rate": clamp(completion_rate),
            "overload_score": overload_score,
        })

    overloaded_users = [
        item for item in workload_analysis
        if item["overload_score"] >= 70
        or item["assigned_tasks"] >= 6
        or item["overdue_tasks"] >= 2
    ]
    top_performers = sorted(
        [
            item for item in workload_analysis
            if item["assigned_tasks"] > 0
        ],
        key=lambda item: (
            item["completion_rate"],
            item["completed_tasks"],
        ),
        reverse=True,
    )[:5]
    inactive_members = [
        user.full_name for user in users
        if user.id not in workload and user.role not in ["Viewer"]
    ]

    completion_rate = (
        (len(completed_tasks) / total_tasks) * 100
        if total_tasks
        else 0
    )
    overdue_ratio = (
        (len(overdue_tasks) / max(len(open_tasks), 1)) * 100
        if open_tasks
        else 0
    )
    review_ratio = (
        (len(review_tasks) / max(total_tasks, 1)) * 100
        if total_tasks
        else 0
    )
    in_progress_ratio = (
        (len(in_progress_tasks) / max(total_tasks, 1)) * 100
        if total_tasks
        else 0
    )
    project_risk_ratio = (
        ((len(overdue_projects) + len(deadline_projects)) /
         max(len(projects), 1)) * 100
        if projects
        else 0
    )
    project_completion_rate = (
        (len(completed_projects) / len(projects)) * 100
        if projects
        else 0
    )

    risk_score = clamp(
        overdue_ratio * 0.35 +
        review_ratio * 0.18 +
        in_progress_ratio * 0.12 +
        project_risk_ratio * 0.35
    )
    delay_probability = clamp(
        risk_score +
        len(stagnant_projects) * 7 +
        len(overloaded_users) * 6
    )
    urgency_level = (
        "critical" if risk_score >= 75 or deadline_projects else
        "high" if risk_score >= 55 or overdue_projects else
        "medium" if risk_score >= 30 else
        "low"
    )

    productivity_score = clamp(
        completion_rate * 0.72 +
        project_completion_rate * 0.28 -
        overdue_ratio * 0.45 -
        review_ratio * 0.15
    )
    workflow_health_score = clamp(
        100 -
        risk_score -
        len(stagnant_projects) * 5 +
        project_completion_rate * 0.12
    )
    team_efficiency_score = clamp(
        productivity_score -
        len(overloaded_users) * 4 -
        len(inactive_members) * 2
    )
    project_velocity_score = clamp(
        len(completed_recently) * 12 +
        completion_rate * 0.5 -
        len(inactive_projects) * 6 +
        project_completion_rate * 0.25
    )
    execution_quality_score = clamp(
        100 -
        overdue_ratio * 0.55 -
        review_ratio * 0.25 -
        len(overdue_projects) * 6
    )

    insights = []

    if deadline_projects:
        insights.append(build_insight(
            "Critical deadline window",
            f"{len(deadline_projects)} project(s) end within 12 hours.",
            "critical",
            "deadline",
            "Confirm owners, freeze scope, and move blockers into immediate review.",
        ))

    if overdue_projects:
        insights.append(build_insight(
            "Projects are overdue",
            f"{len(overdue_projects)} project(s) are past their planned end date.",
            "critical",
            "risk",
            "Run a recovery review and reset owner commitments today.",
        ))

    if overdue_tasks:
        insights.append(build_insight(
            "Overdue task pressure",
            f"{len(overdue_tasks)} open task(s) are overdue.",
            "high",
            "deadline",
            "Reassign or split overdue tasks before adding new in-progress work.",
        ))

    if len(review_tasks) >= 3 or review_ratio >= 25:
        insights.append(build_insight(
            "Review-stage congestion",
            f"{len(review_tasks)} task(s) are waiting in review.",
            "medium",
            "bottleneck",
            "Add review capacity or define review SLAs for this workflow.",
        ))

    if len(in_progress_tasks) > len(completed_tasks) and len(in_progress_tasks) >= 3:
        insights.append(build_insight(
            "Too much work in progress",
            f"{len(in_progress_tasks)} task(s) are in progress, exceeding completed throughput.",
            "medium",
            "execution",
            "Limit WIP and finish active tasks before opening new work.",
        ))

    if stagnant_projects:
        insights.append(build_insight(
            "Stagnant workflows detected",
            f"{len(stagnant_projects)} project(s) have low recent activity.",
            "high",
            "activity",
            "Trigger owner check-ins and refresh next actions.",
        ))

    if overloaded_users:
        insights.append(build_insight(
            "Workload imbalance",
            f"{len(overloaded_users)} teammate(s) appear overloaded.",
            "high",
            "workload",
            "Redistribute overdue and in-progress tasks to reduce delivery risk.",
        ))

    if inactive_members:
        insights.append(build_insight(
            "Inactive team capacity",
            f"{len(inactive_members)} active teammate(s) have no assigned visible tasks.",
            "low",
            "team",
            "Consider routing lightweight tasks or review work to unused capacity.",
        ))

    if not insights:
        insights.append(build_insight(
            "Workflow operating normally",
            "No major operational risks are visible in current project and task data.",
            "low",
            "health",
            "Maintain current planning cadence and keep deadline metadata updated.",
        ))

    projects_at_risk = []

    for project in projects:
        project_tasks = [
            task for task in tasks
            if task.project_id == project.id
        ]
        project_overdue_tasks = [
            task for task in project_tasks
            if task.due_date and task.due_date < now and task.status != "completed"
        ]
        deadline = project_deadline_at(project)
        hours_to_deadline = (
            (deadline - now).total_seconds() / 3600
            if deadline
            else None
        )
        project_risk = clamp(
            len(project_overdue_tasks) * 18 +
            (25 if project.end_date and project.end_date < today else 0) +
            (35 if hours_to_deadline is not None and 0 <= hours_to_deadline <= 12 else 0) +
            (20 if latest_project_activity.get(project.id, project.created_at or now) < now - timedelta(days=7) else 0) -
            (project.progress or 0) * 0.25
        )

        if project_risk >= 35:
            projects_at_risk.append({
                "id": project.id,
                "name": project.name,
                "status": project.status,
                "progress": project.progress or 0,
                "risk_score": project_risk,
                "overdue_tasks": len(project_overdue_tasks),
                "end_date": project.end_date,
                "email_sent": bool(project.email_sent),
                "last_alert_at": project.last_alert_at,
                "alert_level": project.alert_level or "none",
                "hours_to_deadline": (
                    round(hours_to_deadline, 1)
                    if hours_to_deadline is not None
                    else None
                ),
            })

    projects_at_risk.sort(
        key=lambda project: project["risk_score"],
        reverse=True,
    )

    bottlenecks = [
        {
            "stage": "Review",
            "count": len(review_tasks),
            "severity": "high" if len(review_tasks) >= 5 else "medium",
        },
        {
            "stage": "In progress",
            "count": len(in_progress_tasks),
            "severity": "high" if len(in_progress_tasks) >= 6 else "medium",
        },
        {
            "stage": "Overdue",
            "count": len(overdue_tasks),
            "severity": "critical" if len(overdue_tasks) >= 5 else "high",
        },
    ]

    completion_trends = [
        {
            "name": "Completed",
            "value": len(completed_tasks),
        },
        {
            "name": "In progress",
            "value": len(in_progress_tasks),
        },
        {
            "name": "Review",
            "value": len(review_tasks),
        },
        {
            "name": "Overdue",
            "value": len(overdue_tasks),
        },
    ]

    recommendations = [
        insight["recommendation"]
        for insight in insights
    ]
    predictions = [
        insight["message"]
        for insight in insights
    ]

    return {
        "productivity_score": productivity_score,
        "task_completion_rate": clamp(completion_rate),
        "urgency_level": urgency_level,
        "risk_score": risk_score,
        "delay_probability": delay_probability,
        "workflow_health_score": workflow_health_score,
        "team_efficiency_score": team_efficiency_score,
        "project_velocity_score": project_velocity_score,
        "execution_quality_score": execution_quality_score,
        "total_projects": len(projects),
        "total_tasks": total_tasks,
        "completed_tasks": len(completed_tasks),
        "in_progress_tasks": len(in_progress_tasks),
        "review_tasks": len(review_tasks),
        "overdue_tasks": len(overdue_tasks),
        "overdue_projects": len(overdue_projects),
        "completed_projects": len(completed_projects),
        "deadline_alerts": deadline_alerts,
        "projects_at_risk": projects_at_risk[:8],
        "delayed_projects": [
            {
                "id": project.id,
                "name": project.name,
                "end_date": project.end_date,
                "progress": project.progress or 0,
            }
            for project in overdue_projects[:8]
        ],
        "inactive_workflows": [
            {
                "id": project.id,
                "name": project.name,
                "progress": project.progress or 0,
                "last_activity_at": latest_project_activity.get(project.id),
            }
            for project in inactive_projects[:8]
        ],
        "overloaded_users": overloaded_users[:8],
        "top_performers": top_performers,
        "inactive_team_members": inactive_members[:8],
        "workflow_bottlenecks": bottlenecks,
        "completion_trends": completion_trends,
        "workload_analysis": workload_analysis,
        "insights": insights,
        "predictions": predictions,
        "recommendations": recommendations,
    }
