import { useEffect, useState } from "react";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  XCircle,
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


function statusIcon(action) {
  if (action === "approve") return CheckCircle2;
  if (action === "reject") return XCircle;
  return Clock3;
}


export default function AIApprovalsPage() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [error, setError] = useState("");
  const [showRaw, setShowRaw] = useState({});

  async function fetchApprovals({ silent = false } = {}) {
    try {
      setError("");
      if (!silent) setLoading(true);
      const response = await api.get("/ai/approvals", { params: { limit: 100 } });
      setApprovals(response.data?.approvals || []);
    } catch (error) {
      console.error(error);
      if (!silent) {
        setError(
          "Something went wrong. " +
            "Please refresh and try again."
        );
      }
      if (!silent) toast.error("Failed to load AI approvals");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    fetchApprovals();
  }, []);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onStatus: setSocketStatus,
      onMessage: (message) => {
        if (message.event?.startsWith("ai.")) {
          fetchApprovals({ silent: true });
        }
      },
    });
    return stop;
  }, []);

  const renderPayload = (payload) => {
    try {
      const parsed = typeof payload === "string"
        ? JSON.parse(payload) : payload;

      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid payload");
      }

      return (
        <div className="mt-3 space-y-3">
          {Array.isArray(parsed.focus) && parsed.focus.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Focus Areas
              </p>
              <div className="flex flex-wrap gap-2">
                {parsed.focus.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                  >
                    {String(item).replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {parsed.target_delivery_confidence && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                Target Confidence:
              </span>
              <span className="text-xs font-bold text-emerald-600">
                {parsed.target_delivery_confidence}%
              </span>
            </div>
          )}
        </div>
      );
    } catch {
      return (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Unable to parse recommendation details.
        </p>
      );
    }
  };

  const getApprovalPayload = (approval) =>
    approval.payload ||
    approval.data ||
    approval.recommendation ||
    approval.modified_payload_json ||
    null;

  const renderRawPayload = (payload) => {
    try {
      const parsed = typeof payload === "string"
        ? JSON.parse(payload)
        : payload;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return "Unable to parse recommendation details.";
    }
  };

  return (
    <MainLayout>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-slate-950 p-3 text-white">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-950">AI Approvals</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Human approval history for autonomous AI recommendations and mutations.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          connected
        </div>
      </div>

      {error && (
        <div className="m-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-700">
            {error}
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
            <ShieldCheck className="h-6 w-6 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            No approvals yet
          </p>
          <p className="max-w-[240px] text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            AI recommendations pending your review will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => {
            const Icon = statusIcon(approval.action);
            const payload = getApprovalPayload(approval);
            return (
              <article key={approval.id} className="mb-3 rounded-xl border border-border bg-white dark:bg-slate-800 p-5 shadow-card transition-all duration-150 hover:shadow-card-hover">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-4">
                    <div className="rounded-lg bg-surface-secondary p-3 text-text-secondary">
                      <Icon size={22} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${approval.action === "approve" ? "bg-status-success/15 text-status-success" : "bg-status-warning/15 text-status-warning"}`}>
                          {approval.action}
                        </span>
                        <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${approval.status === "approved_pending_execution" ? "bg-brand-50 text-brand-600" : "bg-surface-tertiary text-text-secondary"}`}>
                          {approval.status}
                        </span>
                      </div>
                      <p className="mt-3 font-bold text-slate-950">
                        Recommendation #{approval.recommendation_id}
                      </p>
                      {approval.rejection_reason && (
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {approval.rejection_reason}
                        </p>
                      )}
                      {payload && (
                        <>
                          {renderPayload(
                            approval.payload ||
                              approval.data ||
                              approval.recommendation ||
                              approval.modified_payload_json
                          )}
                          <button
                            type="button"
                            onClick={() => setShowRaw((prev) => ({
                              ...prev,
                              [approval.id]: !prev[approval.id],
                            }))}
                            className="mt-2 text-2xs text-slate-400 dark:text-slate-500 underline transition-colors hover:text-slate-600"
                          >
                            {showRaw[approval.id] ? "Hide raw" : "View raw"}
                          </button>
                          {showRaw[approval.id] && (
                            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-300">
                              {renderRawPayload(payload)}
                            </pre>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 md:text-right">
                    <p>Reviewer #{approval.reviewer_id || "system"}</p>
                    <p className="mt-1">{formatDate(approval.created_at)}</p>
                    {approval.execution_log_id && (
                      <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
                        Execution #{approval.execution_log_id}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </MainLayout>
  );
}
