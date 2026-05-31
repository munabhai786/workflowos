import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";


const riskColors = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#10b981",
};

const riskStyles = {
  critical: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200",
  high: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200",
  medium: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
  low: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
};

const typeIcons = {
  sprint_delay_risk: Clock3,
  overdue_risk: AlertTriangle,
  workload_imbalance: Users,
  bottleneck_detection: GitBranch,
  productivity_decline: TrendingDown,
};


function formatDate(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}


function RiskCard({ risk }) {
  const Icon = typeIcons[risk.risk_type] || ShieldAlert;
  const style = riskStyles[risk.level] || riskStyles.low;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-950 dark:text-slate-100">
                {risk.title}
              </h3>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${style}`}>
                {risk.level}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {risk.description || `${risk.probability}% predicted risk`}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-3xl font-extrabold text-slate-950 dark:text-slate-100">
            {risk.probability}%
          </p>
          <p className="text-xs font-bold uppercase text-slate-400">risk score</p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(risk.probability || 0, 100)}%`,
            background: riskColors[risk.level] || riskColors.low,
          }}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">Reasons</p>
          <ul className="mt-2 space-y-2">
            {(risk.reasons || []).map((reason) => (
              <li key={reason} className="flex gap-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-bold uppercase text-slate-400">Recommendation</p>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
            {risk.recommendation}
          </p>
          {risk.actions?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {risk.actions.map((action) => (
                <Link
                  key={`${risk.id}-${action.label}`}
                  to={action.path}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950"
                >
                  {action.label}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}


export default function AIRiskPredictionsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchPredictions({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      const response = await api.get("/ai/risk-predictions");
      setData(response.data);
    } catch (error) {
      console.error(error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPredictions();
  }, []);

  useEffect(() => {
    return createRealtimeConnection({
      onMessage: (message) => {
        if (
          [
            "analytics.updated",
            "task.created",
            "task.updated",
            "task.moved",
            "task.deleted",
            "sprint.created",
            "sprint.updated",
            "automation.executed",
            "comment.created",
          ].includes(message.event)
        ) {
          fetchPredictions({ silent: true });
        }
      },
    });
  }, []);

  const summary = data?.summary || {};
  const riskCards = data?.risk_cards || [];
  const signals = data?.signals || {};
  const workloadUsers = signals?.workload_distribution?.users || [];
  const projectPredictions = data?.project_predictions || [];

  const riskDistribution = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    riskCards.forEach((card) => {
      counts[card.level] = (counts[card.level] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([level, count]) => ({ level, count }))
      .filter((item) => item.count > 0);
  }, [riskCards]);

  const projectChart = projectPredictions.slice(0, 8).map((item) => ({
    name: item.project?.name || item.title,
    score: item.score,
  }));

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-[540px] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-slate-950 p-3 text-white dark:bg-slate-100 dark:text-slate-950">
              <ShieldAlert size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-100">
                AI Risk Prediction
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Explainable project, sprint, workload, approval, and productivity risks computed from real workspace data.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchPredictions()}
            className="button-secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Overall Risk", `${summary.overall_risk_score || 0}%`, ShieldAlert, summary.overall_risk_level || "low"],
            ["Critical", summary.critical_count || 0, AlertTriangle, "critical"],
            ["High", summary.high_count || 0, TrendingDown, "high"],
            ["Data Points", Object.values(summary.real_data_points || {}).reduce((sum, value) => sum + Number(value || 0), 0), BarChart3, "low"],
          ].map(([label, value, Icon, level]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
                  <p className="mt-2 text-3xl font-extrabold text-slate-950 dark:text-slate-100">{value}</p>
                </div>
                <div
                  className="rounded-lg p-3 text-white"
                  style={{ background: riskColors[level] || riskColors.low }}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Prediction Method</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {data?.method || "deterministic_explainable_scoring"}. Generated {formatDate(data?.generated_at)}.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Real data only
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {Object.entries(summary.real_data_points || {}).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                <p className="text-xs font-bold uppercase text-slate-400">{key.replaceAll("_", " ")}</p>
                <p className="mt-2 text-xl font-bold text-slate-950 dark:text-slate-100">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <section className="space-y-4">
            {riskCards.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-800">
                <Bot className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                <p className="font-bold text-slate-700 dark:text-slate-200">No risk predictions available</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add projects, tasks, sprints, approvals, or completion activity to generate predictions.</p>
              </div>
            ) : (
              riskCards.map((risk) => <RiskCard key={risk.id} risk={risk} />)
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Risk Mix</h2>
              <div className="mt-4 h-64">
                {riskDistribution.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No risk levels yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={riskDistribution} dataKey="count" nameKey="level" innerRadius={54} outerRadius={88} paddingAngle={3}>
                        {riskDistribution.map((entry) => (
                          <Cell key={entry.level} fill={riskColors[entry.level]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Project Risk Scores</h2>
              <div className="mt-4 h-72">
                {projectChart.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No project risk data</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projectChart} layout="vertical" margin={{ left: 20, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="score" radius={[0, 6, 6, 0]} fill="#0f172a" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Signal Snapshot</h2>
              <div className="mt-4 space-y-3">
                {[
                  ["Completion velocity", `${signals?.task_completion_velocity?.completed_last_7_days || 0} this week`],
                  ["Overdue tasks", signals?.overdue_count || 0],
                  ["Missed deadlines", signals?.missed_deadlines || 0],
                  ["Blocked tasks", signals?.dependency_chain_proxy?.blocked_tasks || 0],
                  ["Stale approvals", signals?.approval_times?.stale || 0],
                  ["Workload imbalance", `${signals?.workload_distribution?.imbalance_score || 0}%`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</span>
                    <span className="text-sm font-bold text-slate-950 dark:text-slate-100">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Top Workload Risks</h2>
              <div className="mt-4 space-y-3">
                {workloadUsers.slice(0, 5).map((row) => (
                  <div key={row.user?.id || row.user?.full_name} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{row.user?.full_name}</p>
                      <span className="text-sm font-extrabold text-slate-950 dark:text-slate-100">{row.burnout_risk}%</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {row.active_tasks} active, {row.overdue_tasks} overdue, {row.blocked_tasks} blocked
                    </p>
                  </div>
                ))}
                {workloadUsers.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No assigned workload data available.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
}
