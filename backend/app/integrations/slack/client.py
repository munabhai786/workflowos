from __future__ import annotations

import httpx


class SlackClient:
    api_base = "https://slack.com/api"

    async def post_message(self, token: str, channel: str, text: str, blocks: list | None = None):
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{self.api_base}/chat.postMessage",
                headers={"Authorization": f"Bearer {token}"},
                json={"channel": channel, "text": text, "blocks": blocks},
            )
            response.raise_for_status()
            return response.json()

    def approval_blocks(self, title: str, action_id: str, payload: dict):
        return [
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*{title}*"}},
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Approve"},
                        "style": "primary",
                        "value": str(payload),
                        "action_id": f"approve:{action_id}",
                    },
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Reject"},
                        "style": "danger",
                        "value": str(payload),
                        "action_id": f"reject:{action_id}",
                    },
                ],
            },
        ]


slack_client = SlackClient()
