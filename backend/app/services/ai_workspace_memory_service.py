from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import anthropic
from sqlalchemy.orm import Session

from app.agents.context_builder import context_builder
from app.core.config import settings
from app.models.ai_agent import AIApprovalHistory
from app.models.ai_copilot import AIConversation, AIMessage, AIUploadedFile
from app.models.user import User

MAX_CONTEXT_PROJECTS = 5
MAX_CONTEXT_TASKS = 6
MAX_CONTEXT_ACTIVITIES = 5


def _safe_date_string(value: Any) -> str:
    if value is None:
        return "unknown"
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _extract_json_object(text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    fragment = text[start : end + 1]
    try:
        parsed = json.loads(fragment)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def build_workspace_context(db: Session, current_user: User | None, role: str | None = None) -> dict[str, Any]:
    payload = context_builder.build(db, current_user, role, persist_snapshot=True)
    summary_lines = []
    summary_lines.append(
        f"Workspace snapshot generated at {payload['generated_at'].isoformat()}"
    )

    projects = payload.get("projects", [])
    tasks = payload.get("tasks", [])
    attachments = payload.get("attachments", [])
    analytics = payload.get("analytics", {})
    signals = payload.get("signals", {})

    active_projects = [project for project in projects if project.get("status") == "active"]
    overdue_projects = [project for project in projects if project.get("end_date") and isinstance(project.get("end_date"), str) and project["end_date"] < datetime.utcnow().date().isoformat() or project.get("end_date") and not isinstance(project.get("end_date"), str) and project["end_date"] < datetime.utcnow().date()]
    if active_projects:
        summary_lines.append(
            f"{len(active_projects)} active project(s), {len(overdue_projects)} overdue."
        )

    overdue_tasks = [task for task in tasks if task.get("due_date") and isinstance(task.get("due_date"), str) and task["due_date"] < datetime.utcnow().date().isoformat() or task.get("due_date") and not isinstance(task.get("due_date"), str) and task["due_date"] < datetime.utcnow().date()]
    if overdue_tasks:
        summary_lines.append(
            f"{len(overdue_tasks)} overdue task(s) across the active workspace."
        )

    if attachments:
        summary_lines.append(
            f"{len(attachments)} recent uploaded file(s) are available for analysis."
        )

    approvals = (
        db.query(AIApprovalHistory)
        .filter(AIApprovalHistory.user_id == current_user.id if current_user else AIApprovalHistory.user_id.isnot(None))
        .order_by(AIApprovalHistory.created_at.desc())
        .limit(20)
        .all()
    )
    if approvals:
        pending = [item for item in approvals if item.status == "pending"]
        summary_lines.append(
            f"{len(pending)} pending approval request(s) in the workspace."
        )

    recent_activity = []
    raw_activities = payload.get("raw", {}).get("activities", [])
    for activity in raw_activities[:MAX_CONTEXT_ACTIVITIES]:
        body = getattr(activity, "message", None) or getattr(activity, "description", None) or "Activity event"
        when = getattr(activity, "created_at", None)
        if when:
            when = _safe_date_string(when)
        recent_activity.append(f"{when}: {body}")

    if recent_activity:
        summary_lines.append(
            "Recent workspace activity includes: "
            + "; ".join(recent_activity[:3])
        )

    summary_lines.append(
        f"Key signals: {signals.get('total_projects', 0)} projects, {signals.get('total_tasks', 0)} tasks, {signals.get('total_attachments', 0)} uploads."
    )

    return {
        "summary": "\n".join(summary_lines),
        "summary_lines": summary_lines,
        "projects": [
            {
                "id": project.get("id"),
                "name": project.get("name"),
                "status": project.get("status"),
                "priority": project.get("priority"),
                "progress": project.get("progress"),
                "deadline": _safe_date_string(project.get("end_date")),
            }
            for project in projects[:MAX_CONTEXT_PROJECTS]
        ],
        "task_count": signals.get("total_tasks", 0),
        "project_count": signals.get("total_projects", 0),
        "attachment_count": signals.get("total_attachments", 0),
        "overdue_task_count": len(overdue_tasks),
        "pending_approval_count": len([item for item in approvals if item.status == "pending"]),
        "recent_activity": recent_activity,
        "context_hash": payload.get("context_hash"),
    }


def summarize_conversation_memory(db: Session, conversation: AIConversation) -> str:
    if not settings.ANTHROPIC_API_KEY:
        return conversation.memory_summary or ""

    messages = (
        db.query(AIMessage)
        .filter(AIMessage.conversation_id == str(conversation.id))
        .order_by(AIMessage.created_at.desc())
        .limit(16)
        .all()
    )

    if not messages:
        return conversation.memory_summary or ""

    lines = []
    for msg in reversed(messages):
        prefix = "User:" if msg.role == "user" else "Assistant:"
        lines.append(f"{prefix} {msg.content}")

    prompt = (
        "Summarize the conversation history for WorkflowOS Copilot in 3-4 concise bullet points. "
        "Capture decisions, project context, pending follow-ups, and blocking issues. "
        "Do not invent facts. Mention uncertainty only if the available conversation is incomplete."
    )

    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        base_url=settings.ANTHROPIC_BASE_URL,
    )

    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=400,
        temperature=0,
        system=prompt,
        messages=[
            {
                "role": "user",
                "content": (
                    "Previous memory summary:\n"
                    + (conversation.memory_summary or "No previous memory summary available.")
                    + "\n\nRecent conversation:\n"
                    + "\n".join(lines)
                ),
            }
        ],
    )

    memory_summary = response.content[0].text.strip()
    if memory_summary:
        conversation.memory_summary = memory_summary
        db.commit()
    return memory_summary


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
