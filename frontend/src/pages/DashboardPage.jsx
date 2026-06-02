import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CheckSquare,
  Clock,
  FolderOpen,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";
import { SkeletonList, ChartSkeleton } from "../components/ui/SkeletonLoader";

function EmptyChart({ message }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-center dark:border-slate-700 dark:bg-slate-800">
      <p className="max-w-[220px] text-sm font-medium leading-6 text-slate-400 dark:text-slate-500 dark:text-slate-500">
        {message}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get("/analytics/dashboard");

      setDashData(res.data);
      setLastFetch(new Date());
    } catch (err) {
      console.error("Dashboard fetch error:", err);

      if (!navigator.onLine) {
        setError("No internet connection. Please check your network.");
      } else if (err?.response?.status === 401) {
        setError("Session expired. Please log in again.");
      } else if (err?.response?.status === 500) {
        setError(
          "Server error loading dashboard. Your data is safe - please refresh the page."
        );
      } else {
        setError("Could not load dashboard data. Please refresh.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchDashboard();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = () => fetchDashboard();
    const events = [
      "project-created",
      "project-updated",
      "project-deleted",
      "task-created",
      "task-updated",
      "task-moved",
      "task-deleted",
      "dashboard-refresh",
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, handler);
    });

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, handler);
      });
    };
  }, []);

  useEffect(() => {
    return createRealtimeConnection({
      onMessage: (message) => {
        if (
          [
            "analytics.updated",
            "activity.created",
            "project.created",
            "project.updated",
            "project.deleted",
            "task.created",
            "task.updated",
            "task.moved",
            "task.deleted",
          ].includes(message.event)
        ) {
          console.info("Dashboard realtime refresh:", message.event);
          fetchDashboard();
        }
      },
    });
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => fetchDashboard();
    window.addEventListener("focus", refreshOnFocus);

    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  const stats = dashData?.stats || {};
  const projectChartData = dashData?.project_chart_data || [];
  const taskBreakdown = dashData?.task_status_breakdown || {};
  const projectsAtRisk = dashData?.projects_at_risk || [];
  const projects = dashData?.projects || [];

  const statCards = [
    {
      title: "TOTAL PROJECTS",
      value: stats.total_projects ?? 0,
      trend: stats.projects_growth,
      trendLabel: "vs last month",
      icon: FolderOpen,
      accentColor: "#3b82f6",
      bgColor: "bg-blue-50 dark:bg-blue-950/40",
      iconColor: "text-blue-600 dark:text-blue-400",
      borderColor: "border-l-blue-500",
    },
    {
      title: "TOTAL TASKS",
      value: stats.total_tasks ?? 0,
      trend: stats.tasks_completed_pct,
      trendLabel: "completed this week",
      icon: CheckSquare,
      accentColor: "#10b981",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      borderColor: "border-l-emerald-500",
    },
    {
      title: "PRODUCTIVITY SCORE",
      value: `${stats.productivity_score ?? 0}%`,
      trend: stats.productivity_trend,
      trendLabel: "vs last week",
      icon: TrendingUp,
      accentColor: "#8b5cf6",
      bgColor: "bg-purple-50 dark:bg-purple-950/40",
      iconColor: "text-purple-600 dark:text-purple-400",
      borderColor: "border-l-purple-500",
    },
    {
      title: "UPCOMING DEADLINES",
      value: stats.upcoming_deadlines ?? 0,
      trend: null,
      trendLabel: stats.next_deadline_label || "No upcoming deadlines",
      icon: Clock,
      accentColor: "#f59e0b",
      bgColor: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-600 dark:text-amber-400",
      borderColor: "border-l-amber-500",
    },
  ];

  const donutData = useMemo(
    () =>
      [
        {
          name: "Completed",
          value: taskBreakdown.completed || 0,
          color: "#10b981",
        },
        {
          name: "In Progress",
          value: taskBreakdown.in_progress || 0,
          color: "#3b82f6",
        },
        {
          name: "To Do",
          value: taskBreakdown.todo || 0,
          color: "#94a3b8",
        },
        {
          name: "Overdue",
          value: taskBreakdown.overdue || 0,
          color: "#ef4444",
        },
        {
          name: "Review",
          value: taskBreakdown.review || 0,
          color: "#f59e0b",
        },
      ].filter((item) => item.value > 0),
    [taskBreakdown]
  );

  return (
    <MainLayout>
      <div className="workspace-shell">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="workspace-heading">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-800 dark:text-slate-100 dark:text-slate-100">
                Dashboard
              </h1>
              <button
                type="button"
                onClick={fetchDashboard}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 shadow-sm dark:shadow-slate-900/50 transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>
            <p className="max-w-2xl text-sm font-medium leading-relaxed text-slate-400 dark:text-slate-500 dark:text-slate-500">
              Live project and task signals from your workspace.
              {lastFetch && (
                <span className="ml-1">
                  Last refreshed {lastFetch.toLocaleTimeString()}.
                </span>
              )}
            </p>
          </div>

          <Link
            to="/ai-copilot"
            className="flex w-fit items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm dark:shadow-slate-900/50 transition-all hover:bg-blue-700 hover:shadow-md"
          >
            <Sparkles size={17} />
            Ask AI what matters
          </Link>
        </div>

        {error && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/40">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
            <p className="flex-1 text-sm font-medium text-red-700 dark:text-red-300">
              {error}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchDashboard}
                className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 transition-all hover:bg-red-200 dark:bg-red-900/50 dark:text-red-200 dark:hover:bg-red-900"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.title}
                className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50 transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
              >
                <div
                  className="absolute bottom-0 left-0 top-0 w-1 rounded-l-xl"
                  style={{ background: card.accentColor }}
                />

                <div
                  className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${card.bgColor}`}
                >
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>

                <p className="mb-1 text-3xl font-extrabold leading-none text-slate-800 dark:text-slate-100 dark:text-slate-100">
                  {loading ? (
                    <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  ) : (
                    card.value
                  )}
                </p>

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {card.title}
                </p>

                {card.trend !== null && card.trend !== undefined && (
                  <p
                    className={`text-xs font-medium ${
                      card.trend > 0
                        ? "text-emerald-500"
                        : card.trend < 0
                          ? "text-red-500"
                          : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {card.trend > 0 ? "up" : card.trend < 0 ? "down" : ""}{" "}
                    {Math.abs(card.trend)}% {card.trendLabel}
                  </p>
                )}
                {(card.trend === null || card.trend === undefined) &&
                  card.trendLabel && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-500">
                      {card.trendLabel}
                    </p>
                  )}
              </div>
            );
          })}
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100">
                Project Progress
              </h3>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500 dark:text-slate-500">
                Active, completed and at-risk projects over the last 6 months
              </p>
            </div>
          </div>

          {loading ? (
            <ChartSkeleton height={240} />
          ) : projectChartData.length === 0 ? (
            <EmptyChart message="Create projects to see progress trends" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={projectChartData}
                margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="colorActive"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="colorCompleted"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "12px" }}
                />
                <Area
                  type="monotone"
                  dataKey="active"
                  name="Active"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorActive)"
                  dot={{ r: 3, fill: "#3b82f6" }}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#colorCompleted)"
                  dot={{ r: 3, fill: "#10b981" }}
                />
                <Area
                  type="monotone"
                  dataKey="atRisk"
                  name="At Risk"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#colorRisk)"
                  dot={{ r: 3, fill: "#f59e0b" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50 dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-1 text-base font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100">
              Task Status
            </h3>
            <p className="mb-4 text-xs text-slate-400 dark:text-slate-500 dark:text-slate-500">
              Distribution of tasks by current status
            </p>

            {loading ? (
              <ChartSkeleton height={200} />
            ) : donutData.length === 0 ? (
              <EmptyChart message="No tasks yet" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}

            {!loading && (
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
                {[
                  { label: "Completed", color: "#10b981" },
                  { label: "In Progress", color: "#3b82f6" },
                  { label: "To Do", color: "#94a3b8" },
                  { label: "Overdue", color: "#ef4444" },
                  { label: "Review", color: "#f59e0b" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: item.color }}
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100">
                Projects at Risk
              </h3>
            </div>

            {loading ? (
              <SkeletonList count={3} />
            ) : projectsAtRisk.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40">
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-200">
                  All projects on track
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-500">
                  No projects at risk right now
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {projectsAtRisk.slice(0, 4).map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30"
                  >
                    <div className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-200">
                        {project.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {project.progress || 0}% complete{" "}
                        {project.deadline
                          ? `- Due ${new Date(
                              project.deadline
                            ).toLocaleDateString()}`
                          : "- No deadline"}
                      </p>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/60 dark:text-amber-200">
                      {project.status === "delayed" ? "Delayed" : "At Risk"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-1 text-base font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100">
            Recent Projects
          </h3>
          <p className="mb-4 text-xs text-slate-400 dark:text-slate-500 dark:text-slate-500">
            Latest projects returned by dashboard analytics
          </p>

          {loading ? (
            <SkeletonList count={4} />
          ) : projects.length === 0 ? (
            <EmptyChart message="Create projects to see them here" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {projects.slice(0, 6).map((project) => (
                <div
                  key={project.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100">
                        {project.name}
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-400 dark:text-slate-500 dark:text-slate-500">
                        {project.description || "No description"}
                      </p>
                    </div>
                    <span className="rounded-full bg-white dark:bg-slate-800 px-2 py-1 text-xs font-bold capitalize text-slate-500 dark:text-slate-400 dark:bg-slate-800 dark:text-slate-300">
                      {project.status || "active"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${project.progress || 0}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 dark:text-slate-500">
                    <span>{project.progress || 0}% complete</span>
                    <span>{project.priority || "medium"} priority</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
