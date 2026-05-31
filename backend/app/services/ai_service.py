from datetime import datetime
from datetime import timedelta

from app.models.task import Task


def calculate_productivity_score(tasks):
    if not tasks:
        return 0

    completed_tasks = [
        task for task in tasks
        if task.status == "completed"
    ]

    score = (
        len(completed_tasks) / len(tasks)
    ) * 10

    return round(min(score, 10), 1)


def get_deadline_risks(tasks):
    risks = []

    now = datetime.utcnow()

    for task in tasks:
        if not task.deadline:
            continue

        if (
            task.status != "completed"
            and task.deadline < now
        ):
            risks.append({
                "task": task.title,
                "risk": "Overdue",
                "priority": "high",
            })

        elif (
            task.status != "completed"
            and task.deadline < now + timedelta(days=3)
        ):
            risks.append({
                "task": task.title,
                "risk": "Approaching deadline",
                "priority": "medium",
            })

    return risks


def generate_priority_suggestions(tasks):
    suggestions = []

    high_priority_tasks = sorted(
        tasks,
        key=lambda x: (
            x.priority == "high",
            x.deadline or datetime.max,
        ),
        reverse=True,
    )

    for task in high_priority_tasks[:3]:
        suggestions.append({
            "task": task.title,
            "suggestion": "Prioritize this task immediately",
        })

    return suggestions