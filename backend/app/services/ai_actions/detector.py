from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Any

from app.core.config import settings


ACTION_INTENTS = {
    "create_task",
    "update_task",
    "assign_task",
    "change_status",
    "change_task_status",
    "create_project",
    "summarize_project",
    "generate_report",
    "create_approval",
    "create_notification",
}

MUTATING_INTENTS = {
    "create_task",
    "update_task",
    "assign_task",
    "change_status",
    "change_task_status",
    "create_project",
    "create_approval",
    "create_notification",
}

TASK_STATUS_ALIASES = {
    "todo": "todo",
    "to do": "todo",
    "backlog": "todo",
    "start": "in_progress",
    "started": "in_progress",
    "in progress": "in_progress",
    "doing": "in_progress",
    "review": "review",
    "blocked": "blocked",
    "complete": "completed",
    "completed": "completed",
    "done": "completed",
}

PRIORITIES = {"low", "medium", "high", "urgent"}


def _today() -> date:
    return datetime.utcnow().date()


def _parse_relative_date(text: str) -> str | None:
    lower = text.lower()
    today = _today()

    if "tomorrow" in lower:
        return (today + timedelta(days=1)).isoformat()

    if "today" in lower:
        return today.isoformat()

    next_week_match = re.search(r"\bnext\s+week\b", lower)
    if next_week_match:
        return (today + timedelta(days=7)).isoformat()

    iso_match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
    if iso_match:
        return iso_match.group(1)

    return None


def _extract_json_object(text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None

    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _normalize_priority(text: str, fallback: str = "medium") -> str:
    lower = text.lower()
    for priority in ["urgent", "high", "medium", "low"]:
        if priority in lower:
            return priority
    return fallback if fallback in PRIORITIES else "medium"


def _normalize_status(value: str | None) -> str:
    if not value:
        return "todo"
    return TASK_STATUS_ALIASES.get(value.lower().replace("_", " "), value)


def _clean_title(title: str) -> str:
    title = re.sub(
        r"\b(create|add|make|new)\s+(a\s+)?(task|todo|project)\s+(for|to|called|named)?\b",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(
        r"\b(today|tomorrow|next week|low priority|medium priority|high priority|urgent priority|low|medium|high|urgent)\b",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(r"\s+", " ", title).strip(" .:-")
    return title[:160]


def _heuristic_detect(message: str) -> dict[str, Any]:
    lower = message.lower().strip()

    if not lower:
        return {"intent": "none", "confidence": 0.0, "requires_confirmation": False}

    if any(phrase in lower for phrase in ["create task", "add task", "new task", "create todo", "add todo"]):
        title = _clean_title(message)
        missing_fields = []
        if not title:
            missing_fields.append("title")

        return {
            "intent": "create_task",
            "confidence": 0.72 if title else 0.45,
            "requires_confirmation": True,
            "summary": f"Create task: {title or 'Untitled task'}",
            "payload": {
                "title": title or "Untitled task",
                "description": "",
                "priority": _normalize_priority(message),
                "status": "todo",
                "due_date": _parse_relative_date(message),
                "project_id": None,
                "assigned_to": None,
                "labels": [],
            },
            "missing_fields": missing_fields,
            "warnings": [],
        }

    assign_match = re.search(r"assign\s+(.+?)\s+to\s+(.+)", lower)
    if assign_match:
        task_text = _clean_title(assign_match.group(1))
        assignee_text = assign_match.group(2).strip()
        return {
            "intent": "assign_task",
            "confidence": 0.75,
            "requires_confirmation": True,
            "summary": f"Assign task: {task_text or 'task'} to {assignee_text}",
            "payload": {
                "task_title": task_text,
                "assignee": assignee_text,
            },
            "missing_fields": [field for field in ["task_title", "assignee"] if not (field == "assignee" and assignee_text)],
            "warnings": [],
        }

    if any(phrase in lower for phrase in ["mark", "move", "set", "complete", "done"]) and any(status in lower for status in TASK_STATUS_ALIASES):
        title = _clean_title(message)
        status_value = None
        for alias in TASK_STATUS_ALIASES:
            if alias in lower:
                status_value = TASK_STATUS_ALIASES[alias]
                break

        if status_value:
            return {
                "intent": "change_task_status",
                "confidence": 0.7,
                "requires_confirmation": True,
                "summary": f"Change task status: {title or 'task'} to {status_value}",
                "payload": {
                    "task_title": title,
                    "status": status_value,
                },
                "missing_fields": ["task_title"] if not title else [],
                "warnings": [],
            }

    if any(phrase in lower for phrase in ["create project", "new project", "add project"]):
        name = _clean_title(message)
        return {
            "intent": "create_project",
            "confidence": 0.62,
            "requires_confirmation": True,
            "summary": f"Create project: {name or 'New project'}",
            "payload": {
                "name": name,
                "description": "",
                "priority": _normalize_priority(message),
                "status": "active",
                "start_date": _today().isoformat(),
                "end_date": _parse_relative_date(message) or (_today() + timedelta(days=14)).isoformat(),
                "owner_id": None,
            },
            "missing_fields": ["name", "description"] if not name else ["description"],
            "warnings": ["Project creation requires a detailed description before it can be confirmed."],
        }

    if any(word in lower for word in ["report", "summarize", "summary"]):
        return {
            "intent": "generate_report" if "report" in lower else "summarize_project",
            "confidence": 0.55,
            "requires_confirmation": False,
            "summary": "Generate an informational Copilot response",
            "payload": {},
            "missing_fields": [],
            "warnings": [],
        }

    return {"intent": "none", "confidence": 0.0, "requires_confirmation": False}


def _normalize_detected_action(action: dict[str, Any], original_message: str) -> dict[str, Any]:
    intent = action.get("intent") or "none"

    if intent not in ACTION_INTENTS:
        intent = "none"

    payload = action.get("payload") if isinstance(action.get("payload"), dict) else {}
    warnings = action.get("warnings") if isinstance(action.get("warnings"), list) else []
    missing_fields = action.get("missing_fields") if isinstance(action.get("missing_fields"), list) else []

    if intent == "create_task":
        payload = {
            "title": (payload.get("title") or _clean_title(original_message) or "Untitled task")[:160],
            "description": payload.get("description") or "",
            "priority": _normalize_priority(str(payload.get("priority") or original_message)),
            "status": _normalize_status(payload.get("status")),
            "due_date": payload.get("due_date") or _parse_relative_date(original_message),
            "project_id": payload.get("project_id"),
            "assigned_to": payload.get("assigned_to"),
            "labels": payload.get("labels") if isinstance(payload.get("labels"), list) else [],
        }
        missing_fields = [field for field in missing_fields if field in {"title", "project_id", "assigned_to"}]

    if intent in {"assign_task", "update_task", "change_status", "change_task_status"}:
        payload = {
            "task_id": payload.get("task_id") or payload.get("id"),
            "task_title": payload.get("task_title") or payload.get("title") or _clean_title(original_message),
            "assignee": payload.get("assignee") or payload.get("assigned_to"),
            "status": _normalize_status(
                payload.get("status") or payload.get("task_status") or payload.get("new_status")
            ),
            "due_date": payload.get("due_date") or _parse_relative_date(original_message),
            "description": payload.get("description") or "",
            "labels": payload.get("labels") if isinstance(payload.get("labels"), list) else [],
        }
        if intent == "assign_task":
            missing_fields = [field for field in missing_fields if field in {"task_title", "assignee"}]
        elif intent in {"change_status", "change_task_status"}:
            missing_fields = [field for field in missing_fields if field in {"task_title", "status"}]
        else:
            missing_fields = [field for field in missing_fields if field in {"task_title", "task_id", "status", "assignee"}]

    if intent == "create_project":
        payload = {
            "name": payload.get("name") or _clean_title(original_message),
            "description": payload.get("description") or "",
            "priority": _normalize_priority(str(payload.get("priority") or original_message)),
            "status": payload.get("status") or "active",
            "start_date": payload.get("start_date") or _today().isoformat(),
            "end_date": payload.get("end_date") or _parse_relative_date(original_message) or (_today() + timedelta(days=14)).isoformat(),
            "owner_id": payload.get("owner_id"),
        }
        if len(payload["description"]) < 100 and "description" not in missing_fields:
            missing_fields.append("description")
        if len(payload["name"]) < 20 and "name" not in missing_fields:
            missing_fields.append("name")
        if missing_fields and not warnings:
            warnings.append("Project creation needs a longer title and description before confirmation.")

    confidence = action.get("confidence", 0.0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    return {
        "intent": intent,
        "confidence": max(0.0, min(1.0, confidence)),
        "requires_confirmation": bool(action.get("requires_confirmation", intent in MUTATING_INTENTS)),
        "summary": action.get("summary") or intent.replace("_", " ").title(),
        "payload": payload,
        "missing_fields": missing_fields,
        "warnings": warnings,
        "executable": intent in {"create_task", "create_project", "assign_task", "update_task", "change_status", "change_task_status"} and not missing_fields,
    }


def _claude_detect(message: str, context_hint: str | None = None) -> dict[str, Any] | None:
    if not settings.ANTHROPIC_API_KEY:
        return None

    import anthropic

    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        base_url=settings.ANTHROPIC_BASE_URL,
    )

    today = _today().isoformat()
    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=700,
        temperature=0,
        system=(
            "You classify WorkflowOS Copilot messages into safe action intents. "
            "Return one JSON object only. Do not execute anything. "
            f"Today's date is {today}. Supported intents: "
            f"{', '.join(sorted(ACTION_INTENTS))}, none. "
            "Use ISO dates. Mutating intents require confirmation. "
            "Only mark executable true when required fields are present."
        ),
        messages=[
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "message": message,
                        "context_hint": context_hint or "",
                        "schema": {
                            "intent": "create_task | create_project | update_task | assign_task | change_status | change_task_status | summarize_project | generate_report | create_approval | create_notification | none",
                            "confidence": 0.0,
                            "requires_confirmation": True,
                            "summary": "short human readable summary",
                            "payload": {},
                            "missing_fields": [],
                            "warnings": [],
                        },
                    }
                ),
            }
        ],
    )

    return _extract_json_object(response.content[0].text)


def detect_ai_action(message: str, context_hint: str | None = None) -> dict[str, Any]:
    try:
        detected = _claude_detect(message, context_hint=context_hint)
    except Exception:
        detected = None

    if not detected:
        detected = _heuristic_detect(message)

    normalized = _normalize_detected_action(detected, message)

    if normalized["intent"] == "none" or normalized["confidence"] < 0.5:
        return {
            "intent": "none",
            "confidence": normalized["confidence"],
            "requires_confirmation": False,
            "summary": "",
            "payload": {},
            "missing_fields": [],
            "warnings": [],
            "executable": False,
        }

    return normalized
