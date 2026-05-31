from __future__ import annotations

from app.analytics.metrics_aggregator import clamp, serialize_project


def build_sprint_analytics(data: dict):
    sprints = []
    velocity_points = []

    for sprint in data["sprints"]:
        tasks = [link.task for link in sprint.tasks or [] if link.task]
        committed = sum((task.estimate_points or 1) for task in tasks)
        completed = sum((task.estimate_points or 1) for task in tasks if task.status == "completed")
        blocked = len([task for task in tasks if task.status == "blocked"])
        carried = len([task for task in tasks if task.status != "completed" and sprint.end_date < data["now"].date()])
        predictability = clamp(completed / max(sprint.velocity or committed or 1, 1) * 100)
        completion = clamp(completed / max(committed, 1) * 100)
        velocity_points.append(completed)
        sprints.append({
            "id": sprint.id,
            "name": sprint.name,
            "goal": sprint.goal,
            "project": serialize_project(sprint.project),
            "start_date": sprint.start_date,
            "end_date": sprint.end_date,
            "status": sprint.status,
            "velocity": sprint.velocity or 0,
            "committed_points": committed,
            "completed_points": completed,
            "remaining_points": max(committed - completed, 0),
            "completion_rate": completion,
            "predictability": predictability,
            "blocked_tasks": blocked,
            "carry_over_tasks": carried,
            "burndown": [
                {"label": "Committed", "value": committed},
                {"label": "Completed", "value": completed},
                {"label": "Remaining", "value": max(committed - completed, 0)},
            ],
        })

    avg_velocity = sum(velocity_points) / max(len(velocity_points), 1)
    consistency = clamp(100 - (max(velocity_points or [0]) - min(velocity_points or [0])) * 8)

    return {
        "sprints": sprints,
        "summary": {
            "average_velocity": round(avg_velocity),
            "sprint_count": len(sprints),
            "predictability": clamp(sum(item["predictability"] for item in sprints) / max(len(sprints), 1)),
            "consistency": consistency,
            "blocked_work": sum(item["blocked_tasks"] for item in sprints),
            "carry_over_work": sum(item["carry_over_tasks"] for item in sprints),
        },
    }
