from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.base_agent import BaseAgent


class ExecutiveIntelligenceAgent(BaseAgent):
    key = "executive_intelligence"
    name = "AI Executive Intelligence Agent"
    description = "Generates executive summaries, forecasts outcomes, and explains operational performance."

    def analyze(self, db: Session, context: dict) -> list:
        analytics = context["analytics"]
        kpis = analytics.get("kpis", {})
        forecasts = analytics.get("forecasts", {}).get("organization", {})
        executive = analytics.get("executive", {})
        recommendations = []

        health = kpis.get("organization_health", 0)
        confidence = forecasts.get("delivery_confidence", kpis.get("delivery_confidence", 0))
        overdue = kpis.get("overdue_tasks", 0)

        recommendations.append(self.recommendation(
            category="executive_summary",
            title="Executive operating summary",
            message=(
                f"Organization health is {health}%, delivery confidence is {confidence}%, "
                f"and {overdue} task(s) are overdue."
            ),
            reasoning="Summary is generated from enterprise analytics, workload intelligence, sprint predictability, and delivery forecasts.",
            recommendation_type="summary",
            severity="high" if health < 55 or overdue >= 5 else "medium" if health < 75 else "low",
            confidence=0.86,
        ))

        risk_items = executive.get("risks", []) if isinstance(executive, dict) else []
        for item in risk_items[:4]:
            recommendations.append(self.recommendation(
                category="organizational_risk",
                title=item.get("title", "Organizational risk detected"),
                message=item.get("message", "Operational risk requires leadership review."),
                reasoning="Risk surfaced by executive analytics and cross-agent operational signals.",
                recommendation_type="insight",
                severity=item.get("severity", "medium"),
                confidence=0.82,
            ))

        if confidence < 70:
            recommendations.append(self.recommendation(
                category="forecast",
                title="Delivery outcome forecast below target",
                message="Delivery confidence is below 70%. Leadership intervention is recommended.",
                reasoning=f"Forecast delivery confidence is {confidence}%.",
                recommendation_type="action",
                action_type="generate_recovery_plan",
                action_payload={
                    "focus": ["overdue_tasks", "blocked_work", "sprint_scope", "workload_rebalance"],
                    "target_delivery_confidence": 80,
                },
                severity="high",
                confidence=0.84,
            ))

        return recommendations
