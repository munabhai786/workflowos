from app.services.task_service import find_task_by_title, update_task


def execute_update_task(payload: dict, db, current_user):
    task_id = payload.get("task_id") or payload.get("id")
    if not task_id:
        task_title = payload.get("task_title") or payload.get("title")
        task = find_task_by_title(db, task_title)
        if not task:
            raise ValueError("Unable to determine which task to update. Please provide a task title or ID.")
        task_id = task.id

    task = update_task(db, int(task_id), payload, current_user)
    return {
        "task": task,
        "task_id": task.id,
        "message": f"✓ Task updated: {task.title}",
        "action_result": {
            "intent": "update_task",
            "task_id": task.id,
            "title": task.title,
            "priority": task.priority,
            "status": task.status,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "assigned_to": task.assigned_to,
        },
    }
