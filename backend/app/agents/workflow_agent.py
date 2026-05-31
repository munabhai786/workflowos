from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.base_agent import BaseAgent


class WorkflowOptimizationAgent(BaseAgent):
    key = "workflow_optimization"
    name = "AI Workflow Optimization Agent"
    description = "Finds bottlenecks, inefficiencies, automation opportunities, and priority drift."

    def analyze(self, db: Session, context: dict) -> list:
        recommendations = []
        statuses = context["signals"]["tasks_by_status"]
        automation = context["automation"].get("summary", {})
        tasks = context["tasks"]

        review_count = statuses.get("review", 0)
        in_progress = statuses.get("in_progress", 0)
        completed = statuses.get("completed", 0)
        blocked = statuses.get("blocked", 0)

        if review_count >= 3:
            recommendations.append(self.recommendation(
                category="bottleneck",
                title="Review stage creating delivery bottleneck",
                message=f"{review_count} task(s) are waiting in review. Add a review SLA or auto-reminder workflow.",
                reasoning="Review inventory is high enough to slow delivery flow and reduce predictability.",
                recommendation_type="action",
                action_type="create_workflow_automation",
                action_payload={
                    "name": "Review SLA reminder",
                    "trigger_type": "task_stale_in_review",
                    "conditions": {"status": "review", "age_hours": 24},
                    "actions": [{"type": "notify_assignee"}, {"type": "notify_project_owner"}],
                },
                severity="medium",
                confidence=0.84,
            ))

        if in_progress > max(completed, 1) and in_progress >= 4:
            recommendations.append(self.recommendation(
                category="wip_limit",
                title="Too much concurrent work in progress",
                message="Reduce active work before pulling more tasks into execution.",
                reasoning=f"{in_progress} task(s) are in progress while only {completed} are completed in the current context.",
                recommendation_type="action",
                action_type="reprioritize_tasks",
                action_payload={
                    "strategy": "prioritize oldest in-progress and highest-risk due dates",
                    "limit_new_in_progress": True,
                },
                severity="medium",
                confidence=0.76,
            ))

        if blocked >= 2:
            recommendations.append(self.recommendation(
                category="blocked_work",
                title="Auto-escalation workflow recommended",
                message=f"{blocked} blocked task(s) should trigger owner escalation.",
                reasoning="Blocked work is accumulating and should not rely on manual monitoring.",
                recommendation_type="action",
                action_type="create_workflow_automation",
                action_payload={
                    "name": "Blocked task escalation",
                    "trigger_type": "task_blocked",
                    "conditions": {"status": "blocked", "age_hours": 12},
                    "actions": [{"type": "notify_project_owner"}, {"type": "create_reminder"}],
                },
                severity="high",
                confidence=0.86,
            ))

        if automation and automation.get("executions", 0) > 0 and automation.get("success_rate", 100) < 85:
            recommendations.append(self.recommendation(
                category="automation_reliability",
                title="Automation reliability needs attention",
                message=f"Automation success rate is {automation.get('success_rate')}%. Audit failing rules before adding more automation.",
                reasoning="Low automation reliability can create noisy or missed operational actions.",
                recommendation_type="insight",
                severity="medium",
                confidence=0.79,
            ))

        high_priority_open = [
            task for task in tasks
            if task["priority"] == "high" and task["status"] in {"todo", "blocked"}
        ]
        if len(high_priority_open) >= 3:
            recommendations.append(self.recommendation(
                category="priority_drift",
                title="High-priority work is not moving",
                message=f"{len(high_priority_open)} high-priority task(s) are still waiting or blocked.",
                reasoning="Priority labels are not translating into active execution.",
                recommendation_type="action",
                action_type="auto_prioritize_tasks",
                action_payload={"task_ids": [task["id"] for task in high_priority_open[:8]], "priority": "high"},
                severity="high",
                confidence=0.81,
            ))

        return recommendations
