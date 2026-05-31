import re

from app.services.task_service import find_task_by_title, update_task

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


def _normalize_status(value: str | None) -> str:
    if not value:
        return "todo"

    normalized = str(value).strip().lower()
    for alias, status in TASK_STATUS_ALIASES.items():
        if alias == normalized or alias in normalized:
            return status
    return normalized


def execute_change_status(payload: dict, db, current_user):
    task_id = payload.get("task_id") or payload.get("id")
    if not task_id:
        task_title = payload.get("task_title") or payload.get("title")
        task = find_task_by_title(db, task_title)
        if not task:
            raise ValueError("Unable to determine which task to update. Please provide a task title or ID.")
        task_id = task.id

    status = payload.get("status") or payload.get("task_status") or payload.get("new_status")
    if not status:
        raise ValueError("Change status payload must include a target status.")

    normalized_status = _normalize_status(status)
    task = update_task(db, int(task_id), {"status": normalized_status}, current_user)
    return {
        "task": task,
        "task_id": task.id,
        "message": f"✓ Task status updated: {task.title} is now {task.status}.",
        "action_result": {
            "intent": "change_status",
            "task_id": task.id,
            "title": task.title,
            "status": task.status,
            "due_date": task.due_date.isoformat() if task.due_date else None,
        },
    }
