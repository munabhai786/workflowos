import httpx

from app.core.config import settings
from app.integrations.oauth.base import OAuthProvider


class GitHubOAuth(OAuthProvider):
    provider = "github"
    authorize_url = "https://github.com/login/oauth/authorize"
    token_url = "https://github.com/login/oauth/access_token"
    revoke_url = "https://api.github.com/applications/{client_id}/token"
    scopes = ["repo", "read:org", "workflow", "user:email"]

    async def fetch_profile(self, token_data: dict) -> dict:
        headers = {**self.bearer_headers(token_data), "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient(timeout=15) as client:
            user = self._checked_json(await client.get("https://api.github.com/user", headers=headers))
            emails = self._checked_json(await client.get("https://api.github.com/user/emails", headers=headers))
        primary_email = next((item.get("email") for item in emails if item.get("primary")), None) if isinstance(emails, list) else None
        return {
            "id": str(user.get("id")),
            "login": user.get("login"),
            "name": user.get("name") or user.get("login"),
            "email": primary_email or user.get("email"),
            "avatar_url": user.get("avatar_url"),
            "html_url": user.get("html_url"),
        }

    async def initial_sync(self, token_data: dict) -> dict:
        headers = {**self.bearer_headers(token_data), "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient(timeout=20) as client:
            repos = self._checked_json(
                await client.get("https://api.github.com/user/repos", headers=headers, params={"per_page": 100, "sort": "updated"})
            )
            orgs = self._checked_json(await client.get("https://api.github.com/user/orgs", headers=headers, params={"per_page": 100}))
        return {
            "repositories": [
                {
                    "id": str(repo.get("id")),
                    "name": repo.get("name"),
                    "full_name": repo.get("full_name"),
                    "private": repo.get("private"),
                    "default_branch": repo.get("default_branch"),
                    "html_url": repo.get("html_url"),
                }
                for repo in repos
            ] if isinstance(repos, list) else [],
            "organizations": [
                {
                    "id": str(org.get("id")),
                    "login": org.get("login"),
                    "avatar_url": org.get("avatar_url"),
                }
                for org in orgs
            ] if isinstance(orgs, list) else [],
        }

    async def revoke_token(self, token: str):
        if not self.client_id or not self.client_secret:
            return
        async with httpx.AsyncClient(timeout=10) as client:
            await client.delete(
                self.revoke_url.format(client_id=self.client_id),
                auth=(self.client_id, self.client_secret),
                json={"access_token": token},
                headers={"Accept": "application/vnd.github+json"},
            )


github_oauth = GitHubOAuth(settings.GITHUB_CLIENT_ID, settings.GITHUB_CLIENT_SECRET)
