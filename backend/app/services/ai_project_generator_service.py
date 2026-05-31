from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

import anthropic
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User

PROJECT_GENERATOR_SYSTEM_PROMPT = (
    "You are WorkflowOS AI Project Generator. "
    "Given a clear project idea, return one JSON object only. "
    "The structure must include keys: project, milestones, tasks, dependencies, risks, recommendations. "
    "Use ISO dates in YYYY-MM-DD format. Do not add text outside the JSON object. "
    "If a field is not available, use null or an empty list. "
    "Do not invent team members, owners, or facts that are not supported by the workspace context. "
)


def _extract_json_object(text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}$", text.strip())
    if not match:
        return None

    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _parse_iso_date(value: Any):
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            try:
                return datetime.strptime(value, "%Y-%m-%d").date()
            except Exception:
                return None
    if hasattr(value, "date"):
        return value.date() if hasattr(value, "time") else value
    return None


def preview_project_plan(
    db: Session,
    current_user: User | None,
    project_description: str,
    workspace_summary: str | None = None,
) -> dict[str, Any]:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("Project preview requires Claude integration.")

    payload = {
        "project_idea": project_description.strip(),
        "workspace_context": workspace_summary or "",
    }

    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        base_url=settings.ANTHROPIC_BASE_URL,
    )

    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        temperature=0.2,
        max_tokens=1400,
        system=PROJECT_GENERATOR_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": json.dumps(payload, default=str),
            }
        ],
    )

    raw_text = response.content[0].text.strip()
    parsed = _extract_json_object(raw_text)
    if not parsed:
        raise ValueError(
            "Unable to parse project preview from Claude. Please simplify the idea and try again."
        )

    parsed.setdefault("project", {})
    parsed.setdefault("milestones", [])
    parsed.setdefault("tasks", [])
    parsed.setdefault("dependencies", [])
    parsed.setdefault("risks", [])
    parsed.setdefault("recommendations", [])

    return {
        "preview": parsed,
        "raw_text": raw_text,
    }


def generate_project_from_plan(
    db: Session,
    current_user: User | None,
    plan: dict[str, Any],
) -> dict[str, Any]:
    from app.models.milestone import Milestone
    from app.models.project import Project
    from app.models.user import User as UserModel
    from app.services.activity_service import create_activity
    from app.services.realtime_service import (
        schedule_global_event,
        schedule_project_event,
    )
    from app.services.task_service import create_task

    project_data = plan.get("project") or {}
    if not project_data.get("name"):
        raise ValueError("Project plan must include a project name.")

    owner_id = project_data.get("owner_id")
    if owner_id is not None:
        owner = db.query(UserModel).filter(UserModel.id == owner_id).first()
        if not owner:
            owner_id = current_user.id if current_user else None
    else:
        owner_id = current_user.id if current_user else None

    start_date = _parse_iso_date(project_data.get("start_date"))
    end_date = _parse_iso_date(project_data.get("end_date"))
    if not start_date:
        start_date = datetime.utcnow().date()
    if not end_date:
        end_date = start_date

    project = Project(
        name=str(project_data.get("name")).strip(),
        description=str(project_data.get("description", "") or "").strip(),
        priority=str(project_data.get("priority", "medium") or "medium"),
        status=str(project_data.get("status", "active") or "active"),
        start_date=start_date,
        end_date=end_date,
        owner_id=owner_id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    create_activity(
        db=db,
        action_type="project_created",
        message=(
            f"{current_user.full_name if current_user else 'A teammate'} created project {project.name}."
        ),
        user_id=current_user.id if current_user else None,
        project_id=project.id,
    )

    created_tasks = []
    for task_data in plan.get("tasks", [])[:40]:
        task_payload = {
            "title": task_data.get("title") or task_data.get("name") or "Untitled task",
            "description": task_data.get("description", ""),
            "priority": task_data.get("priority", "medium"),
            "status": task_data.get("status", "todo"),
            "due_date": _parse_iso_date(task_data.get("due_date")) or None,
            "project_id": project.id,
            "assigned_to": task_data.get("assigned_to"),
            "labels": task_data.get("labels") or task_data.get("tags") or [],
        }
        created_task = create_task(db, task_payload, current_user)
        created_tasks.append(created_task)

    created_milestones = []
    for milestone_data in plan.get("milestones", [])[:12]:
        milestone = Milestone(
            title=milestone_data.get("title") or milestone_data.get("name") or "Milestone",
            description=milestone_data.get("description", ""),
            due_date=_parse_iso_date(milestone_data.get("due_date")) or end_date,
            status=milestone_data.get("status", "planned"),
            project_id=project.id,
            created_by=current_user.id if current_user else None,
        )
        db.add(milestone)
        created_milestones.append(milestone)

    db.commit()

    schedule_project_event(
        project.id,
        "project.created",
        {"project_id": project.id, "name": project.name},
    )
    schedule_global_event(
        "analytics.updated",
        {"source": "project.generated", "project_id": project.id},
    )

    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "priority": project.priority,
            "status": project.status,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "owner_id": project.owner_id,
            "created_at": project.created_at,
        },
        "tasks": [
            {
                "id": task.id,
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "due_date": task.due_date,
                "project_id": task.project_id,
                "assigned_to": task.assigned_to,
            }
            for task in created_tasks
        ],
        "milestones": [
            {
                "id": milestone.id,
                "title": milestone.title,
                "description": milestone.description,
                "due_date": milestone.due_date,
                "status": milestone.status,
            }
            for milestone in created_milestones
        ],
    }
