import json
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.integration_manager import integration_manager
from app.integrations.security import decrypt_secret, encrypt_secret
from app.models.integration import Integration, OAuthAccount, OAuthState
from app.services.realtime_service import schedule_global_event, schedule_user_event


class OAuthService:
    def is_configured(self, provider_name: str) -> bool:
        provider = self.provider(provider_name)
        return bool(provider.client_id and provider.client_secret)

    def configuration_status(self, provider_name: str) -> dict:
        provider = self.provider(provider_name)
        return {
            "provider": provider_name,
            "configured": bool(provider.client_id and provider.client_secret),
            "missing": [
                name
                for name, value in [
                    (f"{provider_name.upper()}_CLIENT_ID", provider.client_id),
                    (f"{provider_name.upper()}_CLIENT_SECRET", provider.client_secret),
                ]
                if not value
            ],
        }

    def provider(self, provider: str):
        if provider == "github":
            from app.integrations.oauth.github_oauth import github_oauth

            return github_oauth
        if provider == "slack":
            from app.integrations.oauth.slack_oauth import slack_oauth

            return slack_oauth
        if provider == "google":
            from app.integrations.oauth.google_oauth import google_oauth

            return google_oauth
        if provider == "discord":
            from app.integrations.oauth.discord_oauth import discord_oauth

            return discord_oauth
        if provider == "microsoft":
            from app.integrations.oauth.microsoft_oauth import microsoft_oauth

            return microsoft_oauth
        raise HTTPException(status_code=404, detail="Unsupported OAuth provider")

    def callback_url(self, request: Request, provider: str) -> str:
        base_url = (settings.OAUTH_REDIRECT_BASE_URL or str(request.base_url).rstrip("/")).rstrip("/")
        return f"{base_url}/api/v1/integrations/oauth/{provider}/callback"

    def validate_frontend_return_url(self, frontend_return_url: str | None) -> str:
        safe_default = f"{settings.FRONTEND_URL.rstrip('/')}/integrations"
        if not frontend_return_url:
            return safe_default

        allowed = urlparse(settings.FRONTEND_URL)
        candidate = urlparse(frontend_return_url)
        if candidate.scheme != allowed.scheme or candidate.netloc != allowed.netloc:
            raise HTTPException(status_code=400, detail="Invalid OAuth return URL")
        return frontend_return_url

    def start_authorization(
        self,
        db: Session,
        request: Request,
        provider_name: str,
        user_id: int,
        frontend_return_url: str | None = None,
    ) -> dict:
        provider = self.provider(provider_name)
        provider.ensure_configured()
        redirect_uri = self.callback_url(request, provider_name)
        state_value = secrets.token_urlsafe(32)
        code_verifier = secrets.token_urlsafe(64) if provider.supports_pkce else None
        state = OAuthState(
            provider=provider_name,
            state=state_value,
            user_id=user_id,
            redirect_uri=redirect_uri,
            frontend_return_url=self.validate_frontend_return_url(frontend_return_url),
            scopes_json=json.dumps(provider.scopes),
            code_verifier_encrypted=encrypt_secret(code_verifier),
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )
        db.add(state)
        db.flush()
        return {
            "authorization_url": provider.authorization_url(
                redirect_uri=redirect_uri,
                state=state_value,
                code_verifier=code_verifier,
            ),
            "expires_at": state.expires_at,
        }

    def state_frontend_return_url(self, db: Session, provider_name: str, state_value: str | None) -> str:
        if not state_value:
            return self.validate_frontend_return_url(None)
        state = (
            db.query(OAuthState)
            .filter(OAuthState.provider == provider_name)
            .filter(OAuthState.state == state_value)
            .first()
        )
        if not state:
            return self.validate_frontend_return_url(None)
        return self.validate_frontend_return_url(state.frontend_return_url)

    async def complete_authorization(
        self,
        db: Session,
        provider_name: str,
        code: str,
        state_value: str,
    ) -> tuple[Integration, OAuthAccount, str]:
        state = (
            db.query(OAuthState)
            .filter(OAuthState.provider == provider_name)
            .filter(OAuthState.state == state_value)
            .first()
        )
        if not state or state.consumed_at:
            raise HTTPException(status_code=400, detail="Invalid OAuth state")
        if state.expires_at < datetime.utcnow():
            raise HTTPException(status_code=400, detail="OAuth state expired")

        provider = self.provider(provider_name)
        code_verifier = decrypt_secret(state.code_verifier_encrypted)
        token_data = await provider.exchange_code(
            code=code,
            redirect_uri=state.redirect_uri,
            code_verifier=code_verifier,
        )
        profile = await provider.fetch_profile(token_data)
        sync_metadata = await provider.initial_sync(token_data)

        scopes = provider.normalize_scopes(token_data)
        account_name = provider.account_name(profile)
        integration = integration_manager.create_connected_oauth_integration(
            db=db,
            provider=provider_name,
            name=account_name,
            user_id=state.user_id,
            external_account_id=provider.external_account_id(profile),
            workspace_id=provider.workspace_id(profile),
            scopes=scopes,
            metadata={
                **profile,
                "sync": sync_metadata,
                "oauth_provider": provider_name,
            },
        )
        account = self.upsert_account(
            db=db,
            provider=provider_name,
            user_id=state.user_id,
            integration=integration,
            token_data=token_data,
            scopes=scopes,
            profile=profile,
        )
        integration_manager.record_sync(
            db,
            integration=integration,
            sync_type="oauth_initial_sync",
            status="completed",
            records_read=provider.sync_record_count(sync_metadata),
            metadata=sync_metadata,
        )
        state.consumed_at = datetime.utcnow()
        db.flush()

        schedule_global_event(
            "integration.connected",
            {"integration_id": integration.id, "provider": provider_name},
        )
        schedule_user_event(
            state.user_id,
            "integration.connected",
            {"integration_id": integration.id, "provider": provider_name},
        )
        return integration, account, state.frontend_return_url

    def upsert_account(
        self,
        db: Session,
        provider: str,
        user_id: int,
        integration: Integration,
        token_data: dict,
        scopes: list[str],
        profile: dict,
    ) -> OAuthAccount:
        external_account_id = str(profile.get("id") or profile.get("sub") or profile.get("team_id") or "")
        account = (
            db.query(OAuthAccount)
            .filter(OAuthAccount.provider == provider)
            .filter(OAuthAccount.user_id == user_id)
            .filter(OAuthAccount.external_account_id == external_account_id)
            .first()
        )
        if not account:
            account = OAuthAccount(provider=provider, user_id=user_id, external_account_id=external_account_id)
            db.add(account)

        expires_in = token_data.get("expires_in")
        account.integration_id = integration.id
        account.external_account_email = profile.get("email")
        account.access_token_encrypted = encrypt_secret(token_data.get("access_token"))
        if token_data.get("refresh_token"):
            account.refresh_token_encrypted = encrypt_secret(token_data.get("refresh_token"))
        account.token_type = token_data.get("token_type") or "Bearer"
        account.scopes_json = json.dumps(scopes)
        account.expires_at = datetime.utcnow() + timedelta(seconds=expires_in) if expires_in else None
        refresh_expires_in = token_data.get("refresh_token_expires_in")
        account.refresh_token_expires_at = (
            datetime.utcnow() + timedelta(seconds=refresh_expires_in)
            if refresh_expires_in
            else account.refresh_token_expires_at
        )
        account.refresh_error = None
        account.revoked_at = None
        account.status = "active"
        account.metadata_json = json.dumps(profile)
        db.flush()
        return account

    async def refresh_account(self, db: Session, account: OAuthAccount) -> OAuthAccount:
        refresh_token = decrypt_secret(account.refresh_token_encrypted)
        if not refresh_token:
            self.mark_refresh_required(db, account)
            return account

        provider = self.provider(account.provider)
        try:
            token_data = await provider.refresh_token(refresh_token)
        except Exception as exc:
            account.refresh_error = str(exc)
            self.mark_refresh_required(db, account)
            return account
        account.access_token_encrypted = encrypt_secret(token_data.get("access_token"))
        if token_data.get("refresh_token"):
            account.refresh_token_encrypted = encrypt_secret(token_data.get("refresh_token"))
        account.expires_at = (
            datetime.utcnow() + timedelta(seconds=token_data.get("expires_in"))
            if token_data.get("expires_in")
            else account.expires_at
        )
        account.status = "active"
        account.refresh_error = None
        account.last_refreshed_at = datetime.utcnow()
        account.updated_at = datetime.utcnow()
        db.flush()
        return account

    async def revoke_account(self, account: OAuthAccount):
        provider = self.provider(account.provider)
        token = decrypt_secret(account.access_token_encrypted)
        if token:
            await provider.revoke_token(token)

    def token_bundle(self, account: OAuthAccount) -> dict:
        return {
            "access_token": decrypt_secret(account.access_token_encrypted),
            "refresh_token": decrypt_secret(account.refresh_token_encrypted),
            "token_type": account.token_type,
            "expires_at": account.expires_at,
            "scopes": json.loads(account.scopes_json or "[]"),
        }

    def mark_refresh_required(self, db: Session, account: OAuthAccount):
        account.status = "refresh_required"
        account.updated_at = datetime.utcnow()
        db.flush()


oauth_service = OAuthService()
