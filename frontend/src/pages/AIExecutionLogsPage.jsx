import { useEffect, useState } from "react";

import {
  CheckCircle2,
  Clock3,
  FileText,
  Radio,
  ScrollText,
} from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";


function formatDate(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}


function confidenceLabel(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}


export default function AIExecutionLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socketStatus, setSocketStatus] = useState("disconnected");

  async function fetchLogs({ silent = false } = {}) {
    try {
      const response = await api.get("/ai/execution-logs", { params: { limit: 100 } });
      setLogs(response.data?.execution_logs || []);
    } catch (error) {
      console.error(error);
      if (!silent) toast.error("Failed to load AI execution logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onStatus: setSocketStatus,
      onMessage: (message) => {
        if (message.event?.startsWith("ai.")) {
          fetchLogs({ silent: true });
        }
      },
    });
    return stop;
  }, []);

  return (
    <MainLayout>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-slate-950 p-3 text-white">
            <ScrollText size={26} />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-950">AI Logs</h1>
            <p className="mt-1 text-slate-500">
              Execution audit trail for approved AI actions, reasoning, results, and rollback state.
            </p>
          </div>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
          <Radio size={16} className={socketStatus === "connected" ? "text-emerald-600" : "text-slate-400"} />
          {socketStatus}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No AI execution logs are visible for your role.
        </div>
      ) : (
        <div className="space-y-4">
          {logs.map((log) => (
            <article key={log.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
                      <FileText size={13} />
                      {log.action_type}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      <CheckCircle2 size={13} />
                      {log.status}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                      {confidenceLabel(log.confidence)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      <Clock3 size={13} />
                      {log.approval_status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {log.reasoning_summary || "No reasoning summary was recorded."}
                  </p>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Execution result</p>
                      <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                        {log.execution_result_json || "{}"}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Rollback state</p>
                      <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                        {log.rollback_state_json || "{}"}
                      </pre>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-sm text-slate-500 xl:text-right">
                  <p>Agent: <span className="font-semibold text-slate-700">{log.agent_key}</span></p>
                  <p className="mt-1">Recommendation #{log.recommendation_id || "manual"}</p>
                  <p className="mt-1">Created {formatDate(log.created_at)}</p>
                  <p className="mt-1">Executed {formatDate(log.executed_at)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </MainLayout>
  );
}
