import httpx

from app.core.config import settings
from app.integrations.oauth.base import OAuthProvider


class DiscordOAuth(OAuthProvider):
    provider = "discord"
    authorize_url = "https://discord.com/oauth2/authorize"
    token_url = "https://discord.com/api/oauth2/token"
    revoke_url = "https://discord.com/api/oauth2/token/revoke"
    supports_pkce = True
    scopes = ["identify", "email", "guilds"]

    def authorization_params(self, redirect_uri: str, state: str, code_verifier: str | None = None) -> dict:
        params = super().authorization_params(redirect_uri, state, code_verifier)
        if code_verifier:
            params["code_challenge"] = self.code_challenge(code_verifier)
            params["code_challenge_method"] = "S256"
        return params

    async def fetch_profile(self, token_data: dict) -> dict:
        headers = self.bearer_headers(token_data)
        async with httpx.AsyncClient(timeout=15) as client:
            user = self._checked_json(await client.get("https://discord.com/api/users/@me", headers=headers))
        avatar_hash = user.get("avatar")
        avatar_url = (
            f"https://cdn.discordapp.com/avatars/{user.get('id')}/{avatar_hash}.png"
            if avatar_hash
            else None
        )
        return {
            "id": user.get("id"),
            "name": user.get("global_name") or user.get("username"),
            "email": user.get("email"),
            "avatar_url": avatar_url,
            "username": user.get("username"),
        }

    async def initial_sync(self, token_data: dict) -> dict:
        headers = self.bearer_headers(token_data)
        async with httpx.AsyncClient(timeout=20) as client:
            guilds = self._checked_json(await client.get("https://discord.com/api/users/@me/guilds", headers=headers))
        return {
            "guilds": [
                {
                    "id": guild.get("id"),
                    "name": guild.get("name"),
                    "owner": guild.get("owner"),
                    "permissions": guild.get("permissions"),
                }
                for guild in guilds
            ] if isinstance(guilds, list) else [],
        }


discord_oauth = DiscordOAuth(settings.DISCORD_CLIENT_ID, settings.DISCORD_CLIENT_SECRET)
