from __future__ import annotations

import httpx


class GitHubClient:
    api_base = "https://api.github.com"

    async def request(self, token: str, method: str, path: str, **kwargs):
        headers = kwargs.pop("headers", {})
        headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
        )
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.request(method, f"{self.api_base}{path}", headers=headers, **kwargs)
            response.raise_for_status()
            return response.json() if response.content else {}

    async def repositories(self, token: str):
        return await self.request(token, "GET", "/user/repos", params={"per_page": 100, "sort": "updated"})

    async def issues(self, token: str, owner: str, repo: str):
        return await self.request(token, "GET", f"/repos/{owner}/{repo}/issues", params={"state": "all"})

    async def pulls(self, token: str, owner: str, repo: str):
        return await self.request(token, "GET", f"/repos/{owner}/{repo}/pulls", params={"state": "all"})

    async def deployments(self, token: str, owner: str, repo: str):
        return await self.request(token, "GET", f"/repos/{owner}/{repo}/deployments")

    async def releases(self, token: str, owner: str, repo: str):
        return await self.request(token, "GET", f"/repos/{owner}/{repo}/releases")


github_client = GitHubClient()
