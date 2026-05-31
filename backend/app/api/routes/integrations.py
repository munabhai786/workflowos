from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.deps import get_current_user
from app.integrations.api_token_service import ALLOWED_SCOPES, api_token_service
from app.integrations.external_event_processor import external_event_processor
from app.integrations.integration_manager import integration_manager
from app.integrations.oauth_service import oauth_service
from app.integrations.security import decrypt_secret, encrypt_secret, new_secret
from app.integrations.webhook_engine import webhook_engine
from app.models.integration import APIToken, ExternalEvent, Integration, OAuthAccount, SyncHistory, WebhookEndpoint, WebhookLog
from app.models.user import User
from app.services.activity_service import create_activity
from app.services.realtime_service import schedule_global_event


def require_integrations_enabled():
    if not settings.integrations_enabled:
        raise HTTPException(
            status_code=404,
            detail="Integrations are temporarily unavailable.",
        )


router = APIRouter(dependencies=[Depends(require_integrations_enabled)])
MANAGEMENT_ROLES = {"Admin", "Manager"}


class IntegrationConnectPayload(BaseModel):
    provider: str
    name: str
    scopes: list[str] = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)


class OAuthUrlPayload(BaseModel):
    provider: str
    client_id: str
    redirect_uri: str
    scopes: list[str] | None = None


class OAuthLinkPayload(BaseModel):
    provider: str
    integration_id: int | None = None
    access_token: str
    refresh_token: str | None = None
    scopes: list[str] = Field(default_factory=list)
    external_account_id: str | None = None
    external_account_email: str | None = None
    expires_in: int | None = None
    metadata: dict = Field(default_factory=dict)


class TokenPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    scopes: list[str]
    expires_at: datetime | None = None
    integration_id: int | None = None


class WebhookEndpointPayload(BaseModel):
    name: str
    direction: str = "inbound"
    target_url: str | None = None
    provider: str | None = "webhook"
    events: list[str] = Field(default_factory=list)
    headers: dict = Field(default_factory=dict)
    secret: str | None = None
    retry_count: int = 3
    integration_id: int | None = None


class ExternalEventPayload(BaseModel):
    provider: str
    event_type: str
    payload: dict
    integration_id: int | None = None
    external_event_id: str | None = None


class OAuthStartPayload(BaseModel):
    frontend_return_url: str | None = None


def require_manager(role: str | None):
    if role not in MANAGEMENT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")


def json_loads(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def serialize_integration(integration: Integration):
    metadata = json_loads(integration.metadata_json, {})
    return {
        "id": integration.id,
        "provider": integration.provider,
        "name": integration.name,
        "status": integration.status,
        "enabled": bool(integration.enabled),
        "workspace_id": integration.workspace_id,
        "external_account_id": integration.external_account_id,
        "scopes": json_loads(integration.scopes_json, []),
        "capabilities": json_loads(integration.capabilities_json, []),
        "settings": json_loads(integration.settings_json, {}),
        "metadata": metadata,
        "account_name": metadata.get("name") or metadata.get("login") or integration.name,
        "avatar_url": metadata.get("avatar_url"),
        "profile_url": metadata.get("html_url") or metadata.get("team_url"),
        "sync": metadata.get("sync", {}),
        "created_by": integration.created_by,
        "connected_at": integration.connected_at,
        "last_sync_at": integration.last_sync_at,
        "last_error": integration.last_error,
        "created_at": integration.created_at,
        "updated_at": integration.updated_at,
    }


def serialize_oauth(account: OAuthAccount):
    metadata = json_loads(account.metadata_json, {})
    return {
        "id": account.id,
        "provider": account.provider,
        "integration_id": account.integration_id,
        "user_id": account.user_id,
        "external_account_id": account.external_account_id,
        "external_account_email": account.external_account_email,
        "scopes": json_loads(account.scopes_json, []),
        "expires_at": account.expires_at,
        "refresh_token_expires_at": account.refresh_token_expires_at,
        "last_refreshed_at": account.last_refreshed_at,
        "refresh_error": account.refresh_error,
        "revoked_at": account.revoked_at,
        "status": account.status,
        "metadata": metadata,
        "account_name": metadata.get("name") or metadata.get("login") or account.external_account_email,
        "avatar_url": metadata.get("avatar_url"),
        "created_at": account.created_at,
    }


def serialize_token(token: APIToken):
    return {
        "id": token.id,
        "name": token.name,
        "token_prefix": token.token_prefix,
        "scopes": json_loads(token.scopes_json, []),
        "owner_id": token.owner_id,
        "integration_id": token.integration_id,
        "last_used_at": token.last_used_at,
        "expires_at": token.expires_at,
        "revoked_at": token.revoked_at,
        "created_at": token.created_at,
    }


def serialize_webhook_endpoint(endpoint: WebhookEndpoint):
    return {
        "id": endpoint.id,
        "integration_id": endpoint.integration_id,
        "name": endpoint.name,
        "direction": endpoint.direction,
        "target_url": endpoint.target_url,
        "provider": endpoint.provider,
        "events": json_loads(endpoint.events_json, []),
        "headers": json_loads(endpoint.headers_json, {}),
        "enabled": bool(endpoint.enabled),
        "retry_count": endpoint.retry_count,
        "created_at": endpoint.created_at,
        "updated_at": endpoint.updated_at,
        "has_secret": bool(endpoint.secret_encrypted),
    }


def serialize_webhook_log(log: WebhookLog):
    return {
        "id": log.id,
        "integration_id": log.integration_id,
        "provider": log.provider,
        "event_type": log.event_type,
        "event_id": log.event_id,
        "direction": log.direction,
        "status": log.status,
        "signature_valid": bool(log.signature_valid),
        "attempt_count": log.attempt_count,
        "error": log.error,
        "received_at": log.received_at,
        "processed_at": log.processed_at,
    }


def process_external_event_background(event_id: int):
    db = SessionLocal()
    try:
        from app.models.integration import ExternalEvent

        event = db.query(ExternalEvent).filter(ExternalEvent.id == event_id).first()
        if not event or event.status == "processed":
            return
        try:
            external_event_processor.process(db, event)
            db.commit()
        except Exception as exc:
            external_event_processor.fail(db, event, str(exc))
            db.commit()
    finally:
        db.close()


def remove_legacy_fake_connection_state(db: Session, integrations: list[Integration]):
    oauth_providers = {"github", "slack", "discord", "google", "microsoft"}
    changed = False
    for integration in integrations:
        if integration.provider not in oauth_providers or integration.status != "connected":
            continue
        account = (
            db.query(OAuthAccount)
            .filter(OAuthAccount.integration_id == integration.id)
            .filter(OAuthAccount.status == "active")
            .first()
        )
        if account:
            continue
        integration.status = "authorization_required"
        integration.enabled = False
        integration.last_error = "OAuth authorization required."
        changed = True
    if changed:
        db.commit()


@router.get("/workspace")
def integrations_workspace(
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_manager(role)
    integrations = integration_manager.list_integrations(db)
    remove_legacy_fake_connection_state(db, integrations)
    tokens = db.query(APIToken).order_by(APIToken.created_at.desc()).limit(50).all()
    endpoints = db.query(WebhookEndpoint).order_by(WebhookEndpoint.created_at.desc()).limit(50).all()
    logs = db.query(WebhookLog).order_by(WebhookLog.received_at.desc()).limit(80).all()
    oauth_accounts = db.query(OAuthAccount).order_by(OAuthAccount.created_at.desc()).limit(50).all()

    connected = [item for item in integrations if item.status == "connected" and item.enabled]
    failures = [item for item in logs if item.status in {"failed", "rejected"}]
    return {
        "providers": integration_manager.supported_providers(),
        "integrations": [serialize_integration(item) for item in integrations],
        "oauth_accounts": [serialize_oauth(item) for item in oauth_accounts],
        "tokens": [serialize_token(item) for item in tokens],
        "webhook_endpoints": [serialize_webhook_endpoint(item) for item in endpoints],
        "webhook_logs": [serialize_webhook_log(item) for item in logs],
        "scopes": sorted(ALLOWED_SCOPES),
        "metrics": {
            "connected_apps": len(connected),
            "webhook_events": len(logs),
            "webhook_failures": len(failures),
            "active_tokens": len([token for token in tokens if not token.revoked_at]),
        },
    }


@router.post("/connect")
def connect_integration(
    payload: IntegrationConnectPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_manager(role)
    raise HTTPException(
        status_code=410,
        detail="Direct integration connection is disabled. Use the OAuth start endpoint.",
    )


@router.delete("/{integration_id}")
async def disconnect_integration(
    integration_id: int,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_manager(role)
    integration = db.query(Integration).filter(Integration.id == integration_id).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    accounts = db.query(OAuthAccount).filter(OAuthAccount.integration_id == integration.id).all()
    for account in accounts:
        try:
            await oauth_service.revoke_account(account)
        except Exception:
            pass
        account.access_token_encrypted = None
        account.refresh_token_encrypted = None
        account.status = "revoked"
        account.revoked_at = datetime.utcnow()
        account.updated_at = datetime.utcnow()
    integration_manager.disconnect(db, integration)
    integration.settings_json = json.dumps({})
    db.query(SyncHistory).filter(SyncHistory.integration_id == integration.id).filter(
        SyncHistory.status.in_(["queued", "running"])
    ).update({"status": "canceled", "finished_at": datetime.utcnow(), "error": "Integration disconnected."})
    db.commit()
    schedule_global_event("integration.disconnected", {"integration_id": integration.id})
    return {"message": "Integration disconnected"}


@router.post("/oauth/{provider}/start")
def start_oauth(
    provider: str,
    payload: OAuthStartPayload,
    request: Request,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_manager(role)
    provider = provider.lower()
    status = oauth_service.configuration_status(provider)
    if not status["configured"]:
        raise HTTPException(
            status_code=503,
            detail={
                "message": f"{provider.title()} OAuth is not configured.",
                "missing": status["missing"],
                "redirect_url": f"{request.base_url}api/v1/integrations/oauth/{provider}/callback",
            },
        )
    result = oauth_service.start_authorization(
        db=db,
        request=request,
        provider_name=provider,
        user_id=current_user.id,
        frontend_return_url=payload.frontend_return_url,
    )
    db.commit()
    return result


@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
    db: Session = Depends(get_db),
):
    provider = provider.lower()
    if error:
        schedule_global_event("integration.failed", {"provider": provider, "error": error_description or error})
        frontend_return_url = oauth_service.state_frontend_return_url(db, provider, state)
        return RedirectResponse(
            f"{frontend_return_url}?integration={provider}&oauth=failed"
        )
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code or state")
    try:
        integration, account, frontend_return_url = await oauth_service.complete_authorization(
            db=db,
            provider_name=provider,
            code=code,
            state_value=state,
        )
        create_activity(
            db=db,
            action_type="integration_connected",
            message=f"Connected {integration.name} through {provider.title()} OAuth.",
            user_id=account.user_id,
            entity_type="integration",
            entity_id=integration.id,
        )
        db.commit()
        return RedirectResponse(
            f"{frontend_return_url}?integration={provider}&oauth=success&integration_id={integration.id}"
        )
    except Exception as exc:
        db.rollback()
        schedule_global_event("integration.failed", {"provider": provider, "error": str(exc)})
        return RedirectResponse(
            f"{oauth_service.validate_frontend_return_url(None)}?integration={provider}&oauth=failed"
        )


@router.post("/oauth/url")
def oauth_url(payload: OAuthUrlPayload, role: str | None = Header(None), current_user: User = Depends(get_current_user)):
    require_manager(role)
    raise HTTPException(status_code=410, detail="Use provider OAuth start endpoints.")


@router.post("/oauth/link")
def link_oauth_account(
    payload: OAuthLinkPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_manager(role)
    raise HTTPException(status_code=410, detail="Manual OAuth token linking is disabled.")


@router.post("/tokens")
def create_api_token(
    payload: TokenPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_manager(role)
    created = api_token_service.create_token(
        db,
        name=payload.name,
        scopes=payload.scopes,
        owner_id=current_user.id,
        expires_at=payload.expires_at,
        integration_id=payload.integration_id,
    )
    db.commit()
    return {"token": created["token"], "record": serialize_token(created["record"])}


@router.delete("/tokens/{token_id}")
def revoke_api_token(
    token_id: int,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_manager(role)
    token = db.query(APIToken).filter(APIToken.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    api_token_service.revoke(db, token)
    db.commit()
    return {"message": "Token revoked"}


@router.post("/webhook-endpoints")
def create_webhook_endpoint(
    payload: WebhookEndpointPayload,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_manager(role)
    secret = payload.secret or new_secret("whsec")
    endpoint = WebhookEndpoint(
        integration_id=payload.integration_id,
        name=payload.name,
        direction=payload.direction,
        target_url=payload.target_url,
        provider=payload.provider,
        secret_encrypted=encrypt_secret(secret),
        events_json=json.dumps(payload.events),
        headers_json=json.dumps(payload.headers),
        retry_count=payload.retry_count,
        created_by=current_user.id,
    )
    db.add(endpoint)
    db.commit()
    db.refresh(endpoint)
    return {"endpoint": serialize_webhook_endpoint(endpoint), "secret": secret}


@router.post("/external-events")
def ingest_external_event(
    payload: ExternalEventPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    role: str | None = Header(None),
    current_user: User = Depends(get_current_user),
):
    require_manager(role)
    event = external_event_processor.record_event(
        db,
        provider=payload.provider,
        event_type=payload.event_type,
        payload=payload.payload,
        integration_id=payload.integration_id,
        external_event_id=payload.external_event_id,
        source="api",
    )
    db.commit()
    background_tasks.add_task(process_external_event_background, event.id)
    return {"event_id": event.id, "status": event.status}


@router.post("/webhooks/{provider}")
async def receive_provider_webhook(
    provider: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    raw_body = await request.body()
    headers = dict(request.headers)
    try:
        payload = json.loads(raw_body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = (
        headers.get("x-github-event")
        or headers.get("x-workflowos-event")
        or payload.get("type")
        or payload.get("event", {}).get("type")
        or "external_event"
    )
    external_event_id = (
        headers.get("x-github-delivery")
        or headers.get("x-workflowos-delivery")
        or payload.get("event_id")
        or payload.get("id")
    )
    integration = (
        db.query(Integration)
        .filter(Integration.provider == provider)
        .filter(Integration.enabled == True)
        .order_by(Integration.created_at.desc())
        .first()
    )
    secret = None
    endpoint = (
        db.query(WebhookEndpoint)
        .filter(WebhookEndpoint.provider == provider)
        .filter(WebhookEndpoint.direction == "inbound")
        .filter(WebhookEndpoint.enabled == True)
        .order_by(WebhookEndpoint.created_at.desc())
        .first()
    )
    if endpoint:
        secret = decrypt_secret(endpoint.secret_encrypted)

    log = webhook_engine.receive(
        db,
        provider=provider,
        event_type=event_type,
        payload=payload,
        headers=headers,
        raw_body=raw_body,
        integration=integration,
        secret=secret,
        external_event_id=external_event_id,
    )
    db.commit()
    if log.status == "queued":
        event = db.query(ExternalEvent).filter_by(
            dedupe_key=f"{provider}:{event_type}:{external_event_id or payload.get('id') or payload.get('delivery_id')}"
        ).first()
        if event:
            background_tasks.add_task(process_external_event_background, event.id)
    return {"received": True, "status": log.status, "log_id": log.id}
