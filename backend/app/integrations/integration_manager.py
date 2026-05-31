from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.integration import Integration, SyncHistory
from app.services.realtime_service import schedule_global_event, schedule_user_event


PROVIDER_CAPABILITIES = {
    "github": ["repositories", "issues", "pull_requests", "commits", "deployments", "branches", "releases"],
    "slack": ["notifications", "approvals", "summaries", "alerts", "recommendations"],
    "discord": ["notifications", "summaries", "alerts"],
    "google": ["calendar", "drive", "meet", "documents"],
    "microsoft": ["outlook_calendar", "teams_ready", "oauth"],
    "webhook": ["inbound", "outbound", "orchestration"],
}

OAUTH_PROVIDERS = {"github", "slack", "discord", "google", "microsoft"}


class IntegrationManager:
    def supported_providers(self):
        oauth_credentials = {
            "github": (settings.GITHUB_CLIENT_ID, settings.GITHUB_CLIENT_SECRET),
            "slack": (settings.SLACK_CLIENT_ID, settings.SLACK_CLIENT_SECRET),
            "discord": (settings.DISCORD_CLIENT_ID, settings.DISCORD_CLIENT_SECRET),
            "google": (settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET),
            "microsoft": (settings.MICROSOFT_CLIENT_ID, settings.MICROSOFT_CLIENT_SECRET),
        }
        providers = []
        for provider, capabilities in PROVIDER_CAPABILITIES.items():
            client_id, client_secret = oauth_credentials.get(provider, (None, None))
            providers.append(
                {
                    "provider": provider,
                    "capabilities": capabilities,
                    "oauth_required": provider in oauth_credentials,
                    "oauth_configured": bool(client_id and client_secret) if provider in oauth_credentials else True,
                    "missing_config": [
                        name
                        for name, value in [
                            (f"{provider.upper()}_CLIENT_ID", client_id),
                            (f"{provider.upper()}_CLIENT_SECRET", client_secret),
                        ]
                        if provider in oauth_credentials and not value
                    ],
                }
            )
        return providers

    def list_integrations(self, db: Session):
        return db.query(Integration).order_by(Integration.created_at.desc()).all()

    def create_or_update(
        self,
        db: Session,
        provider: str,
        name: str,
        user_id: int | None,
        settings: dict | None = None,
        scopes: list[str] | None = None,
    ) -> Integration:
        if provider in OAUTH_PROVIDERS:
            raise ValueError("OAuth providers must be connected through the OAuth authorization flow.")
        integration = (
            db.query(Integration)
            .filter(Integration.provider == provider)
            .filter(Integration.name == name)
            .first()
        )
        if not integration:
            integration = Integration(provider=provider, name=name, created_by=user_id)
            db.add(integration)

        integration.status = "connected"
        integration.enabled = True
        integration.connected_at = integration.connected_at or datetime.utcnow()
        integration.capabilities_json = json.dumps(PROVIDER_CAPABILITIES.get(provider, []))
        integration.settings_json = json.dumps(settings or {})
        integration.scopes_json = json.dumps(scopes or [])
        integration.last_error = None
        db.flush()
        return integration

    def create_connected_oauth_integration(
        self,
        db: Session,
        provider: str,
        name: str,
        user_id: int,
        external_account_id: str | None,
        workspace_id: str | None,
        scopes: list[str] | None,
        metadata: dict | None = None,
    ) -> Integration:
        integration = (
            db.query(Integration)
            .filter(Integration.provider == provider)
            .filter(Integration.created_by == user_id)
            .filter(Integration.external_account_id == external_account_id)
            .first()
        )
        if not integration:
            integration = Integration(
                provider=provider,
                name=name,
                created_by=user_id,
                external_account_id=external_account_id,
            )
            db.add(integration)

        integration.name = name
        integration.status = "connected"
        integration.enabled = True
        integration.workspace_id = workspace_id
        integration.scopes_json = json.dumps(scopes or [])
        integration.capabilities_json = json.dumps(PROVIDER_CAPABILITIES.get(provider, []))
        integration.metadata_json = json.dumps(metadata or {})
        integration.settings_json = integration.settings_json or json.dumps({})
        integration.connected_at = integration.connected_at or datetime.utcnow()
        integration.updated_at = datetime.utcnow()
        integration.last_error = None
        db.flush()
        return integration

    def disconnect(self, db: Session, integration: Integration):
        integration.status = "disconnected"
        integration.enabled = False
        integration.last_error = None
        integration.updated_at = datetime.utcnow()
        db.flush()

    def record_sync(
        self,
        db: Session,
        integration: Integration,
        sync_type: str,
        status: str = "completed",
        records_read: int = 0,
        records_written: int = 0,
        metadata: dict | None = None,
        error: str | None = None,
    ) -> SyncHistory:
        sync = SyncHistory(
            integration_id=integration.id,
            provider=integration.provider,
            sync_type=sync_type,
            status=status,
            records_read=records_read,
            records_written=records_written,
            finished_at=datetime.utcnow(),
            metadata_json=json.dumps(metadata or {}),
            error=error,
        )
        integration.last_sync_at = datetime.utcnow()
        integration.last_error = error
        db.add(sync)
        db.flush()
        schedule_global_event(
            "integration.sync.completed",
            {"integration_id": integration.id, "provider": integration.provider, "status": status},
        )
        schedule_global_event(
            "sync.completed",
            {"integration_id": integration.id, "provider": integration.provider, "status": status},
        )
        if integration.created_by:
            schedule_user_event(
                integration.created_by,
                "integration.sync.completed",
                {"integration_id": integration.id, "provider": integration.provider, "status": status},
            )
            schedule_user_event(
                integration.created_by,
                "sync.completed",
                {"integration_id": integration.id, "provider": integration.provider, "status": status},
            )
        return sync


integration_manager = IntegrationManager()
