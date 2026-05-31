from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.agents.base_agent import BaseAgent


class SchedulingAgent(BaseAgent):
    key = "scheduling"
    name = "AI Scheduling Agent"
    description = "Optimizes due dates, schedule allocations, and deadline conflicts."

    def analyze(self, db: Session, context: dict) -> list:
        now = datetime.utcnow()
        recommendations = []
        tasks = [task for task in context["tasks"] if task["status"] != "completed"]
        by_user_day = defaultdict(list)

        for task in tasks:
            if task["assigned_to"] and task["due_date"]:
                by_user_day[(task["assigned_to"], task["due_date"].date().isoformat())].append(task)

            if task["due_date"] and task["due_date"] < now and task["status"] != "blocked":
                new_due = now + timedelta(days=2)
                recommendations.append(self.recommendation(
                    category="deadline_conflict",
                    title="Overdue task reschedule required",
                    message=f"Reschedule {task['title']} to {new_due.date().isoformat()} or escalate ownership.",
                    reasoning="The task is past due and still open, which distorts schedule reliability.",
                    recommendation_type="action",
                    action_type="reschedule_task",
                    action_payload={
                        "task_id": task["id"],
                        "due_date": new_due.isoformat(),
                        "reason": "AI scheduling recovery for overdue work",
                    },
                    severity="high",
                    confidence=0.82,
                    project_id=task["project_id"],
                    task_id=task["id"],
                    user_id=task["assigned_to"],
                ))

        for (user_id, day), day_tasks in by_user_day.items():
            points = sum(task["estimate_points"] for task in day_tasks)
            if len(day_tasks) >= 4 or points >= 8:
                movable = sorted(day_tasks, key=lambda item: (item["priority"] == "high", item["estimate_points"]))[:2]
                recommendations.append(self.recommendation(
                    category="schedule_overload",
                    title="Daily schedule overload detected",
                    message=f"Move {len(movable)} task(s) from {day} to reduce overload for team member {user_id}.",
                    reasoning=f"{len(day_tasks)} task(s) and {points} point(s) are due on the same day.",
                    recommendation_type="action",
                    action_type="rebalance_due_dates",
                    action_payload={
                        "user_id": user_id,
                        "from_date": day,
                        "task_ids": [task["id"] for task in movable],
                        "offset_days": 1,
                    },
                    severity="medium",
                    confidence=0.8,
                    user_id=user_id,
                ))

        return recommendations
