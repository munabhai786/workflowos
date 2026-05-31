import httpx

from app.core.config import settings
from app.integrations.oauth.base import OAuthProvider


class MicrosoftOAuth(OAuthProvider):
    provider = "microsoft"
    authorize_url = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    supports_pkce = True
    scopes = ["offline_access", "User.Read", "Calendars.ReadWrite"]

    def authorization_params(self, redirect_uri: str, state: str, code_verifier: str | None = None) -> dict:
        params = super().authorization_params(redirect_uri, state, code_verifier)
        if code_verifier:
            params["code_challenge"] = self.code_challenge(code_verifier)
            params["code_challenge_method"] = "S256"
        return params

    async def fetch_profile(self, token_data: dict) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            user = self._checked_json(
                await client.get("https://graph.microsoft.com/v1.0/me", headers=self.bearer_headers(token_data))
            )
        return {
            "id": user.get("id"),
            "name": user.get("displayName") or user.get("userPrincipalName"),
            "email": user.get("mail") or user.get("userPrincipalName"),
            "tenant_id": user.get("tenantId"),
            "user_principal_name": user.get("userPrincipalName"),
        }

    async def initial_sync(self, token_data: dict) -> dict:
        headers = self.bearer_headers(token_data)
        async with httpx.AsyncClient(timeout=20) as client:
            calendars = self._checked_json(
                await client.get("https://graph.microsoft.com/v1.0/me/calendars", headers=headers, params={"$top": 50})
            )
        return {
            "calendars": [
                {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "can_edit": item.get("canEdit"),
                    "owner": item.get("owner", {}),
                }
                for item in calendars.get("value", [])
            ],
            "calendar_sync_status": "ready",
            "teams_ready": True,
        }


microsoft_oauth = MicrosoftOAuth(settings.MICROSOFT_CLIENT_ID, settings.MICROSOFT_CLIENT_SECRET)
