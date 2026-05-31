import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";


const agentIcons = {
  project_manager: ClipboardList,
  scheduling: Activity,
  workflow_optimization: Zap,
  collaboration: Radio,
  executive_intelligence: ShieldCheck,
  workspace_copilot: Bot,
};


function confidenceLabel(value) {
  if (value == null) return "0%";
  return `${Math.round(Number(value) * 100)}%`;
}


function formatDate(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}


function AgentCard({ agent }) {
  const Icon = agentIcons[agent.key] || BrainCircuit;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-slate-950 p-3 text-white">
          <Icon size={22} />
        </div>
        <div>
          <p className="font-bold text-slate-950">{agent.name}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {agent.description}
          </p>
        </div>
      </div>
    </div>
  );
}


function RecommendationRow({ item }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
          {item.agent_key}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {item.category}
        </span>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
          {confidenceLabel(item.confidence)}
        </span>
      </div>
      <h3 className="mt-3 font-bold text-slate-950">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{item.message}</p>
      <p className="mt-3 text-xs font-medium text-slate-400">
        {formatDate(item.created_at)}
      </p>
    </div>
  );
}


export default function AIAgentsPage() {
  const [agents, setAgents] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [socketStatus, setSocketStatus] = useState("disconnected");

  async function fetchWorkspace({ silent = false } = {}) {
    try {
      const [agentsResponse, recommendationsResponse] = await Promise.all([
        api.get("/ai/agents"),
        api.get("/ai/recommendations", { params: { limit: 8 } }),
      ]);
      setAgents(agentsResponse.data?.agents || []);
      setRecommendations(recommendationsResponse.data?.recommendations || []);
    } catch (error) {
      console.error(error);
      if (!silent) toast.error("Failed to load AI workspace");
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    try {
      setAnalyzing(true);
      const response = await api.post("/ai/agents/analyze");
      const count = response.data?.recommendations?.length || 0;
      toast.success(`AI analysis generated ${count} recommendation(s)`);
      await fetchWorkspace({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error("Failed to run AI analysis");
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    fetchWorkspace();
  }, []);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onStatus: setSocketStatus,
      onMessage: (message) => {
        if (message.event?.startsWith("ai.")) {
          fetchWorkspace({ silent: true });
        }
      },
    });
    return stop;
  }, []);

  const metrics = useMemo(
    () => ({
      agents: agents.length,
      pending: recommendations.filter((item) => item.status === "pending_approval").length,
      highRisk: recommendations.filter((item) => ["high", "critical"].includes(item.severity)).length,
    }),
    [agents, recommendations]
  );

  if (loading) {
    return (
      <MainLayout>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-44 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-slate-950 p-3 text-white">
            <Sparkles size={26} />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-950">AI Workspace</h1>
            <p className="mt-1 text-slate-500">
              Autonomous agents monitoring delivery, schedules, collaboration, and execution health.
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
            disabled={analyzing}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analyzing ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            Run analysis
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Active agents</p>
          <p className="mt-3 text-4xl font-bold text-slate-950">{metrics.agents}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Pending approvals</p>
          <p className="mt-3 text-4xl font-bold text-slate-950">{metrics.pending}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">High-priority signals</p>
          <p className="mt-3 text-4xl font-bold text-slate-950">{metrics.highRisk}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {agents.map((agent) => (
          <AgentCard key={agent.key} agent={agent} />
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-950">Latest AI recommendations</h2>
          <CheckCircle2 size={20} className="text-emerald-600" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {recommendations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              No AI recommendations yet. Run analysis to refresh the workspace.
            </div>
          ) : (
            recommendations.map((item) => <RecommendationRow key={item.id} item={item} />)
          )}
        </div>
      </div>
    </MainLayout>
  );
}
