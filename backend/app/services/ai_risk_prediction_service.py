from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.analytics.metrics_aggregator import collect_operational_data
from app.models.activity import Activity
from app.models.ai_agent import AIApprovalHistory, AIRecommendation
from app.models.project import Project
from app.models.sprint import Sprint, SprintTask
from app.models.task import Task
from app.models.user import User


MANAGEMENT_ROLES = {"Admin", "Manager"}


def clamp(value: int | float, minimum: int = 0, maximum: int = 100):
    return max(minimum, min(maximum, round(value)))


def risk_level(score: int):
    if score >= 75:
        return "critical"
    if score >= 55:
        return "high"
    if score >= 35:
        return "medium"
    return "low"


def project_payload(project: Project | None):
    if not project:
        return None
    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
        "priority": project.priority,
        "progress": project.progress or 0,
        "end_date": project.end_date,
        "owner_id": project.owner_id,
    }


def task_payload(task: Task):
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date,
        "project_id": task.project_id,
        "project": project_payload(task.project),
        "assigned_to": task.assigned_to,
        "assignee": {
            "id": task.assignee.id,
            "full_name": task.assignee.full_name,
            "role": task.assignee.role,
        } if task.assignee else None,
        "estimate_points": task.estimate_points or 1,
    }


def completed_activity_windows(db: Session, tasks: list[Task], now: datetime):
    task_ids = [task.id for task in tasks]
    if not task_ids:
        return {
            "last_7": [],
            "previous_7": [],
            "last_14": [],
            "previous_14": [],
            "all": [],
        }

    activities = (
        db.query(Activity)
        .filter(Activity.task_id.in_(task_ids))
        .filter(
            or_(
                Activity.action == "task_completed",
                Activity.action_type == "task_completed",
            )
        )
        .all()
    )
    return {
        "last_7": [
            item for item in activities
            if item.created_at and item.created_at >= now - timedelta(days=7)
        ],
        "previous_7": [
            item for item in activities
            if item.created_at
            and now - timedelta(days=14) <= item.created_at < now - timedelta(days=7)
        ],
        "last_14": [
            item for item in activities
            if item.created_at and item.created_at >= now - timedelta(days=14)
        ],
        "previous_14": [
            item for item in activities
            if item.created_at
            and now - timedelta(days=28) <= item.created_at < now - timedelta(days=14)
        ],
        "all": activities,
    }


def completion_velocity(db: Session, tasks: list[Task], now: datetime):
    windows = completed_activity_windows(db, tasks, now)
    current = len(windows["last_7"])
    previous = len(windows["previous_7"])
    current_14 = len(windows["last_14"])
    previous_14 = len(windows["previous_14"])
    velocity_delta = current - previous
    velocity_change_pct = (
        round(((current - previous) / previous) * 100, 1)
        if previous
        else (100 if current else 0)
    )
    return {
        "completed_last_7_days": current,
        "completed_previous_7_days": previous,
        "completed_last_14_days": current_14,
        "completed_previous_14_days": previous_14,
        "velocity_delta": velocity_delta,
        "velocity_change_pct": velocity_change_pct,
        "activities": windows["all"],
    }


def missed_deadline_count(tasks: list[Task], completion_activities: list[Activity], now: datetime):
    task_by_id = {task.id: task for task in tasks}
    missed = []
    for activity in completion_activities:
        task = task_by_id.get(activity.task_id)
        if not task or not task.due_date or not activity.created_at:
            continue
        if activity.created_at > task.due_date:
            missed.append(task)

    currently_overdue = [
        task for task in tasks
        if task.due_date and task.due_date < now and task.status != "completed"
    ]
    return missed, currently_overdue


def workload_distribution(tasks: list[Task], users: list[User], now: datetime):
    user_by_id = {user.id: user for user in users}
    rows = defaultdict(lambda: {
        "active_tasks": 0,
        "active_points": 0,
        "blocked_tasks": 0,
        "overdue_tasks": 0,
        "due_soon_tasks": 0,
    })

    for task in tasks:
        if not task.assigned_to or task.status == "completed":
            continue
        row = rows[task.assigned_to]
        points = task.estimate_points or 1
        row["active_tasks"] += 1
        row["active_points"] += points
        if task.status == "blocked":
            row["blocked_tasks"] += 1
        if task.due_date and task.due_date < now:
            row["overdue_tasks"] += 1
        if task.due_date and now <= task.due_date <= now + timedelta(days=7):
            row["due_soon_tasks"] += 1

    distribution = []
    for user_id, row in rows.items():
        user = user_by_id.get(user_id)
        burnout_score = clamp(
            row["active_points"] * 2.2
            + row["overdue_tasks"] * 12
            + row["blocked_tasks"] * 9
            + row["due_soon_tasks"] * 4
        )
        distribution.append({
            "user": {
                "id": user.id,
                "full_name": user.full_name,
                "role": user.role,
            } if user else {"id": user_id, "full_name": "Unknown", "role": None},
            **row,
            "burnout_risk": burnout_score,
            "overloaded": row["active_points"] > 40 or burnout_score >= 70,
        })

    points = [row["active_points"] for row in distribution]
    average = sum(points) / max(len(points), 1)
    imbalance = clamp(
        ((max(points or [0]) - min(points or [0])) / max(average, 1)) * 35
    )

    return sorted(distribution, key=lambda item: item["burnout_risk"], reverse=True), imbalance


def approval_delay_signals(db: Session, current_user: User | None, role: str | None, now: datetime):
    query = db.query(AIRecommendation).filter(AIRecommendation.approval_required == 1)
    if role not in MANAGEMENT_ROLES and current_user:
        query = query.filter(
            or_(
                AIRecommendation.user_id == current_user.id,
                AIRecommendation.created_by == current_user.id,
            )
        )
    elif role not in MANAGEMENT_ROLES:
        query = query.filter(AIRecommendation.id == -1)

    recommendations = query.all()
    pending = [
        item for item in recommendations
        if item.status in ["open", "pending"] and item.created_at
    ]
    stale = [
        item for item in pending
        if item.created_at <= now - timedelta(days=2)
    ]

    histories = (
        db.query(AIApprovalHistory)
        .filter(AIApprovalHistory.recommendation_id.in_([item.id for item in recommendations] or [-1]))
        .all()
    )
    rec_by_id = {item.id: item for item in recommendations}
    cycle_hours = []
    for history in histories:
        recommendation = rec_by_id.get(history.recommendation_id)
        if recommendation and recommendation.created_at and history.created_at:
            cycle_hours.append((history.created_at - recommendation.created_at).total_seconds() / 3600)

    average_cycle_hours = round(sum(cycle_hours) / len(cycle_hours), 1) if cycle_hours else None
    score = clamp(len(stale) * 18 + len(pending) * 5 + (average_cycle_hours or 0) / 2)

    return {
        "score": score,
        "pending": pending,
        "stale": stale,
        "average_cycle_hours": average_cycle_hours,
    }


def bottleneck_signals(tasks: list[Task], projects: list[Project]):
    blocked = [task for task in tasks if task.status == "blocked"]
    review = [task for task in tasks if task.status == "review"]
    in_progress = [task for task in tasks if task.status == "in_progress"]
    project_blockers = []

    for project in projects:
        project_tasks = [task for task in tasks if task.project_id == project.id]
        if not project_tasks:
            continue
        blocked_count = len([task for task in project_tasks if task.status == "blocked"])
        review_count = len([task for task in project_tasks if task.status == "review"])
        if blocked_count or review_count >= 3:
            project_blockers.append({
                "project": project_payload(project),
                "blocked_tasks": blocked_count,
                "review_tasks": review_count,
            })

    score = clamp(len(blocked) * 12 + len(review) * 5 + max(len(in_progress) - 10, 0) * 2)
    return {
        "score": score,
        "blocked": blocked,
        "review": review,
        "in_progress": in_progress,
        "project_blockers": project_blockers,
    }


def sprint_delay_predictions(sprints: list[Sprint], now: datetime):
    predictions = []
    for sprint in sprints:
        tasks = [link.task for link in sprint.tasks or [] if link.task]
        if not tasks or sprint.status == "completed":
            continue

        committed = sum((task.estimate_points or 1) for task in tasks)
        completed = sum((task.estimate_points or 1) for task in tasks if task.status == "completed")
        blocked = len([task for task in tasks if task.status == "blocked"])
        overdue = len([
            task for task in tasks
            if task.due_date and task.due_date < now and task.status != "completed"
        ])
        days_total = max((sprint.end_date - sprint.start_date).days + 1, 1)
        days_elapsed = max((now.date() - sprint.start_date).days + 1, 0)
        expected_progress = clamp((min(days_elapsed / days_total, 1)) * 100)
        actual_progress = clamp(completed / max(committed, 1) * 100)
        progress_gap = max(expected_progress - actual_progress, 0)
        velocity_gap = max((sprint.velocity or committed) - completed, 0)
        score = clamp(progress_gap * 0.9 + blocked * 14 + overdue * 16 + velocity_gap * 1.5)
        reasons = []
        if progress_gap:
            reasons.append(f"{progress_gap}% behind expected sprint progress")
        if blocked:
            reasons.append(f"{blocked} blocked sprint task(s)")
        if overdue:
            reasons.append(f"{overdue} overdue sprint task(s)")
        if velocity_gap and sprint.velocity:
            reasons.append(f"{velocity_gap} point gap against sprint velocity")
        if not reasons:
            reasons.append("Sprint progress is tracking close to expected completion")

        predictions.append({
            "id": f"sprint-delay-{sprint.id}",
            "risk_type": "sprint_delay_risk",
            "title": f"{sprint.name} delay risk",
            "score": score,
            "probability": score,
            "level": risk_level(score),
            "entity_type": "sprint",
            "entity_id": sprint.id,
            "project": project_payload(sprint.project),
            "metrics": {
                "committed_points": committed,
                "completed_points": completed,
                "blocked_tasks": blocked,
                "overdue_tasks": overdue,
                "expected_progress": expected_progress,
                "actual_progress": actual_progress,
            },
            "reasons": reasons,
            "recommendation": (
                "Reduce scope, unblock sprint tasks, or rebalance work before the sprint end date."
                if score >= 55
                else "Keep monitoring sprint throughput and blocked work."
            ),
            "actions": [
                {"label": "Open Planning", "path": "/planning"},
                {"label": "Review Tasks", "path": "/tasks"},
            ],
        })

    return sorted(predictions, key=lambda item: item["score"], reverse=True)


def project_failure_predictions(
    projects: list[Project],
    tasks: list[Task],
    velocity: dict,
    workload_imbalance: int,
    approval: dict,
    now: datetime,
):
    predictions = []
    for project in projects:
        project_tasks = [task for task in tasks if task.project_id == project.id]
        if not project_tasks or project.status == "completed":
            continue

        total = len(project_tasks)
        completed = len([task for task in project_tasks if task.status == "completed"])
        blocked = len([task for task in project_tasks if task.status == "blocked"])
        overdue = len([
            task for task in project_tasks
            if task.due_date and task.due_date < now and task.status != "completed"
        ])
        due_soon = len([
            task for task in project_tasks
            if task.due_date and now <= task.due_date <= now + timedelta(days=7) and task.status != "completed"
        ])
        progress = clamp(completed / max(total, 1) * 100)
        stored_progress = project.progress if project.progress is not None else progress
        deadline_pressure = 0
        if project.end_date:
            days_left = (project.end_date - now.date()).days
            if days_left < 0 and progress < 100:
                deadline_pressure = 35
            elif days_left <= 7 and progress < 80:
                deadline_pressure = 22
            elif days_left <= 14 and progress < 60:
                deadline_pressure = 12
        else:
            days_left = None

        velocity_penalty = 0
        if velocity["completed_previous_7_days"] and velocity["velocity_delta"] < 0:
            velocity_penalty = min(abs(velocity["velocity_delta"]) * 4, 20)

        score = clamp(
            overdue * 14
            + blocked * 12
            + due_soon * 4
            + max(0, 75 - progress) * 0.35
            + deadline_pressure
            + workload_imbalance * 0.25
            + approval["score"] * 0.15
            + velocity_penalty
        )
        reasons = []
        if overdue:
            reasons.append(f"{overdue} overdue task(s)")
        if blocked:
            reasons.append(f"{blocked} blocked task(s)")
        if due_soon:
            reasons.append(f"{due_soon} task(s) due in the next 7 days")
        if deadline_pressure:
            reasons.append(f"Deadline pressure is active with {days_left} day(s) remaining")
        if progress < stored_progress:
            reasons.append("Calculated task completion is below stored project progress")
        if workload_imbalance >= 45:
            reasons.append("Workload distribution is imbalanced across assignees")
        if approval["stale"]:
            reasons.append(f"{len(approval['stale'])} stale approval(s) may block execution")
        if velocity_penalty:
            reasons.append("Completion velocity declined compared with the previous week")
        if not reasons:
            reasons.append("No major delivery risk signals detected for this project")

        predictions.append({
            "id": f"project-risk-{project.id}",
            "risk_type": "overdue_risk",
            "title": f"{project.name} failure risk",
            "score": score,
            "probability": score,
            "level": risk_level(score),
            "entity_type": "project",
            "entity_id": project.id,
            "project": project_payload(project),
            "metrics": {
                "total_tasks": total,
                "completed_tasks": completed,
                "progress": progress,
                "stored_progress": stored_progress,
                "overdue_tasks": overdue,
                "blocked_tasks": blocked,
                "due_next_7_days": due_soon,
                "days_left": days_left,
            },
            "reasons": reasons,
            "recommendation": (
                "Reassign blocked or overdue work, review deadline scope, and clear approvals."
                if score >= 55
                else "Maintain current execution cadence and keep monitoring blockers."
            ),
            "actions": [
                {"label": "Open Project", "path": "/projects"},
                {"label": "Review Tasks", "path": f"/tasks?project={project.id}"},
            ],
        })

    return sorted(predictions, key=lambda item: item["score"], reverse=True)


def aggregate_cards(project_predictions, sprint_predictions, workload, bottlenecks, approval, velocity, missed, overdue):
    cards = []

    if sprint_predictions:
        top = sprint_predictions[0]
        cards.append({
            **top,
            "title": "Sprint delay risk",
            "description": top["title"],
        })

    overdue_score = clamp(len(overdue) * 12 + len(missed) * 8)
    cards.append({
        "id": "overdue-risk",
        "risk_type": "overdue_risk",
        "title": "Deadline risk increasing" if overdue_score >= 55 else "Deadline risk",
        "description": f"{len(overdue)} active overdue task(s), {len(missed)} completed after due date.",
        "score": overdue_score,
        "probability": overdue_score,
        "level": risk_level(overdue_score),
        "entity_type": "workspace",
        "entity_id": None,
        "metrics": {
            "active_overdue_tasks": len(overdue),
            "missed_deadlines": len(missed),
        },
        "reasons": [
            f"{len(overdue)} active task(s) are overdue",
            f"{len(missed)} task(s) were completed after their due date",
        ],
        "recommendation": "Prioritize overdue tasks and renegotiate deadlines where scope has changed.",
        "actions": [{"label": "Open Tasks", "path": "/tasks"}],
    })

    top_workload = workload[0] if workload else None
    workload_score = top_workload["burnout_risk"] if top_workload else 0
    cards.append({
        "id": "workload-imbalance",
        "risk_type": "workload_imbalance",
        "title": "High burnout risk" if workload_score >= 70 else "Workload imbalance",
        "description": (
            f"{top_workload['user']['full_name']} has {top_workload['active_points']} active point(s)."
            if top_workload else "No assigned workload data available."
        ),
        "score": workload_score,
        "probability": workload_score,
        "level": risk_level(workload_score),
        "entity_type": "user",
        "entity_id": top_workload["user"]["id"] if top_workload else None,
        "metrics": top_workload or {},
        "reasons": [
            f"{top_workload['active_tasks']} active assigned task(s)" if top_workload else "No active assignments found",
            f"{top_workload['overdue_tasks']} overdue task(s)" if top_workload else "No overdue assignment data",
            f"{top_workload['blocked_tasks']} blocked task(s)" if top_workload else "No blocked assignment data",
        ],
        "recommendation": "Reassign high-point or overdue work from overloaded teammates.",
        "actions": [{"label": "Open Analytics", "path": "/team-analytics"}],
    })

    cards.append({
        "id": "bottleneck-detection",
        "risk_type": "bottleneck_detection",
        "title": "Approval bottleneck detected" if approval["score"] >= bottlenecks["score"] and approval["score"] >= 45 else "Execution bottleneck detection",
        "description": f"{len(bottlenecks['blocked'])} blocked task(s), {len(bottlenecks['review'])} in review, {len(approval['stale'])} stale approval(s).",
        "score": max(bottlenecks["score"], approval["score"]),
        "probability": max(bottlenecks["score"], approval["score"]),
        "level": risk_level(max(bottlenecks["score"], approval["score"])),
        "entity_type": "workspace",
        "entity_id": None,
        "metrics": {
            "blocked_tasks": len(bottlenecks["blocked"]),
            "review_tasks": len(bottlenecks["review"]),
            "pending_approvals": len(approval["pending"]),
            "stale_approvals": len(approval["stale"]),
            "average_approval_cycle_hours": approval["average_cycle_hours"],
        },
        "reasons": [
            f"{len(bottlenecks['blocked'])} task(s) are blocked",
            f"{len(bottlenecks['review'])} task(s) are waiting in review",
            f"{len(approval['stale'])} approval(s) have waited more than 2 days",
        ],
        "recommendation": "Clear blocked work and review pending approvals before starting new scope.",
        "actions": [
            {"label": "Open Approvals", "path": "/ai-approvals"},
            {"label": "Open Tasks", "path": "/tasks"},
        ],
    })

    decline_score = 0
    if velocity["completed_previous_14_days"] and velocity["completed_last_14_days"] < velocity["completed_previous_14_days"]:
        decline_score = clamp(
            ((velocity["completed_previous_14_days"] - velocity["completed_last_14_days"])
             / max(velocity["completed_previous_14_days"], 1)) * 100
        )
    cards.append({
        "id": "productivity-decline",
        "risk_type": "productivity_decline",
        "title": "Productivity decline" if decline_score >= 35 else "Productivity trend",
        "description": f"{velocity['completed_last_14_days']} completions in last 14 days vs {velocity['completed_previous_14_days']} prior.",
        "score": decline_score,
        "probability": decline_score,
        "level": risk_level(decline_score),
        "entity_type": "workspace",
        "entity_id": None,
        "metrics": {
            "completed_last_14_days": velocity["completed_last_14_days"],
            "completed_previous_14_days": velocity["completed_previous_14_days"],
            "velocity_delta": velocity["velocity_delta"],
            "velocity_change_pct": velocity["velocity_change_pct"],
        },
        "reasons": [
            f"Completion velocity changed by {velocity['velocity_delta']} task(s) week over week",
            f"Completion change is {velocity['velocity_change_pct']}%",
        ],
        "recommendation": "Inspect blockers, workload balance, and overdue work before committing more scope.",
        "actions": [{"label": "Open Analytics", "path": "/team-analytics"}],
    })

    return sorted(cards + project_predictions[:4], key=lambda item: item["score"], reverse=True)


def build_risk_predictions(db: Session, current_user: User | None, role: str | None):
    data = collect_operational_data(db, current_user, role)
    now = data["now"]
    tasks = data["tasks"]
    projects = data["projects"]
    sprints = data["sprints"]
    users = data["users"]

    velocity = completion_velocity(db, tasks, now)
    missed, overdue = missed_deadline_count(tasks, velocity["activities"], now)
    workload, workload_imbalance = workload_distribution(tasks, users, now)
    approval = approval_delay_signals(db, current_user, role, now)
    bottlenecks = bottleneck_signals(tasks, projects)
    sprint_predictions = sprint_delay_predictions(sprints, now)
    project_predictions = project_failure_predictions(
        projects=projects,
        tasks=tasks,
        velocity=velocity,
        workload_imbalance=workload_imbalance,
        approval=approval,
        now=now,
    )
    risk_cards = aggregate_cards(
        project_predictions,
        sprint_predictions,
        workload,
        bottlenecks,
        approval,
        velocity,
        missed,
        overdue,
    )
    top_score = risk_cards[0]["score"] if risk_cards else 0

    return {
        "generated_at": now,
        "scope": data["scope"],
        "method": "deterministic_explainable_scoring",
        "summary": {
            "overall_risk_score": top_score,
            "overall_risk_level": risk_level(top_score),
            "prediction_count": len(risk_cards),
            "critical_count": len([card for card in risk_cards if card["level"] == "critical"]),
            "high_count": len([card for card in risk_cards if card["level"] == "high"]),
            "real_data_points": {
                "projects": len(projects),
                "tasks": len(tasks),
                "sprints": len(sprints),
                "completion_events": len(velocity["activities"]),
                "pending_approvals": len(approval["pending"]),
                "workload_users": len(workload),
            },
        },
        "signals": {
            "task_completion_velocity": {
                key: value
                for key, value in velocity.items()
                if key != "activities"
            },
            "overdue_count": len(overdue),
            "missed_deadlines": len(missed),
            "dependency_chain_proxy": {
                "explicit_dependencies_available": False,
                "blocked_tasks": len(bottlenecks["blocked"]),
                "review_queue": len(bottlenecks["review"]),
                "project_blockers": bottlenecks["project_blockers"],
            },
            "approval_times": {
                "pending": len(approval["pending"]),
                "stale": len(approval["stale"]),
                "average_cycle_hours": approval["average_cycle_hours"],
            },
            "workload_distribution": {
                "imbalance_score": workload_imbalance,
                "users": workload,
            },
            "historical_completion_rate": clamp(
                len([task for task in tasks if task.status == "completed"]) / max(len(tasks), 1) * 100
            ),
            "project_progress": [
                {
                    "project": project_payload(project),
                    "calculated_progress": clamp(
                        len([task for task in tasks if task.project_id == project.id and task.status == "completed"])
                        / max(len([task for task in tasks if task.project_id == project.id]), 1)
                        * 100
                    ),
                }
                for project in projects
            ],
        },
        "risk_cards": risk_cards,
        "project_predictions": project_predictions,
        "sprint_predictions": sprint_predictions,
        "workload_predictions": workload,
        "recommendations": [
            card["recommendation"]
            for card in risk_cards
            if card["score"] >= 35
        ][:8],
        "evidence": {
            "overdue_tasks": [task_payload(task) for task in overdue[:20]],
            "missed_deadline_tasks": [task_payload(task) for task in missed[:20]],
            "blocked_tasks": [task_payload(task) for task in bottlenecks["blocked"][:20]],
            "stale_approvals": [
                {
                    "id": item.id,
                    "title": item.title,
                    "severity": item.severity,
                    "status": item.status,
                    "created_at": item.created_at,
                }
                for item in approval["stale"][:20]
            ],
        },
    }
