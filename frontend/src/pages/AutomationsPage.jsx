import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock3,
  History,
  Info,
  Lightbulb,
  Play,
  Plus,
  Radio,
  Settings2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";


const ACTION_TYPES = [
  "send_notification",
  "notify_manager",
  "assign_task",
  "change_status",
  "update_priority",
  "create_activity",
  "create_comment",
  "create_reminder",
  "trigger_ai_analysis",
];


const CONDITION_FIELDS = [
  "task.status",
  "task.priority",
  "project_id",
  "assignee_id",
  "old_status",
  "new_status",
  "trigger_type",
];


function relativeTime(value) {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}


function emptyDraft(triggerType = "task.created") {
  return {
    name: "",
    description: "",
    trigger_type: triggerType,
    scope: "personal",
    project_id: "",
    enabled: true,
    conditions: {
      mode: "and",
      rules: [],
    },
    actions: [
      {
        type: "send_notification",
        title: "Workflow automation",
        message: "A workflow rule was triggered.",
        severity: "medium",
        priority: "normal",
      },
    ],
  };
}


export default function AutomationsPage() {
  const [workspace, setWorkspace] = useState({
    rules: [],
    executions: [],
    triggers: [],
    projects: [],
    recommendations: [],
    metrics: {},
  });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyDraft());
  const [selectedRule, setSelectedRule] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");

  const role = localStorage.getItem("user_role");
  const canCreateScoped = ["Admin", "Manager"].includes(role);

  async function fetchAutomations({ silent = false } = {}) {
    try {
      setError("");
      if (!silent) setLoading(true);
      const response = await api.get("/automations/workspace");
      setWorkspace(response.data || {});
    } catch (error) {
      console.error(error);
      if (!silent) {
        setError(
          "Something went wrong. " +
            "Please refresh and try again."
        );
      }
      if (!silent) toast.error("Failed to load automations");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    fetchAutomations();
  }, []);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onMessage: (message) => {
        if (
          [
            "automation.created",
            "automation.updated",
            "automation.deleted",
            "automation.executed",
            "automation.failed",
            "workflow.triggered",
          ].includes(message.event)
        ) {
          fetchAutomations({ silent: true });
        }
      },
    });
    return stop;
  }, []);

  const rules = useMemo(
    () =>
      (workspace.rules || []).filter((rule) => {
        if (statusFilter === "enabled") return rule.enabled;
        if (statusFilter === "disabled") return !rule.enabled;
        return true;
      }),
    [workspace.rules, statusFilter]
  );

  const hasAutomations = (workspace.rules || []).length > 0;

  function updateCondition(index, patch) {
    setDraft((current) => ({
      ...current,
      conditions: {
        ...current.conditions,
        rules: current.conditions.rules.map((rule, ruleIndex) =>
          ruleIndex === index ? { ...rule, ...patch } : rule
        ),
      },
    }));
  }

  function addCondition() {
    setDraft((current) => ({
      ...current,
      conditions: {
        ...current.conditions,
        rules: [
          ...current.conditions.rules,
          { field: "task.status", operator: "eq", value: "blocked" },
        ],
      },
    }));
  }

  function removeCondition(index) {
    setDraft((current) => ({
      ...current,
      conditions: {
        ...current.conditions,
        rules: current.conditions.rules.filter((_, ruleIndex) => ruleIndex !== index),
      },
    }));
  }

  function updateAction(index, patch) {
    setDraft((current) => ({
      ...current,
      actions: current.actions.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...patch } : action
      ),
    }));
  }

  function addAction() {
    setDraft((current) => ({
      ...current,
      actions: [
        ...current.actions,
        {
          type: "create_activity",
          message: "Automation executed.",
        },
      ],
    }));
  }

  function removeAction(index) {
    setDraft((current) => ({
      ...current,
      actions: current.actions.filter((_, actionIndex) => actionIndex !== index),
    }));
  }

  async function saveRule(event) {
    event.preventDefault();
    try {
      const payload = {
        ...draft,
        project_id: draft.project_id ? Number(draft.project_id) : null,
      };
      if (selectedRule) {
        await api.put(`/automations/rules/${selectedRule.id}`, payload);
        toast.success("Automation updated");
      } else {
        await api.post("/automations/rules", payload);
        toast.success("Automation created");
      }
      setDraft(emptyDraft(workspace.triggers?.[0]?.key || "task.created"));
      setSelectedRule(null);
      fetchAutomations({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Failed to save automation");
    }
  }

  async function toggleRule(rule) {
    try {
      await api.patch(`/automations/rules/${rule.id}/toggle`, { enabled: !rule.enabled });
      fetchAutomations({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error("Failed to update automation");
    }
  }

  async function deleteRule(ruleId) {
    try {
      await api.delete(`/automations/rules/${ruleId}`);
      fetchAutomations({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete automation");
    }
  }

  async function testTrigger(rule) {
    try {
      await api.post("/automations/trigger", {
        trigger_type: rule.trigger_type,
        context: {
          project_id: rule.project_id,
          actor_id: Number(localStorage.getItem("user_id")) || null,
          entity_type: "automation",
          entity_id: rule.id,
          message: `Manual test for ${rule.name}`,
        },
      });
      toast.success("Workflow triggered");
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Failed to trigger workflow");
    }
  }

  function editRule(rule) {
    setSelectedRule(rule);
    setDraft({
      name: rule.name,
      description: rule.description || "",
      trigger_type: rule.trigger_type,
      scope: rule.scope,
      project_id: rule.project_id || "",
      enabled: rule.enabled,
      conditions: rule.conditions || { mode: "and", rules: [] },
      actions: rule.actions || [],
    });
  }

  function applyRecommendation(recommendation) {
    setSelectedRule(null);
    setDraft({
      ...emptyDraft(recommendation.trigger_type),
      name: recommendation.title,
      description: recommendation.reason,
      trigger_type: recommendation.trigger_type,
      actions: recommendation.actions || [],
    });
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="h-[720px] animate-pulse rounded-lg bg-slate-200" />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-slate-950 p-3 text-white">
              <Workflow size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-950">
                Automation Center
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Trigger workflows, route work, notify teams, and reduce operational friction.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 ring-1 ring-slate-200">
            <Radio size={16} className="text-emerald-600" />
            Realtime automation
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Enabled", workspace.metrics?.enabled || 0, CheckCircle2, "text-emerald-600"],
            ["Disabled", workspace.metrics?.disabled || 0, ToggleLeft, "text-slate-500 dark:text-slate-400"],
            ["Executions", workspace.metrics?.executions || 0, Zap, "text-blue-600"],
            ["Failures", workspace.metrics?.failures || 0, AlertTriangle, "text-rose-600"],
          ].map(([label, value, Icon, tone]) => (
            <div key={label} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/50">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
                <Icon size={18} className={tone} />
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <section className="rounded-xl border border-border bg-white dark:bg-slate-800 shadow-card">
            {error && (
              <div className="m-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
                <p className="text-sm font-medium text-red-700">
                  {error}
                </p>
              </div>
            )}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-secondary p-1">
                {["all", "enabled", "disabled"].map((option) => (
                  <button
                    key={option}
                    onClick={() => setStatusFilter(option)}
                    className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-150 ${
                      statusFilter === option ? "bg-white dark:bg-slate-800 text-text-primary shadow-card" : "text-text-tertiary hover:text-text-secondary"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setSelectedRule(null);
                  setDraft(emptyDraft(workspace.triggers?.[0]?.key || "task.created"));
                }}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm dark:shadow-slate-900/50 transition-all hover:bg-brand-700"
              >
                <Plus size={16} />
                New automation
              </button>
            </div>

            {!hasAutomations && (
              <div className="mx-4 mb-2 mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                <p className="text-xs leading-relaxed text-blue-700">
                  Automations run automatically when conditions are met — no manual work required.
                </p>
              </div>
            )}

            <div className="grid gap-0 py-2">
              {!hasAutomations ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                    <Zap className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    No automations yet
                  </p>
                  <p className="mb-5 max-w-[240px] text-xs leading-relaxed text-slate-400 dark:text-slate-500">
                    Create your first automation to trigger workflows, notify teams, and reduce manual work
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRule(null);
                      setDraft(emptyDraft(workspace.triggers?.[0]?.key || "task.created"));
                    }}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    New Automation
                  </button>
                </div>
              ) : rules.map((rule) => (
                <article key={rule.id} className="mx-4 my-2 cursor-pointer rounded-xl border border-border bg-surface-secondary/50 p-4 transition-all duration-150 hover:border-brand-200 hover:bg-white hover:shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button onClick={() => editRule(rule)} className="text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-text-primary">{rule.name}</h2>
                        <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-2xs font-semibold text-brand-600">
                          {rule.trigger_type}
                        </span>
                        <span className="rounded-full border border-border bg-surface-tertiary px-2 py-0.5 text-2xs font-semibold text-text-secondary">
                          {rule.scope}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {rule.description || "No description provided."}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => testTrigger(rule)}
                        className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                        title="Run workflow"
                      >
                        <Play size={18} />
                      </button>
                      <button
                        onClick={() => toggleRule(rule)}
                        className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100"
                        title="Toggle automation"
                      >
                        {rule.enabled ? <ToggleRight size={22} className="text-emerald-600" /> : <ToggleLeft size={22} />}
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-5">
                    {[
                      ["Actions", rule.actions?.length || 0],
                      ["Runs", rule.run_count || 0],
                      ["Failures", rule.failure_count || 0],
                      ["Last run", relativeTime(rule.last_run_at)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">{label}</p>
                        <p className="mt-0.5 text-xs font-bold text-text-primary">{value}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="m-4 rounded-xl border border-border bg-white dark:bg-slate-800 shadow-card">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
                <History size={18} className="text-slate-600 dark:text-slate-300" />
                <h2 className="font-bold text-slate-950">Execution History</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {(workspace.executions || []).length === 0 ? (
                  <div className="flex flex-col items-center gap-3 p-4 text-center">
                    <History className="h-5 w-5 text-slate-300" />
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      No runs yet. History will appear after automations execute.
                    </p>
                  </div>
                ) : (workspace.executions || []).slice(0, 12).map((execution) => (
                  <div key={execution.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-slate-950">{execution.trigger_type}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{relativeTime(execution.created_at)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      execution.status === "success"
                        ? "bg-emerald-50 text-emerald-700"
                        : execution.status === "failed"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}>
                      {execution.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <form onSubmit={saveRule} className="sticky top-6 rounded-xl border border-border bg-white dark:bg-slate-800 p-5 shadow-card">
              <div className="mb-5 flex items-center gap-2 border-b border-border pb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Settings2 className="h-4 w-4" />
                </div>
                <h2 className="text-base font-bold text-text-primary">
                  {selectedRule ? "Edit Workflow" : "Workflow Builder"}
                </h2>
              </div>
              <div className="space-y-4">
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Automation name"
                  className="control-input"
                  required
                />
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Describe what this workflow does"
                  className="control-input min-h-20"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={draft.trigger_type}
                    onChange={(event) => setDraft((current) => ({ ...current, trigger_type: event.target.value }))}
                    className="control-input"
                  >
                    {(workspace.triggers || []).map((trigger) => (
                      <option key={trigger.key} value={trigger.key}>{trigger.name}</option>
                    ))}
                  </select>
                  <select
                    value={draft.scope}
                    onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value }))}
                    className="control-input"
                  >
                    <option value="personal">Personal</option>
                    <option value="project" disabled={!canCreateScoped}>Project</option>
                    <option value="organization" disabled={!canCreateScoped}>Organization</option>
                  </select>
                </div>

                <select
                  value={draft.project_id}
                  onChange={(event) => setDraft((current) => ({ ...current, project_id: event.target.value }))}
                  className="control-input"
                >
                  <option value="">No project scope</option>
                  {(workspace.projects || []).map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>

                <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">Conditions</p>
                    <button type="button" onClick={addCondition} className="text-xs font-bold text-blue-700">
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {draft.conditions.rules.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Runs whenever the trigger occurs.</p>
                    ) : (
                      draft.conditions.rules.map((condition, index) => (
                        <div key={index} className="grid grid-cols-[1fr_86px_1fr_auto] gap-2">
                          <select
                            value={condition.field}
                            onChange={(event) => updateCondition(index, { field: event.target.value })}
                            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 text-xs"
                          >
                            {CONDITION_FIELDS.map((field) => (
                              <option key={field} value={field}>{field}</option>
                            ))}
                          </select>
                          <select
                            value={condition.operator}
                            onChange={(event) => updateCondition(index, { operator: event.target.value })}
                            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 text-xs"
                          >
                            <option value="eq">is</option>
                            <option value="neq">is not</option>
                            <option value="contains">contains</option>
                            <option value="exists">exists</option>
                          </select>
                          <input
                            value={condition.value || ""}
                            onChange={(event) => updateCondition(index, { value: event.target.value })}
                            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 text-xs"
                          />
                          <button type="button" onClick={() => removeCondition(index)} className="rounded-md px-2 text-slate-400 dark:text-slate-500 hover:bg-white hover:text-rose-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">Actions</p>
                    <button type="button" onClick={addAction} className="text-xs font-bold text-blue-700">
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {draft.actions.map((action, index) => (
                      <div key={index} className="space-y-2 rounded-md bg-white dark:bg-slate-800 p-2 ring-1 ring-slate-200">
                        <div className="flex gap-2">
                          <select
                            value={action.type}
                            onChange={(event) => updateAction(index, { type: event.target.value })}
                            className="min-w-0 flex-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs"
                          >
                            {ACTION_TYPES.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => removeAction(index)} className="rounded-md px-2 text-slate-400 dark:text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <input
                          value={action.message || action.title || action.status || action.priority || ""}
                          onChange={(event) => updateAction(index, { message: event.target.value, title: action.title || event.target.value })}
                          placeholder="Action value or message"
                          className="w-full rounded-md border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between rounded-md bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Enabled
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
                    className="h-4 w-4"
                  />
                </label>

                <button className="button-primary w-full">
                  <Bot size={16} />
                  {selectedRule ? "Save automation" : "Create automation"}
                </button>
              </div>
            </form>

            <section className="rounded-xl border border-border bg-white dark:bg-slate-800 shadow-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs font-bold uppercase tracking-widest text-text-tertiary">
                <Lightbulb className="h-3.5 w-3.5 text-status-warning" />
                <h2>AI Recommendations</h2>
              </div>
              <div className="space-y-3 p-4">
                {(workspace.recommendations || []).map((recommendation) => (
                  <button
                    key={recommendation.title}
                    onClick={() => applyRecommendation(recommendation)}
                    className="mb-3 w-full rounded-lg border-l-[3px] border-status-purple bg-status-purple/[0.04] p-3 text-left"
                  >
                    <p className="mb-0.5 text-xs font-semibold text-text-primary">{recommendation.title}</p>
                    <p className="text-xs leading-relaxed text-text-tertiary">{recommendation.reason}</p>
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-surface-secondary px-2 py-0.5 text-2xs font-medium text-text-tertiary">
                      <Clock3 size={13} />
                      {recommendation.trigger_type}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
}
