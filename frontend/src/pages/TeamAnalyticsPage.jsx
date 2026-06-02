import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  CheckCircle2,
  Download,
  Flame,
  Gauge,
  LineChart as LineChartIcon,
  Radio,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";
import StatCard from "../components/ui/StatCard";
import EmptyState from "../components/ui/EmptyState";
import { PageSkeleton } from "../components/ui/SkeletonLoader";


function Kpi({ label, value, icon: Icon, accentColor = "purple", sublabel }) {
  return <StatCard title={label} value={value} subtitle={sublabel} icon={Icon} accentColor={accentColor} />;
}


function riskTone(value) {
  if (value >= 80) return "text-emerald-700 bg-emerald-50";
  if (value >= 60) return "text-amber-700 bg-amber-50";
  return "text-rose-700 bg-rose-50";
}


export default function TeamAnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("executive");

  async function fetchAnalytics({ silent = false } = {}) {
    try {
      const response = await api.get("/team-analytics/");
      setAnalytics(response.data);
    } catch (error) {
      if (!silent) toast.error(error?.response?.data?.detail || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onMessage: (message) => {
        if (
          [
            "analytics.updated",
            "task.created",
            "task.updated",
            "task.moved",
            "task.rescheduled",
            "automation.executed",
            "automation.failed",
            "comment.created",
            "attachment.created",
            "sprint.updated",
          ].includes(message.event)
        ) {
          fetchAnalytics({ silent: true });
        }
      },
    });
    return stop;
  }, []);

  const kpis = analytics?.kpis || {};
  const productivityMembers = analytics?.members || [];
  const workloadUsers = analytics?.workload?.users || [];
  const taskDistribution = analytics?.task_distribution || [];
  const forecasts = analytics?.forecasts?.projects || [];
  const activityTrend = analytics?.trends?.activity || [];
  const completionTrend = analytics?.trends?.task_completion || [];
  const automationTrend = analytics?.trends?.automation || [];
  const sprintRows = analytics?.sprint?.sprints || [];

  const trendData = useMemo(
    () =>
      activityTrend.map((item, index) => ({
        date: item.date.slice(5),
        activity: item.value,
        completions: completionTrend[index]?.value || 0,
        automations: automationTrend[index]?.value || 0,
      })),
    [activityTrend, completionTrend, automationTrend]
  );

  async function downloadReport() {
    try {
      const response = await api.get("/team-analytics/reports/pdf", {
        params: {
          report_type: activeView === "sprints" ? "sprint" : activeView === "workload" ? "productivity" : "executive",
        },
        responseType: "blob",
      });
      const contentDisposition = response.headers["content-disposition"] || "";
      const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1].replaceAll('"', ""))
        : "executive_report.pdf";
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename.endsWith(".pdf") ? filename : "executive_report.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to generate PDF report");
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <PageSkeleton tabs={true} />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-slate-950 p-3 text-white">
              <BarChart3 size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-100">
                Executive Insights
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Productivity intelligence, forecasting, workload risk, sprint analytics, and automation impact.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 ring-1 ring-slate-200">
              <Radio size={16} className="text-emerald-600" />
              Live analytics
            </div>
            <button
              onClick={downloadReport}
              className="flex items-center gap-2 rounded-lg border border-border bg-white dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-text-primary shadow-card transition-all duration-150 hover:bg-surface-secondary"
            >
              <Download size={16} />
              Download Report
            </button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Organization Health"
            value={`${kpis.organization_health || 0}%`}
            icon={Gauge}
            accentColor="info"
            sublabel={`${analytics?.scope || "organization"} scope`}
          />
          <Kpi
            label="Delivery Confidence"
            value={`${kpis.delivery_confidence || 0}%`}
            icon={Target}
            accentColor="warning"
            sublabel={`${analytics?.forecasts?.organization?.delay_risk || 0}% delay risk`}
          />
          <Kpi
            label="Productivity"
            value={`${kpis.productivity || 0}%`}
            icon={TrendingUp}
            accentColor="success"
            sublabel={`${kpis.completed_tasks || 0}/${kpis.total_tasks || 0} tasks complete`}
          />
          <Kpi
            label="Automation Successes"
            value={kpis.automation_successful_executions || 0}
            icon={Bot}
            accentColor="purple"
            sublabel={`${kpis.automation_success_rate || 0}% success rate`}
          />
        </div>

        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Sprint Velocity", kpis.sprint_velocity || 0, LineChartIcon, "info"],
            ["Predictability", `${kpis.sprint_predictability || 0}%`, CheckCircle2, "success"],
            ["Overdue Rate", `${kpis.overdue_rate || 0}%`, Flame, "danger"],
            ["Collaboration", kpis.collaboration_activity || 0, Activity, "purple"],
          ].map(([label, value, Icon, accentColor]) => (
            <Kpi key={label} label={label} value={value} icon={Icon} accentColor={accentColor} />
          ))}
        </div>

        <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain size={19} className="text-blue-600" />
              <h2 className="font-bold text-slate-950 dark:text-slate-100">AI Executive Summary</h2>
            </div>
            <div className="flex flex-wrap rounded-md bg-slate-100 dark:bg-slate-800 p-1">
              {["executive", "workload", "sprints", "automation"].map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`rounded px-3 py-1.5 text-xs font-bold capitalize ${
                    activeView === view ? "bg-white dark:bg-slate-800 text-slate-950 dark:text-slate-100 shadow-sm dark:shadow-slate-900/50" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>
          <p className="max-w-5xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {analytics?.executive?.summary}
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {(analytics?.executive?.insights || []).slice(0, 3).map((insight) => (
              <div key={`${insight.type}-${insight.title}`} className="rounded-md bg-slate-50 dark:bg-slate-900 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className={insight.severity === "high" ? "text-rose-600" : "text-amber-600"} />
                  <p className="font-bold text-slate-950 dark:text-slate-100">{insight.title}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{insight.message}</p>
              </div>
            ))}
          </div>
        </section>

        {activeView === "executive" && (
          <div className="grid gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-bold text-slate-950 dark:text-slate-100">Operational Trends</h2>
                <Activity size={18} className="text-slate-500 dark:text-slate-400" />
              </div>
              <div className="h-72 sm:h-80 md:h-96">
                {taskDistribution.length === 0 ? (
                  <div className="flex h-[100px] items-center justify-center">
                    <EmptyState icon={BarChart3} title="No completion data yet" description="Task distribution will appear as work is completed" />
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area dataKey="activity" stroke="#0f172a" fill="#0f172a" fillOpacity={0.12} />
                    <Area dataKey="completions" stroke="#10b981" fill="#10b981" fillOpacity={0.16} />
                    <Area dataKey="automations" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-bold text-slate-950 dark:text-slate-100">Task Distribution</h2>
                <Gauge size={18} className="text-slate-500 dark:text-slate-400" />
              </div>
              <div className="h-72 sm:h-80 md:h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={taskDistribution} dataKey="count" nameKey="status" innerRadius={70} outerRadius={120} paddingAngle={3}>
                      {taskDistribution.map((entry, index) => (
                        <Cell key={entry.status} fill={["#64748b", "#2563eb", "#7c3aed", "#ef4444", "#10b981"][index % 5]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        )}

        {activeView === "workload" && (
          <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Workload Intelligence</h2>
              <Users size={18} className="text-slate-500 dark:text-slate-400" />
            </div>
            <div className="divide-y divide-slate-100">
              {workloadUsers.map((row) => (
                <div key={row.user?.id || row.user?.email || row.assigned_points} className="grid gap-4 px-5 py-4 lg:grid-cols-[220px_1fr_120px_120px] lg:items-center">
                  <div>
                    <p className="font-bold text-slate-950 dark:text-slate-100">{row.user?.full_name || "Unassigned"}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{row.active_tasks} active tasks</p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full ${row.burnout_risk > 70 ? "bg-rose-500" : row.utilization > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(row.utilization, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{row.utilization}% utilized</span>
                  <span className={`w-fit rounded-full px-3 py-1 text-center text-sm font-bold ${row.overloaded ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                    Risk {row.burnout_risk}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeView === "sprints" && (
          <div className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50">
              <h2 className="mb-5 font-bold text-slate-950 dark:text-slate-100">Sprint Predictability</h2>
              <div className="h-72 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sprintRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="committed_points" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="completed_points" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="blocked_tasks" fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
              <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4">
                <h2 className="font-bold text-slate-950 dark:text-slate-100">Sprint Scorecards</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {sprintRows.map((sprint) => (
                  <div key={sprint.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_repeat(4,90px)] md:items-center">
                    <div>
                      <p className="font-bold text-slate-950 dark:text-slate-100">{sprint.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{sprint.project?.name || "Global"}</p>
                    </div>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{sprint.completed_points}/{sprint.committed_points}</p>
                    <p className="text-sm font-bold text-emerald-600">{sprint.completion_rate}%</p>
                    <p className="text-sm font-bold text-blue-600">{sprint.predictability}%</p>
                    <p className="text-sm font-bold text-rose-600">{sprint.blocked_tasks} blocked</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeView === "automation" && (
          <div className="grid gap-6 2xl:grid-cols-[1fr_1fr]">
            <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-bold text-slate-950 dark:text-slate-100">Automation Effectiveness</h2>
                <Zap size={18} className="text-violet-600" />
              </div>
              <div className="h-72 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={automationTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50">
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Automation KPIs</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {Object.entries(analytics?.automation?.summary || {}).map(([key, value]) => (
                  <div key={key} className="rounded-md bg-slate-50 dark:bg-slate-900 p-4">
                    <p className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500">{key.replaceAll("_", " ")}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-slate-100">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <div className="grid gap-6 2xl:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
            <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4">
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Member Productivity</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {productivityMembers.slice(0, 8).map((member) => (
                <div key={member.user_id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_repeat(4,90px)] md:items-center">
                  <div>
                    <p className="font-bold text-slate-950 dark:text-slate-100">{member.user}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{member.role}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{member.assigned_tasks} tasks</p>
                  <p className="text-sm font-semibold text-emerald-600">{member.completed_tasks} done</p>
                  <p className="text-sm font-semibold text-rose-600">{member.overdue_tasks} late</p>
                  <span className="w-fit rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-center text-sm font-bold text-slate-700 dark:text-slate-200 md:w-auto">
                    {member.productivity}%
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
            <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4">
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Delivery Forecasts</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {forecasts.length === 0 ? (
                <div className="flex h-[100px] items-center justify-center">
                  <EmptyState icon={TrendingUp} title="No scheduled work" description="Delivery forecasts will appear as work is planned" />
                </div>
              ) : forecasts.slice(0, 8).map((forecast) => (
                <div key={`${forecast.entity_type}-${forecast.entity_id}`} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_120px_120px] md:items-center">
                  <div>
                    <p className="font-bold text-slate-950 dark:text-slate-100">{forecast.project?.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {forecast.drivers?.overdue_tasks || 0} overdue, {forecast.drivers?.blocked_tasks || 0} blocked
                    </p>
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1 text-center text-sm font-bold md:w-auto ${riskTone(forecast.delivery_confidence)}`}>
                    {forecast.delivery_confidence}% confidence
                  </span>
                  <span className="w-fit rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-center text-sm font-bold text-slate-700 dark:text-slate-200 md:w-auto">
                    {forecast.delay_risk}% risk
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
