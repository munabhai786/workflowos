from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.integration import ExternalEvent, OrchestrationEvent
from app.services.automation_service import process_trigger
from app.services.notification_service import create_notification
from app.services.realtime_service import schedule_global_event, schedule_user_event


class ExternalEventProcessor:
    def record_event(
        self,
        db: Session,
        provider: str,
        event_type: str,
        payload: dict,
        integration_id: int | None = None,
        external_event_id: str | None = None,
        source: str | None = None,
    ) -> ExternalEvent:
        dedupe_key = f"{provider}:{event_type}:{external_event_id or payload.get('id') or payload.get('delivery_id')}"
        existing = db.query(ExternalEvent).filter(ExternalEvent.dedupe_key == dedupe_key).first()
        if existing:
            return existing
        event = ExternalEvent(
            provider=provider,
            event_type=event_type,
            external_event_id=external_event_id,
            integration_id=integration_id,
            source=source,
            payload_json=json.dumps(payload),
            dedupe_key=dedupe_key,
            status="queued",
        )
        db.add(event)
        db.flush()
        return event

    def process(self, db: Session, event: ExternalEvent):
        payload = json.loads(event.payload_json or "{}")
        trigger = f"{event.provider}.{event.event_type}"
        result = {"triggered_automations": 0, "signals": []}

        matched_automations = process_trigger(
            db,
            trigger,
            {
                "provider": event.provider,
                "event_type": event.event_type,
                "payload": payload,
                "integration_id": event.integration_id,
                "external_event_id": event.external_event_id,
            },
        )
        result["triggered_automations"] = matched_automations

        action = self._recommended_action(event.provider, event.event_type, payload)
        orchestration = OrchestrationEvent(
            provider=event.provider,
            trigger=trigger,
            external_event_id=event.id,
            integration_id=event.integration_id,
            status="completed",
            action=action,
            result_json=json.dumps(result),
            processed_at=datetime.utcnow(),
        )
        db.add(orchestration)

        event.status = "processed"
        event.orchestration_result_json = json.dumps(result)
        event.processed_at = datetime.utcnow()
        db.flush()

        schedule_global_event(
            "integration.external_event.processed",
            {
                "provider": event.provider,
                "event_type": event.event_type,
                "external_event_id": event.external_event_id,
                "action": action,
            },
        )
        return orchestration

    def fail(self, db: Session, event: ExternalEvent, error: str):
        event.status = "failed"
        event.error = error
        event.processed_at = datetime.utcnow()
        db.flush()
        schedule_global_event(
            "integration.external_event.failed",
            {"provider": event.provider, "event_type": event.event_type, "error": error},
        )

    def _recommended_action(self, provider: str, event_type: str, payload: dict) -> str:
        if provider == "github" and event_type == "pull_request" and payload.get("action") == "closed":
            pr = payload.get("pull_request") or {}
            return "move_linked_task_to_review" if pr.get("merged") else "record_pr_closed"
        if provider == "github" and event_type == "issues" and payload.get("action") == "closed":
            return "complete_linked_task"
        if provider == "github" and event_type == "deployment_status":
            return "notify_manager_on_failed_deployment"
        if provider == "slack" and event_type == "approval":
            return "execute_approved_ai_action"
        if provider in {"google", "microsoft"} and "calendar" in event_type:
            return "invoke_scheduling_agent"
        if provider == "discord":
            return "escalate_team_alert"
        return "record_operational_signal"


external_event_processor = ExternalEventProcessor()
