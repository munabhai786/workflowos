import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  Check,
  Edit3,
  Loader2,
  Radio,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  X,
} from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";


const severityStyles = {
  critical: "bg-rose-50 text-rose-700 ring-rose-200",
  high: "bg-orange-50 text-orange-700 ring-orange-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};


function confidenceLabel(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}


function formatDate(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}


function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-950">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}


export default function AIRecommendationsPage() {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [payloadText, setPayloadText] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const role = localStorage.getItem("user_role");
  const canApprove = ["Admin", "Manager"].includes(role);

  async function fetchRecommendations({ silent = false } = {}) {
    try {
      const params = { limit: 100 };
      if (filter !== "all") params.status = filter;
      const response = await api.get("/ai/recommendations", { params });
      setRecommendations(response.data?.recommendations || []);
    } catch (error) {
      console.error(error);
      if (!silent) toast.error("Failed to load AI recommendations");
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    try {
      setRunning(true);
      await api.post("/ai/agents/analyze");
      toast.success("AI recommendations refreshed");
      await fetchRecommendations({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error("Failed to refresh AI recommendations");
    } finally {
      setRunning(false);
    }
  }

  async function approveRecommendation(item, modifiedPayload = null) {
    try {
      await api.post(`/ai/recommendations/${item.id}/approve`, {
        modified_payload: modifiedPayload,
      });
      toast.success("AI action approved");
      setModal(null);
      await fetchRecommendations({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error("Failed to approve recommendation");
    }
  }

  async function rejectRecommendation(item) {
    try {
      await api.post(`/ai/recommendations/${item.id}/reject`, {
        reason: rejectReason,
      });
      toast.success("AI recommendation rejected");
      setModal(null);
      setRejectReason("");
      await fetchRecommendations({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error("Failed to reject recommendation");
    }
  }

  async function modifyRecommendation(item) {
    try {
      const payload = JSON.parse(payloadText || "{}");
      await api.post(`/ai/recommendations/${item.id}/modify`, { payload });
      toast.success("AI recommendation modified");
      setModal(null);
      await fetchRecommendations({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error("Invalid payload or modify request failed");
    }
  }

  useEffect(() => {
    fetchRecommendations();
  }, [filter]);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onStatus: setSocketStatus,
      onMessage: (message) => {
        if (message.event?.startsWith("ai.")) {
          fetchRecommendations({ silent: true });
        }
      },
    });
    return stop;
  }, [filter]);

  const metrics = useMemo(
    () => ({
      total: recommendations.length,
      pending: recommendations.filter((item) => item.status === "pending_approval").length,
      actions: recommendations.filter((item) => item.action_type).length,
    }),
    [recommendations]
  );

  return (
    <MainLayout>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-slate-950 p-3 text-white">
            <Sparkles size={26} />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-950">AI Recommendations</h1>
            <p className="mt-1 text-slate-500">
              Review agent suggestions, reasoning, confidence, and approval-gated actions.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
            <Radio size={16} className={socketStatus === "connected" ? "text-emerald-600" : "text-slate-400"} />
            {socketStatus}
          </div>
          <button
            onClick={runAnalysis}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            Refresh AI
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Recommendations</p>
          <p className="mt-3 text-4xl font-bold text-slate-950">{metrics.total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Pending approval</p>
          <p className="mt-3 text-4xl font-bold text-slate-950">{metrics.pending}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Actionable</p>
          <p className="mt-3 text-4xl font-bold text-slate-950">{metrics.actions}</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {["all", "open", "pending_approval", "approved", "rejected", "modified"].map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`rounded-lg px-4 py-2 text-sm font-bold capitalize transition ${
              filter === item ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {item.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      ) : recommendations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <AlertTriangle className="mx-auto text-slate-400" size={28} />
          <p className="mt-3 font-semibold text-slate-700">No recommendations found</p>
          <p className="mt-1 text-sm text-slate-500">Run AI analysis to generate current operational recommendations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recommendations.map((item) => (
            <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${severityStyles[item.severity] || severityStyles.medium}`}>
                      {item.severity}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{item.agent_key}</span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                      {confidenceLabel(item.confidence)}
                    </span>
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                      {item.status}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-bold text-slate-950">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.message}</p>
                  <div className="mt-4 rounded-lg bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Reasoning</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{item.reasoning || "No reasoning was provided."}</p>
                  </div>
                  {item.action_type && (
                    <p className="mt-3 text-sm font-semibold text-slate-500">
                      Action: <span className="text-slate-800">{item.action_type}</span>
                    </p>
                  )}
                  <p className="mt-3 text-xs font-medium text-slate-400">{formatDate(item.created_at)}</p>
                </div>
                {canApprove && item.approval_required && !["approved", "rejected"].includes(item.status) && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      onClick={() => approveRecommendation(item)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
                    >
                      <Check size={16} />
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setPayloadText(JSON.stringify(item.action_payload || {}, null, 2));
                        setModal({ type: "modify", item });
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                    >
                      <Edit3 size={16} />
                      Modify
                    </button>
                    <button
                      onClick={() => setModal({ type: "reject", item })}
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
                    >
                      <ThumbsDown size={16} />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {modal?.type === "modify" && (
        <Modal title="Modify AI action payload" onClose={() => setModal(null)}>
          <div className="p-5">
            <textarea
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
              rows={12}
              className="w-full rounded-lg border border-slate-200 p-4 font-mono text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={() => modifyRecommendation(modal.item)} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                Save changes
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === "reject" && (
        <Modal title="Reject AI recommendation" onClose={() => setModal(null)}>
          <div className="p-5">
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={5}
              placeholder="Reason for rejection"
              className="w-full rounded-lg border border-slate-200 p-4 text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={() => rejectRecommendation(modal.item)} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">
                Reject
              </button>
            </div>
          </div>
        </Modal>
      )}
    </MainLayout>
  );
}
