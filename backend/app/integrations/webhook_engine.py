from __future__ import annotations

import json
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.integrations.external_event_processor import external_event_processor
from app.integrations.security import decrypt_secret, verify_hmac_sha256
from app.models.integration import Integration, WebhookEndpoint, WebhookLog
from app.services.realtime_service import schedule_global_event


class WebhookEngine:
    def verify_provider_signature(
        self,
        provider: str,
        secret: str,
        raw_body: bytes,
        headers: dict,
    ) -> bool:
        normalized = {key.lower(): value for key, value in headers.items()}
        if provider == "github":
            return verify_hmac_sha256(secret, raw_body, normalized.get("x-hub-signature-256"), "sha256=")
        if provider == "slack":
            return verify_hmac_sha256(secret, raw_body, normalized.get("x-slack-signature"), "v0=")
        if provider in {"discord", "google", "microsoft", "webhook"}:
            return verify_hmac_sha256(secret, raw_body, normalized.get("x-workflowos-signature"), "sha256=")
        return False

    def receive(
        self,
        db: Session,
        provider: str,
        event_type: str,
        payload: dict,
        headers: dict,
        raw_body: bytes,
        integration: Integration | None = None,
        secret: str | None = None,
        external_event_id: str | None = None,
    ) -> WebhookLog:
        valid = True if not secret else self.verify_provider_signature(provider, secret, raw_body, headers)
        status = "queued" if valid else "rejected"
        log = WebhookLog(
            integration_id=integration.id if integration else None,
            provider=provider,
            event_type=event_type,
            event_id=external_event_id,
            direction="inbound",
            status=status,
            signature_valid=valid,
            request_headers_json=json.dumps(headers),
            payload_json=json.dumps(payload),
        )
        db.add(log)
        db.flush()
        if valid:
            event = external_event_processor.record_event(
                db,
                provider=provider,
                event_type=event_type,
                payload=payload,
                integration_id=integration.id if integration else None,
                external_event_id=external_event_id,
                source="webhook",
            )
            log.event_id = event.external_event_id
        schedule_global_event(
            "integration.webhook.received",
            {"provider": provider, "event_type": event_type, "status": status},
        )
        return log

    async def deliver_outbound(self, db: Session, endpoint: WebhookEndpoint, event_type: str, payload: dict):
        log = WebhookLog(
            integration_id=endpoint.integration_id,
            endpoint_id=endpoint.id,
            provider=endpoint.provider or "webhook",
            event_type=event_type,
            direction="outbound",
            status="queued",
            payload_json=json.dumps(payload),
        )
        db.add(log)
        db.flush()

        headers = json.loads(endpoint.headers_json or "{}")
        secret = decrypt_secret(endpoint.secret_encrypted)
        if secret:
            headers["X-WorkflowOS-Webhook"] = "signed"

        for attempt in range(1, (endpoint.retry_count or 3) + 1):
            log.attempt_count = attempt
            try:
                async with httpx.AsyncClient(timeout=8) as client:
                    response = await client.post(endpoint.target_url, json=payload, headers=headers)
                log.response_json = json.dumps({"status_code": response.status_code, "body": response.text[:1000]})
                if response.status_code < 400:
                    log.status = "delivered"
                    log.processed_at = datetime.utcnow()
                    db.flush()
                    return log
                log.error = f"HTTP {response.status_code}"
            except Exception as exc:
                log.error = str(exc)

        log.status = "failed"
        log.next_retry_at = datetime.utcnow() + timedelta(minutes=5)
        log.processed_at = datetime.utcnow()
        db.flush()
        return log


webhook_engine = WebhookEngine()
