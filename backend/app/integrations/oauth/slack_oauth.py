import httpx

from app.core.config import settings
from app.integrations.oauth.base import OAuthProvider


class SlackOAuth(OAuthProvider):
    provider = "slack"
    authorize_url = "https://slack.com/oauth/v2/authorize"
    token_url = "https://slack.com/api/oauth.v2.access"
    scopes = ["chat:write", "channels:read", "groups:read", "users:read", "team:read"]

    async def exchange_code(self, code: str, redirect_uri: str, code_verifier: str | None = None) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                self.token_url,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
            )
        data = self._checked_json(response)
        if not data.get("ok", True):
            from fastapi import HTTPException

            raise HTTPException(status_code=400, detail=data.get("error") or "Slack OAuth failed")
        data["access_token"] = data.get("access_token") or data.get("authed_user", {}).get("access_token")
        data["scope"] = data.get("scope") or data.get("authed_user", {}).get("scope")
        return data

    async def fetch_profile(self, token_data: dict) -> dict:
        token = token_data.get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=15) as client:
            auth = self._checked_json(await client.get("https://slack.com/api/auth.test", headers=headers))
            team = self._checked_json(await client.get("https://slack.com/api/team.info", headers=headers))
        team_info = team.get("team") or {}
        return {
            "id": auth.get("user_id") or auth.get("team_id"),
            "team_id": auth.get("team_id"),
            "workspace_id": auth.get("team_id"),
            "name": team_info.get("name") or auth.get("team"),
            "email": auth.get("user"),
            "avatar_url": team_info.get("icon", {}).get("image_132"),
            "team_url": auth.get("url"),
        }

    async def initial_sync(self, token_data: dict) -> dict:
        headers = {"Authorization": f"Bearer {token_data.get('access_token')}"}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                "https://slack.com/api/conversations.list",
                headers=headers,
                params={"limit": 100, "exclude_archived": "true", "types": "public_channel,private_channel"},
            )
        data = self._checked_json(response)
        channels = data.get("channels") if data.get("ok", True) else []
        return {
            "channels": [
                {
                    "id": channel.get("id"),
                    "name": channel.get("name"),
                    "is_private": channel.get("is_private"),
                    "is_member": channel.get("is_member"),
                }
                for channel in channels or []
            ],
            "notification_configuration": {"enabled": True, "approval_actions": True},
        }

    async def revoke_token(self, token: str):
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post("https://slack.com/api/auth.revoke", data={"token": token})


slack_oauth = SlackOAuth(settings.SLACK_CLIENT_ID, settings.SLACK_CLIENT_SECRET)
