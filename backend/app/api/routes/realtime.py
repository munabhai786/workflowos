from fastapi import APIRouter

from app.realtime.websocket_router import websocket_endpoint


router = APIRouter()

# Realtime endpoint (kept for backward import compatibility)
router.websocket("/ws")(websocket_endpoint)

