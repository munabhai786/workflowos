const API_URL = import.meta.env.VITE_API_URL || "";

function socketUrl(projectId) {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("workflowos_token");
  const base = API_URL.replace(/^http/, "ws");
  const params = new URLSearchParams({ token });
  if (projectId) params.set("project_id", projectId);
  return `${base}/realtime/ws?${params.toString()}`;
}

export function createRealtimeConnection({
  projectId,
  onMessage,
  onStatus,
}) {
  let socket;
  let reconnectTimer;
  let closed = false;

  function connect() {
    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("workflowos_token");

    if (!token || closed) return;

    socket = new WebSocket(socketUrl(projectId));
    onStatus?.("connecting");

    socket.onopen = () => {
      onStatus?.("connected");
      socket.send(JSON.stringify({ event: "ping" }));
    };

    socket.onmessage = (event) => {
      try {
        onMessage?.(JSON.parse(event.data));
      } catch {
        onMessage?.({ event: "raw", payload: event.data });
      }
    };

    socket.onclose = () => {
      onStatus?.("disconnected");
      if (!closed) {
        reconnectTimer = window.setTimeout(connect, 2500);
      }
    };

    socket.onerror = () => {
      onStatus?.("error");
      socket.close();
    };
  }

  connect();

  return () => {
    closed = true;
    window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}
