from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session

from app.agents.base_agent import AgentRecommendation


class MultiAgentCoordinator:
    def coordinate(self, db: Session, context: dict, recommendations: list[AgentRecommendation]) -> list[AgentRecommendation]:
        by_category = defaultdict(list)
        for recommendation in recommendations:
            by_category[recommendation.category].append(recommendation)

        coordinated = []
        seen = set()
        for recommendation in recommendations:
            key = (
                recommendation.agent_key,
                recommendation.category,
                recommendation.project_id,
                recommendation.task_id,
                recommendation.user_id,
                recommendation.action_type,
                recommendation.title,
            )
            if key in seen:
                continue
            seen.add(key)
            coordinated.append(recommendation)

        delivery = by_category.get("delivery_risk", [])
        schedule = by_category.get("deadline_conflict", []) + by_category.get("schedule_overload", [])
        if delivery and schedule:
            project_id = delivery[0].project_id or schedule[0].project_id
            coordinated.append(AgentRecommendation(
                agent_key="multi_agent_coordinator",
                category="coordinated_recovery",
                title="Coordinated recovery plan recommended",
                message="Scheduling and project management agents agree that delivery recovery is needed.",
                reasoning=(
                    f"{len(delivery)} delivery risk signal(s) and {len(schedule)} scheduling signal(s) "
                    "were detected in the same operating context."
                ),
                recommendation_type="action",
                action_type="generate_recovery_plan",
                action_payload={
                    "project_id": project_id,
                    "inputs": ["project_manager", "scheduling"],
                    "steps": ["clear blockers", "rebalance due dates", "reduce sprint scope", "notify owners"],
                },
                severity="high",
                confidence=0.88,
                project_id=project_id,
            ))

        if by_category.get("blocked_work") and by_category.get("stalled_collaboration"):
            coordinated.append(AgentRecommendation(
                agent_key="multi_agent_coordinator",
                category="collaboration_escalation",
                title="Blocked collaboration escalation recommended",
                message="Blocked work and stalled discussion signals are converging.",
                reasoning="Workflow and collaboration agents both identified coordination drag.",
                recommendation_type="action",
                action_type="escalate_blocked_items",
                action_payload={"strategy": "notify assignees, project owners, and reviewers for blocked collaboration"},
                severity="high",
                confidence=0.84,
            ))

        return coordinated


multi_agent_coordinator = MultiAgentCoordinator()
