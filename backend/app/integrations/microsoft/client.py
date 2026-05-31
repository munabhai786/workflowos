from __future__ import annotations

import httpx


class MicrosoftClient:
    graph_base = "https://graph.microsoft.com/v1.0"

    async def create_outlook_event(self, token: str, event: dict):
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                f"{self.graph_base}/me/events",
                headers={"Authorization": f"Bearer {token}"},
                json=event,
            )
            response.raise_for_status()
            return response.json()

    def teams_ready_event_payload(self, subject: str, start: str, end: str, attendees: list[str] | None = None):
        return {
            "subject": subject,
            "start": {"dateTime": start, "timeZone": "UTC"},
            "end": {"dateTime": end, "timeZone": "UTC"},
            "attendees": [
                {"emailAddress": {"address": email}, "type": "required"}
                for email in attendees or []
            ],
            "isOnlineMeeting": True,
            "onlineMeetingProvider": "teamsForBusiness",
        }


microsoft_client = MicrosoftClient()
