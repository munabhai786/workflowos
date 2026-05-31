from __future__ import annotations

import base64
import hashlib
import json
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException


class OAuthProvider:
    provider = ""
    authorize_url = ""
    token_url = ""
    revoke_url = ""
    scopes: list[str] = []
    supports_pkce = False

    def __init__(self, client_id: str | None, client_secret: str | None):
        self.client_id = client_id
        self.client_secret = client_secret

    def ensure_configured(self):
        if not self.client_id or not self.client_secret:
            raise HTTPException(
                status_code=503,
                detail=f"{self.provider.title()} OAuth is not configured.",
            )

    def authorization_params(self, redirect_uri: str, state: str, code_verifier: str | None = None) -> dict:
        return {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(self.scopes),
            "state": state,
        }

    def authorization_url(self, redirect_uri: str, state: str, code_verifier: str | None = None) -> str:
        return f"{self.authorize_url}?{urlencode(self.authorization_params(redirect_uri, state, code_verifier))}"

    def code_challenge(self, code_verifier: str) -> str:
        digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
        return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

    async def exchange_code(self, code: str, redirect_uri: str, code_verifier: str | None = None) -> dict:
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        if self.supports_pkce and code_verifier:
            payload["code_verifier"] = code_verifier
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                self.token_url,
                data=payload,
                headers={"Accept": "application/json"},
            )
        return self._checked_json(response)

    async def refresh_token(self, refresh_token: str) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                self.token_url,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
                headers={"Accept": "application/json"},
            )
        return self._checked_json(response)

    async def revoke_token(self, token: str):
        if not self.revoke_url:
            return
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                self.revoke_url,
                data={"token": token, "client_id": self.client_id, "client_secret": self.client_secret},
                headers={"Accept": "application/json"},
            )

    async def fetch_profile(self, token_data: dict) -> dict:
        return {}

    async def initial_sync(self, token_data: dict) -> dict:
        return {}

    def normalize_scopes(self, token_data: dict) -> list[str]:
        scope = token_data.get("scope") or token_data.get("scopes") or self.scopes
        if isinstance(scope, str):
            return [item for item in scope.replace(",", " ").split(" ") if item]
        return scope or []

    def account_name(self, profile: dict) -> str:
        return profile.get("name") or profile.get("login") or profile.get("email") or self.provider.title()

    def external_account_id(self, profile: dict) -> str | None:
        value = profile.get("id") or profile.get("sub") or profile.get("team_id")
        return str(value) if value is not None else None

    def workspace_id(self, profile: dict) -> str | None:
        value = profile.get("workspace_id") or profile.get("team_id") or profile.get("tenant_id")
        return str(value) if value is not None else None

    def sync_record_count(self, metadata: dict) -> int:
        total = 0
        for value in metadata.values():
            if isinstance(value, list):
                total += len(value)
        return total

    def bearer_headers(self, token_data: dict) -> dict:
        return {"Authorization": f"Bearer {token_data.get('access_token')}"}

    def _checked_json(self, response: httpx.Response) -> dict:
        try:
            data = response.json()
        except json.JSONDecodeError:
            data = {}
        error = data.get("error") if isinstance(data, dict) else None
        if response.status_code >= 400 or error:
            detail = None
            if isinstance(data, dict):
                detail = data.get("error_description") or data.get("error")
            detail = detail or response.text or "OAuth request failed"
            raise HTTPException(status_code=400, detail=detail)
        return data
