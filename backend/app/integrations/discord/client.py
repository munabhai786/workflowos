from __future__ import annotations

import httpx


class DiscordClient:
    async def send_webhook(self, webhook_url: str, content: str, embeds: list | None = None):
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(webhook_url, json={"content": content, "embeds": embeds or []})
            response.raise_for_status()
            return {"status_code": response.status_code}


discord_client = DiscordClient()
