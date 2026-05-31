from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.agents.base_agent import BaseAgent, clamp


class ProjectManagerAgent(BaseAgent):
    key = "project_manager"
    name = "AI Project Manager Agent"
    description = "Detects delivery risk, blocked work, sprint pressure, and staffing imbalance."

    def analyze(self, db: Session, context: dict) -> list:
        now = datetime.utcnow()
        recommendations = []
        tasks = context["tasks"]
        projects = context["projects"]
        activity = context["signals"]["recent_activity_by_project"]
        workload = context["signals"]["workload_by_user"]

        for project in projects:
            project_tasks = [task for task in tasks if task["project_id"] == project["id"]]
            open_tasks = [task for task in project_tasks if task["status"] != "completed"]
            blocked = [task for task in open_tasks if task["status"] == "blocked"]
            overdue = [
                task for task in open_tasks
                if task["due_date"] and task["due_date"] < now
            ]
            review = [task for task in open_tasks if task["status"] == "review"]
            inactive = activity.get(project["id"], 0) == 0 and (project["progress"] or 0) < 80
            risk = clamp(
                len(overdue) * 18 +
                len(blocked) * 20 +
                len(review) * 7 +
                (20 if inactive else 0) -
                project["progress"] * 0.25
            )

            if risk >= 35:
                delay_days = max(1, round((len(overdue) * 1.5) + (len(blocked) * 2) + (len(review) * 0.5)))
                recommendations.append(self.recommendation(
                    category="delivery_risk",
                    title=f"{project['name']} delivery risk increased",
                    message=f"{project['name']} is likely delayed by {delay_days} day(s) unless blockers are cleared.",
                    reasoning=(
                        f"Detected {len(overdue)} overdue task(s), {len(blocked)} blocked task(s), "
                        f"{len(review)} review task(s), and project progress at {project['progress']}%."
                    ),
                    recommendation_type="action",
                    action_type="escalate_blocked_items",
                    action_payload={
                        "project_id": project["id"],
                        "blocked_task_ids": [task["id"] for task in blocked],
                        "overdue_task_ids": [task["id"] for task in overdue],
                        "message": f"Escalate delivery risks for {project['name']}.",
                    },
                    severity="critical" if risk >= 70 else "high",
                    confidence=min(0.95, 0.58 + risk / 100),
                    project_id=project["id"],
                ))

        overloaded = [
            (int(user_id), stats)
            for user_id, stats in workload.items()
            if stats["open"] >= 6 or stats["overdue"] >= 2 or stats["points"] >= 12
        ]
        for user_id, stats in overloaded[:6]:
            overload = clamp(stats["open"] * 10 + stats["overdue"] * 18 + stats["points"] * 4)
            recommendations.append(self.recommendation(
                category="workload",
                title="Workload rebalance recommended",
                message=f"Team member {user_id} is overloaded by approximately {max(0, overload - 60)}%.",
                reasoning=f"Open work: {stats['open']}, overdue work: {stats['overdue']}, estimated points: {stats['points']}.",
                recommendation_type="action",
                action_type="rebalance_workload",
                action_payload={
                    "source_user_id": user_id,
                    "target_open_task_limit": 5,
                    "strategy": "move lower-priority overdue or in-progress tasks to available capacity",
                },
                severity="high",
                confidence=min(0.92, 0.6 + overload / 130),
                user_id=user_id,
            ))

        sprints = context["sprints"]
        for sprint in sprints:
            committed = sprint["committed_points"] or sum(
                task["estimate_points"] for task in tasks
                if task["project_id"] == sprint["project_id"] and task["status"] != "completed"
            )
            if committed > max(sprint["velocity"], 1) * 1.25 and sprint["status"] in {"planned", "active"}:
                move_count = max(1, round((committed - max(sprint["velocity"], 1)) / 2))
                recommendations.append(self.recommendation(
                    category="sprint_planning",
                    title="Sprint scope adjustment recommended",
                    message=f"Move {move_count} task(s) from {sprint['name']} to protect delivery confidence.",
                    reasoning=f"Sprint committed points ({committed}) exceed velocity ({sprint['velocity']}).",
                    recommendation_type="action",
                    action_type="suggest_sprint_adjustment",
                    action_payload={
                        "sprint_id": sprint["id"],
                        "project_id": sprint["project_id"],
                        "move_task_count": move_count,
                    },
                    severity="medium",
                    confidence=0.78,
                    project_id=sprint["project_id"],
                ))

        return recommendations
