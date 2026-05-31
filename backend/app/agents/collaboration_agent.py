from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.agents.base_agent import BaseAgent


class CollaborationAgent(BaseAgent):
    key = "collaboration"
    name = "AI Collaboration Agent"
    description = "Summarizes discussions, detects unanswered comments, and monitors collaboration health."

    def analyze(self, db: Session, context: dict) -> list:
        now = datetime.utcnow()
        recommendations = []
        comments = context["comments"]
        tasks = {task["id"]: task for task in context["tasks"]}
        comment_counts = Counter(comment["task_id"] for comment in comments)

        for task_id, count in comment_counts.items():
            task = tasks.get(task_id)
            if not task or task["status"] == "completed":
                continue

            latest = max(
                [comment["created_at"] for comment in comments if comment["task_id"] == task_id and comment["created_at"]],
                default=None,
            )
            if count >= 4 and latest and latest < now - timedelta(days=2):
                recommendations.append(self.recommendation(
                    category="stalled_collaboration",
                    title="Stalled discussion needs owner response",
                    message=f"{task['title']} has an active discussion but no recent resolution.",
                    reasoning=f"{count} comment(s) exist and the latest visible activity is older than 48 hours.",
                    recommendation_type="action",
                    action_type="create_collaboration_reminder",
                    action_payload={
                        "task_id": task_id,
                        "assignee_id": task["assigned_to"],
                        "message": "Please resolve or summarize the open discussion.",
                    },
                    severity="medium",
                    confidence=0.77,
                    project_id=task["project_id"],
                    task_id=task_id,
                    user_id=task["assigned_to"],
                ))

        review_tasks = [
            task for task in context["tasks"]
            if task["status"] == "review" and task["assigned_to"]
        ]
        if len(review_tasks) >= 3:
            recommendations.append(self.recommendation(
                category="reviewers",
                title="Reviewer assignment recommended",
                message=f"{len(review_tasks)} task(s) need review attention. Assign reviewers before the queue grows.",
                reasoning="Review-stage task volume indicates collaboration throughput risk.",
                recommendation_type="action",
                action_type="suggest_reviewers",
                action_payload={"task_ids": [task["id"] for task in review_tasks[:8]]},
                severity="medium",
                confidence=0.74,
            ))

        recent_comments = [
            comment for comment in comments
            if comment["created_at"] and comment["created_at"] >= now - timedelta(days=1)
        ]
        if recent_comments:
            sample = "; ".join(comment["body"].strip().replace("\n", " ")[:90] for comment in recent_comments[:5])
            recommendations.append(self.recommendation(
                category="discussion_summary",
                title="Today’s collaboration summary generated",
                message=f"{len(recent_comments)} comment(s) added in the last 24 hours.",
                reasoning=sample or "Recent collaboration activity is available for summary.",
                recommendation_type="summary",
                action_type=None,
                severity="low",
                confidence=0.7,
            ))

        return recommendations
