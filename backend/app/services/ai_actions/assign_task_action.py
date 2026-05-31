from app.services.task_service import find_task_by_title, find_user_by_name, update_task


def execute_assign_task(payload: dict, db, current_user):
    task_id = payload.get("task_id") or payload.get("id")
    if not task_id:
        task_title = payload.get("task_title") or payload.get("title")
        task = find_task_by_title(db, task_title)
        if not task:
            raise ValueError("Unable to determine which task to assign. Please provide a task title or ID.")
        task_id = task.id

    assignee_id = payload.get("assigned_to") or payload.get("assignee") or payload.get("assignee_name")
    if isinstance(assignee_id, str) and not assignee_id.isdigit():
        user = find_user_by_name(db, assignee_id)
        if not user:
            raise ValueError("Unable to resolve assignee. Please provide the full name or email of the assignee.")
        assignee_id = user.id

    if not assignee_id:
        raise ValueError("Assignment payload must include an assignee.")

    task = update_task(db, int(task_id), {"assigned_to": int(assignee_id)}, current_user)
    return {
        "task": task,
        "task_id": task.id,
        "message": f"✓ Task assigned: {task.title}",
        "action_result": {
            "intent": "assign_task",
            "task_id": task.id,
            "title": task.title,
            "assigned_to": task.assigned_to,
            "status": task.status,
        },
    }
