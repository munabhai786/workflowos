from typing import Any

from sqlalchemy.orm import Session

from app.services.ai_actions.create_task_action import execute_create_task
from app.services.ai_actions.update_task_action import execute_update_task
from app.services.ai_actions.assign_task_action import execute_assign_task
from app.services.ai_actions.change_status_action import execute_change_status


def execute_ai_action(
    action: dict[str, Any],
    db: Session,
    current_user,
) -> dict[str, Any]:
    intent = action.get("intent")
    payload = action.get("payload") or {}

    if intent == "create_task":
        return execute_create_task(payload, db, current_user)
    if intent == "update_task":
        return execute_update_task(payload, db, current_user)
    if intent == "assign_task":
        return execute_assign_task(payload, db, current_user)
    if intent in {"change_status", "change_task_status"}:
        return execute_change_status(payload, db, current_user)

    raise ValueError(f"Unsupported AI action intent: {intent}")
