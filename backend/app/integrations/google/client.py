from __future__ import annotations

import httpx


class GoogleClient:
    async def create_calendar_event(self, token: str, calendar_id: str, event: dict):
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
                headers={"Authorization": f"Bearer {token}"},
                json=event,
            )
            response.raise_for_status()
            return response.json()

    async def drive_file(self, token: str, file_id: str):
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(
                f"https://www.googleapis.com/drive/v3/files/{file_id}",
                headers={"Authorization": f"Bearer {token}"},
                params={"fields": "id,name,mimeType,webViewLink,modifiedTime,owners"},
            )
            response.raise_for_status()
            return response.json()

    def meet_conference_payload(self, summary: str, start: str, end: str, attendees: list[str] | None = None):
        return {
            "summary": summary,
            "start": {"dateTime": start},
            "end": {"dateTime": end},
            "attendees": [{"email": email} for email in attendees or []],
            "conferenceData": {
                "createRequest": {
                    "requestId": f"workflowos-{summary.lower().replace(' ', '-')[:32]}",
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        }


google_client = GoogleClient()
