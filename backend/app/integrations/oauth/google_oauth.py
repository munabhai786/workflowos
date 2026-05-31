import httpx

from app.core.config import settings
from app.integrations.oauth.base import OAuthProvider


class GoogleOAuth(OAuthProvider):
    provider = "google"
    authorize_url = "https://accounts.google.com/o/oauth2/v2/auth"
    token_url = "https://oauth2.googleapis.com/token"
    revoke_url = "https://oauth2.googleapis.com/revoke"
    supports_pkce = True
    scopes = [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
    ]

    def authorization_params(self, redirect_uri: str, state: str, code_verifier: str | None = None) -> dict:
        params = super().authorization_params(redirect_uri, state, code_verifier)
        params["access_type"] = "offline"
        params["prompt"] = "consent"
        params["include_granted_scopes"] = "true"
        if code_verifier:
            params["code_challenge"] = self.code_challenge(code_verifier)
            params["code_challenge_method"] = "S256"
        return params

    async def fetch_profile(self, token_data: dict) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            data = self._checked_json(
                await client.get("https://www.googleapis.com/oauth2/v3/userinfo", headers=self.bearer_headers(token_data))
            )
        return {
            "id": data.get("sub"),
            "sub": data.get("sub"),
            "name": data.get("name") or data.get("email"),
            "email": data.get("email"),
            "avatar_url": data.get("picture"),
        }

    async def initial_sync(self, token_data: dict) -> dict:
        headers = self.bearer_headers(token_data)
        async with httpx.AsyncClient(timeout=20) as client:
            calendars = self._checked_json(
                await client.get("https://www.googleapis.com/calendar/v3/users/me/calendarList", headers=headers, params={"maxResults": 50})
            )
            drive = self._checked_json(
                await client.get("https://www.googleapis.com/drive/v3/about", headers=headers, params={"fields": "user,storageQuota"})
            )
        return {
            "calendars": [
                {
                    "id": item.get("id"),
                    "summary": item.get("summary"),
                    "primary": item.get("primary", False),
                    "access_role": item.get("accessRole"),
                }
                for item in calendars.get("items", [])
            ],
            "calendar_sync_status": "ready",
            "drive_access_status": "ready" if drive.get("user") else "limited",
            "drive_user": drive.get("user", {}),
        }


google_oauth = GoogleOAuth(settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET)
