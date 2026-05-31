from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.analytics.analytics_engine import build_enterprise_analytics
from app.analytics.metrics_aggregator import collect_operational_data
from app.models.ai_agent import AIContextSnapshot
from app.models.user import User


def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _task_payload(task):
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "project_id": task.project_id,
        "assigned_to": task.assigned_to,
        "due_date": task.due_date,
        "scheduled_start": task.scheduled_start,
        "scheduled_end": task.scheduled_end,
        "estimate_points": task.estimate_points or 1,
        "created_at": task.created_at,
    }


def _project_payload(project):
    return {
        "id": project.id,
        "name": project.name,
        "status": project.status,
        "priority": project.priority,
        "progress": project.progress or 0,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "owner_id": project.owner_id,
        "created_at": project.created_at,
    }


class AIContextBuilder:
    def build(
        self,
        db: Session,
        current_user: User | None = None,
        role: str | None = None,
        project_id: int | None = None,
        persist_snapshot: bool = True,
    ) -> dict[str, Any]:
        data = collect_operational_data(db, current_user, role)
        if project_id is not None:
            data["projects"] = [project for project in data["projects"] if project.id == project_id]
            data["tasks"] = [task for task in data["tasks"] if task.project_id == project_id]
            data["sprints"] = [sprint for sprint in data["sprints"] if sprint.project_id == project_id]
            data["activities"] = [activity for activity in data["activities"] if activity.project_id == project_id]
            task_ids = {task.id for task in data["tasks"]}
            data["comments"] = [comment for comment in data["comments"] if comment.task_id in task_ids]
            data["attachments"] = [
                attachment for attachment in data["attachments"]
                if attachment.project_id == project_id or attachment.task_id in task_ids
            ]

        analytics = build_enterprise_analytics(db, current_user, role)
        now = datetime.utcnow()
        tasks = data["tasks"]
        projects = data["projects"]
        comments = data["comments"]
        activities = data["activities"]
        sprints = data["sprints"]

        tasks_by_status = Counter(task.status for task in tasks)
        tasks_by_project = defaultdict(list)
        workload = defaultdict(lambda: {"open": 0, "overdue": 0, "in_progress": 0, "points": 0})
        for task in tasks:
            tasks_by_project[task.project_id].append(task)
            if task.assigned_to and task.status != "completed":
                workload[task.assigned_to]["open"] += 1
                workload[task.assigned_to]["points"] += task.estimate_points or 1
                if task.status == "in_progress":
                    workload[task.assigned_to]["in_progress"] += 1
                if task.due_date and task.due_date < now:
                    workload[task.assigned_to]["overdue"] += 1

        recent_comments_by_task = Counter(
            comment.task_id for comment in comments
            if comment.created_at and comment.created_at >= now - timedelta(days=7)
        )
        recent_activity_by_project = Counter(
            activity.project_id for activity in activities
            if activity.project_id and activity.created_at and activity.created_at >= now - timedelta(days=7)
        )

        payload = {
            "generated_at": now,
            "scope": "project" if project_id else data["scope"],
            "project_id": project_id,
            "current_user_id": current_user.id if current_user else None,
            "role": role,
            "projects": [_project_payload(project) for project in projects],
            "tasks": [_task_payload(task) for task in tasks],
            "sprints": [
                {
                    "id": sprint.id,
                    "name": sprint.name,
                    "project_id": sprint.project_id,
                    "status": sprint.status,
                    "start_date": sprint.start_date,
                    "end_date": sprint.end_date,
                    "velocity": sprint.velocity or 0,
                    "committed_points": sprint.committed_points or 0,
                    "completed_points": sprint.completed_points or 0,
                    "task_count": len(sprint.tasks),
                }
                for sprint in sprints
            ],
            "comments": [
                {
                    "id": comment.id,
                    "task_id": comment.task_id,
                    "author_id": comment.author_id,
                    "body": comment.body[:500],
                    "created_at": comment.created_at,
                    "updated_at": comment.updated_at,
                }
                for comment in sorted(comments, key=lambda item: item.created_at, reverse=True)[:80]
            ],
            "attachments": [
                {
                    "id": attachment.id,
                    "project_id": attachment.project_id,
                    "task_id": attachment.task_id,
                    "file_name": getattr(attachment, "file_name", None),
                    "mime_type": getattr(attachment, "mime_type", None),
                    "uploaded_at": getattr(attachment, "uploaded_at", None),
                }
                for attachment in data["attachments"][:80]
            ],
            "automation": analytics.get("automation", {}),
            "analytics": {
                "kpis": analytics.get("kpis", {}),
                "workload": analytics.get("workload", {}),
                "sprint": analytics.get("sprint", {}),
                "forecasts": analytics.get("forecasts", {}),
                "executive": analytics.get("executive", {}),
                "task_distribution": analytics.get("task_distribution", []),
            },
            "signals": {
                "tasks_by_status": dict(tasks_by_status),
                "workload_by_user": dict(workload),
                "recent_comments_by_task": dict(recent_comments_by_task),
                "recent_activity_by_project": dict(recent_activity_by_project),
                "total_projects": len(projects),
                "total_tasks": len(tasks),
                "total_comments": len(comments),
                "total_attachments": len(data["attachments"]),
            },
            "raw": data,
        }
        stable_payload = {key: value for key, value in payload.items() if key != "raw"}
        payload_json = json.dumps(stable_payload, default=_json_default, sort_keys=True)
        context_hash = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()
        payload["context_hash"] = context_hash

        if persist_snapshot:
            snapshot = AIContextSnapshot(
                scope=payload["scope"],
                project_id=project_id,
                user_id=current_user.id if current_user else None,
                context_hash=context_hash,
                payload_json=payload_json,
            )
            db.add(snapshot)
            db.commit()

        return payload


context_builder = AIContextBuilder()
