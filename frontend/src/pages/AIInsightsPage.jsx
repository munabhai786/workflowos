import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock3,
  Flame,
  Gauge,
  MailCheck,
  Radio,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

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

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import EmptyState from "../components/ui/EmptyState";


const severityStyles = {
  critical: "bg-rose-50 text-rose-700 ring-rose-200",
  high: "bg-orange-50 text-orange-700 ring-orange-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};


const chartColors = [
  "#0f172a",
  "#2563eb",
  "#f59e0b",
  "#ef4444",
];


function ScoreCard({
  title,
  value,
  icon: Icon,
  description,
  tone,
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className="mt-3 text-4xl font-bold text-slate-950">
            {value}%
          </p>
        </div>
        <div className={`rounded-lg p-3 ${tone}`}>
          <Icon size={22} />
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-slate-950 transition-all duration-700"
          style={{
            width: `${Math.min(value || 0, 100)}%`,
          }}
        />
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}


function Panel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
        <h2 className="font-bold text-slate-950">
          {title}
        </h2>
        <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2 text-slate-600 dark:text-slate-300">
          <Icon size={18} />
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}


function HeatCell({ label, value, severity }) {
  return (
    <div
      className={`rounded-lg p-4 ring-1 ring-inset ${
        severityStyles[severity] ||
        severityStyles.low
      }`}
    >
      <p className="text-sm font-semibold">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>
    </div>
  );
}


function deadlineCountdown(project) {
  if (project.hours_to_deadline == null) return "";

  if (project.hours_to_deadline < 0) return "Overdue";

  const hours = Math.floor(project.hours_to_deadline);
  const minutes = Math.round((project.hours_to_deadline - hours) * 60);

  return `${hours}h ${minutes}m left`;
}


export default function AIInsightsPage() {
  const [insights, setInsights] = useState(null);
  const [taskIntelligence, setTaskIntelligence] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchInsights() {
    try {
      setLoading(true);

      const [response, taskResponse] = await Promise.all([
        api.get("/ai/insights"),
        api.get("/ai/tasks"),
      ]);
      setInsights(response.data);
      setTaskIntelligence(taskResponse.data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load AI insights");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(fetchInsights, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const workloadChart = useMemo(
    () =>
      (insights?.workload_analysis || []).map(
        (item) => ({
          name: item.user,
          assigned: item.assigned_tasks,
          overdue: item.overdue_tasks,
          completed: item.completed_tasks,
        })
      ),
    [insights]
  );

  if (loading) {
    return (
      <MainLayout>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-lg bg-slate-200"
            />
          ))}
        </div>
        <div className="mt-8 grid gap-4 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-80 animate-pulse rounded-lg bg-slate-200"
            />
          ))}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-slate-950 p-3 text-white">
            <Brain size={26} />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-950">
              AI Operations
            </h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Proactive deadline awareness, delivery risk, workload balance, and execution quality.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-4 shadow-sm dark:shadow-slate-900/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Current urgency
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Flame
              size={20}
              className="text-rose-600"
            />
            <span className="text-xl font-bold capitalize text-slate-950">
              {insights?.urgency_level || "low"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <ScoreCard
          title="Workflow health"
          value={insights?.workflow_health_score || 0}
          icon={Gauge}
          tone="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          description="Composite score based on deadlines, congestion, overdue load, and project motion."
        />
        <ScoreCard
          title="Team efficiency"
          value={insights?.team_efficiency_score || 0}
          icon={Users}
          tone="bg-sky-50 text-sky-700"
          description="Balances completion rate against overload and unused capacity."
        />
        <ScoreCard
          title="Project velocity"
          value={insights?.project_velocity_score || 0}
          icon={TrendingUp}
          tone="bg-emerald-50 text-emerald-700"
          description="Measures recent completion momentum and project activity."
        />
        <ScoreCard
          title="Execution quality"
          value={insights?.execution_quality_score || 0}
          icon={Target}
          tone="bg-violet-50 text-violet-700"
          description="Evaluates delivery quality from overdue work and review pressure."
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <HeatCell
          label="Risk score"
          value={`${insights?.risk_score || 0}%`}
          severity={
            insights?.risk_score >= 70
              ? "critical"
              : insights?.risk_score >= 45
              ? "high"
              : "low"
          }
        />
        <HeatCell
          label="Delay probability"
          value={`${insights?.delay_probability || 0}%`}
          severity={
            insights?.delay_probability >= 70
              ? "critical"
              : insights?.delay_probability >= 45
              ? "high"
              : "medium"
          }
        />
        <HeatCell
          label="Deadline alerts"
          value={insights?.deadline_alerts?.length || 0}
          severity={
            insights?.deadline_alerts?.length
              ? "critical"
              : "low"
          }
        />
      </div>

      <div className="mt-8 grid gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          title="AI recommendations"
          icon={Sparkles}
        >
          <div className="space-y-4">
            {(insights?.insights || []).map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                      severityStyles[item.severity] ||
                      severityStyles.low
                    }`}
                  >
                    {item.severity}
                  </span>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {item.category}
                  </span>
                </div>
                <h3 className="mt-3 font-bold text-slate-950">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {item.message}
                </p>
                <p className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {item.recommendation}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Completion trend"
          icon={Radio}
        >
          <div className="h-80">
            {(insights?.completion_trends || []).length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Building your trend data"
                description="Complete tasks to generate your completion trend chart"
              />
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>
                  <Pie
                    data={insights?.completion_trends || []}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={110}
                    label
                  >
                    {(insights?.completion_trends || []).map(
                      (entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={
                            chartColors[
                              index % chartColors.length
                            ]
                          }
                        />
                      )
                    )}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Panel
          title="Projects at risk"
          icon={AlertTriangle}
        >
          <div className="space-y-3">
            {(insights?.projects_at_risk || []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No high-risk projects in the current scope.
              </p>
            ) : (
              insights.projects_at_risk.map((project) => (
                <div
                  key={project.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 transition hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">
                        {project.name}
                      </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {project.overdue_tasks} overdue task(s)
                  </p>
                    </div>
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-bold text-rose-700 ring-1 ring-inset ring-rose-200">
                      {project.risk_score}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-rose-600"
                      style={{
                        width: `${project.risk_score}%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {deadlineCountdown(project) && (
                      <span className="animate-pulse rounded-full bg-rose-100 px-2.5 py-1 text-rose-700">
                        {deadlineCountdown(project)}
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 capitalize">
                      {project.alert_level || "none"}
                    </span>
                    {project.email_sent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                        <MailCheck size={13} />
                        Email sent
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel
          title="Workload balance"
          icon={Users}
        >
          <div className="h-80">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart data={workloadChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="assigned"
                  fill="#0f172a"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="completed"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="overdue"
                  fill="#ef4444"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Panel
          title="Task Prioritization"
          icon={Target}
        >
          <div className="space-y-3">
            {(taskIntelligence?.prioritized_tasks || []).slice(0, 6).map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-slate-950">{task.title}</p>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-sm font-bold text-white">
                    {task.priority_score}%
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-500 dark:text-slate-400">
                  {(task.suggested_subtasks || []).slice(0, 2).map((subtask) => (
                    <p key={subtask}>{subtask}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Delivery Confidence"
          icon={Gauge}
        >
          <div className="space-y-3">
            {(taskIntelligence?.delivery_risks || []).slice(0, 6).map((project) => (
              <div
                key={project.project_id}
                className="rounded-lg bg-slate-50 dark:bg-slate-900 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-950">{project.project}</p>
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    {project.delivery_confidence}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-slate-950"
                    style={{ width: `${project.delivery_confidence}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Panel
          title="Bottlenecks"
          icon={Zap}
        >
          <div className="space-y-3">
            {(insights?.workflow_bottlenecks || []).map(
              (item) => (
                <div
                  key={item.stage}
                  className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-900 px-4 py-3"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {item.stage}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                      severityStyles[item.severity] ||
                      severityStyles.medium
                    }`}
                  >
                    {item.count}
                  </span>
                </div>
              )
            )}
          </div>
        </Panel>

        <Panel
          title="Top performers"
          icon={CheckCircle2}
        >
          <div className="space-y-3">
            {(insights?.top_performers || []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No completion data yet.
              </p>
            ) : (
              insights.top_performers.map((user) => (
                <div
                  key={user.user_id}
                  className="rounded-lg bg-emerald-50 px-4 py-3"
                >
                  <p className="font-bold text-emerald-950">
                    {user.user}
                  </p>
                  <p className="mt-1 text-sm text-emerald-700">
                    {user.completion_rate}% completion across {user.assigned_tasks} task(s)
                  </p>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel
          title="Inactive workflows"
          icon={Clock3}
        >
          <div className="space-y-3">
            {(insights?.inactive_workflows || []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No stagnant workflows detected.
              </p>
            ) : (
              insights.inactive_workflows.map((project) => (
                <div
                  key={project.id}
                  className="rounded-lg bg-amber-50 px-4 py-3"
                >
                  <p className="font-bold text-amber-950">
                    {project.name}
                  </p>
                  <p className="mt-1 text-sm text-amber-700">
                    {project.progress}% progress with low recent activity
                  </p>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </MainLayout>
  );
}
