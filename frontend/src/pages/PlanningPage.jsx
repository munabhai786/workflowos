import { useEffect, useMemo, useState } from "react";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  GanttChartSquare,
  Layers3,
  Plus,
  Radio,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";
import EmptyState from "../components/ui/EmptyState";
import { CalendarSkeleton } from "../components/ui/SkeletonLoader";


const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_STYLES = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blocked: "bg-rose-50 text-rose-700 ring-rose-200",
  review: "bg-violet-50 text-violet-700 ring-violet-200",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-200",
  todo: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-200",
};
const VIEW_OPTIONS = ["month", "week", "day"];
const ZOOM_OPTIONS = ["week", "month", "quarter"];


function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}


function toDateKey(value) {
  const date = asDate(value);
  if (!date) return "";
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toISOString()
    .slice(0, 10);
}


function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}


function startOfWeek(value) {
  const date = new Date(value);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}


function endOfWeek(value) {
  const date = startOfWeek(value);
  date.setDate(date.getDate() + 6);
  return date;
}


function startOfMonth(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}


function endOfMonth(value) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}


function formatDate(value, options = {}) {
  const date = asDate(value);
  if (!date) return "Unscheduled";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: options.year === false ? undefined : "numeric",
  }).format(date);
}


function formatRange(start, end) {
  return `${formatDate(start, { year: false })} - ${formatDate(end, { year: false })}`;
}


function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


function getTaskStart(task) {
  return asDate(task.scheduled_start || task.due_date || task.scheduled_end);
}


function getTaskEnd(task) {
  return asDate(task.scheduled_end || task.due_date || task.scheduled_start);
}


function calendarRange(cursor, view) {
  if (view === "day") {
    return [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())];
  }
  if (view === "week") {
    return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index));
  }

  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days = [];
  let active = start;
  while (active <= end) {
    days.push(new Date(active));
    active = addDays(active, 1);
  }
  return days;
}


function timelineRange(projects, zoom) {
  const dates = [];
  projects.forEach((project) => {
    const projectStart = asDate(project.start_date);
    const projectEnd = asDate(project.end_date);
    if (projectStart) dates.push(projectStart);
    if (projectEnd) dates.push(projectEnd);
    (project.tasks || []).forEach((task) => {
      const start = getTaskStart(task);
      const end = getTaskEnd(task);
      if (start) dates.push(start);
      if (end) dates.push(end);
    });
    (project.milestones || []).forEach((milestone) => {
      const due = asDate(milestone.due_date);
      if (due) dates.push(due);
    });
  });

  const today = new Date();
  const min = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : today;
  const max = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : addDays(today, 60);
  const padding = zoom === "quarter" ? 30 : zoom === "month" ? 14 : 7;
  return {
    start: addDays(min, -padding),
    end: addDays(max, padding),
  };
}


function DraggableTask({ task, compact = false, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { type: "task", task },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.(task);
      }}
      className={`w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left shadow-sm dark:shadow-slate-900/50 transition ${
        compact ? "px-2 py-1.5" : "px-3 py-2.5"
      } ${isDragging ? "z-50 scale-[1.02] shadow-lg" : "hover:border-slate-300 hover:shadow"}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${task.priority === "high" ? "bg-rose-500" : task.priority === "low" ? "bg-emerald-500" : "bg-blue-500"}`} />
        <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900">
          {task.title}
        </p>
      </div>
      {!compact && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="truncate">{task.project?.name || "No project"}</span>
          <span>{task.estimate_points || 1} pts</span>
        </div>
      )}
    </button>
  );
}


function DropZone({ id, children, className = "" }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
    >
      {children}
    </div>
  );
}


function TaskModal({ task, onClose, onSchedule }) {
  const [start, setStart] = useState(toDateKey(task?.scheduled_start || task?.due_date));
  const [end, setEnd] = useState(toDateKey(task?.scheduled_end || task?.due_date));
  const [points, setPoints] = useState(task?.estimate_points || 1);

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-xl rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{task.title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{task.project?.name || "No project"}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:text-slate-900"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Start
            <input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            End
            <input
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Points
            <input
              type="number"
              min="1"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-4">
          <button
            onClick={() => onSchedule(task.id, start, end, points)}
            className="button-primary w-full sm:w-auto"
          >
            <CalendarDays size={16} />
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}


export default function PlanningPage() {
  const [workspace, setWorkspace] = useState({
    calendar: { tasks: [], milestones: [] },
    timeline: [],
    sprints: [],
    workload: [],
    ai_insights: [],
    projects: [],
    unscheduled_tasks: [],
  });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("month");
  const [activeTab, setActiveTab] = useState("calendar");
  const [cursor, setCursor] = useState(new Date());
  const [zoom, setZoom] = useState("month");
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);
  const [sprintDraft, setSprintDraft] = useState({
    name: "",
    goal: "",
    start_date: toDateKey(new Date()),
    end_date: toDateKey(addDays(new Date(), 14)),
    velocity: 20,
    project_id: "",
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function fetchPlanning({ silent = false } = {}) {
    try {
      const response = await api.get("/planning/workspace");
      setWorkspace(response.data || {});
    } catch (error) {
      console.error(error);
      if (!silent) toast.error("Failed to load planning data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(fetchPlanning, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onMessage: (message) => {
        if (
          [
            "task.rescheduled",
            "task.updated",
            "task.moved",
            "sprint.created",
            "sprint.updated",
            "roadmap.updated",
            "milestone.created",
          ].includes(message.event)
        ) {
          fetchPlanning({ silent: true });
        }
      },
    });

    return stop;
  }, []);

  const tasks = useMemo(
    () => [...(workspace.calendar?.tasks || []), ...(workspace.unscheduled_tasks || [])],
    [workspace]
  );

  const users = useMemo(() => {
    const byId = new Map();
    tasks.forEach((task) => {
      if (task.assignee?.id) byId.set(task.assignee.id, task.assignee);
    });
    (workspace.workload || []).forEach((row) => {
      if (row.user?.id) byId.set(row.user.id, row.user);
    });
    return Array.from(byId.values());
  }, [tasks, workspace.workload]);

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const projectOk = selectedProject === "all" || String(task.project_id || "") === selectedProject;
        const statusOk = selectedStatus === "all" || task.status === selectedStatus;
        const userOk = selectedUser === "all" || String(task.assigned_to || "") === selectedUser;
        return projectOk && statusOk && userOk;
      }),
    [tasks, selectedProject, selectedStatus, selectedUser]
  );

  const filteredTimeline = useMemo(
    () =>
      (workspace.timeline || [])
        .filter((project) => selectedProject === "all" || String(project.id) === selectedProject)
        .map((project) => ({
          ...project,
          tasks: (project.tasks || []).filter((task) => {
            const statusOk = selectedStatus === "all" || task.status === selectedStatus;
            const userOk = selectedUser === "all" || String(task.assigned_to || "") === selectedUser;
            return statusOk && userOk;
          }),
        })),
    [workspace.timeline, selectedProject, selectedStatus, selectedUser]
  );

  const days = useMemo(() => calendarRange(cursor, view), [cursor, view]);
  const rangeLabel = view === "day"
    ? formatDate(cursor)
    : `${formatDate(days[0], { year: false })} - ${formatDate(days[days.length - 1])}`;
  const timelineBounds = useMemo(() => timelineRange(filteredTimeline, zoom), [filteredTimeline, zoom]);
  const timelineDays = Math.max(1, Math.ceil((timelineBounds.end - timelineBounds.start) / DAY_MS));

  function shiftCursor(direction) {
    const next = new Date(cursor);
    if (view === "day") next.setDate(next.getDate() + direction);
    if (view === "week") next.setDate(next.getDate() + direction * 7);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    setCursor(next);
  }

  function updateTaskInWorkspace(taskId, patch) {
    setWorkspace((current) => ({
      ...current,
      calendar: {
        ...current.calendar,
        tasks: (current.calendar?.tasks || []).map((task) =>
          task.id === taskId ? { ...task, ...patch } : task
        ),
      },
      unscheduled_tasks: (current.unscheduled_tasks || []).filter((task) => task.id !== taskId),
      timeline: (current.timeline || []).map((project) => ({
        ...project,
        tasks: (project.tasks || []).map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
      })),
    }));
  }

  async function scheduleTask(taskId, start, end, points) {
    const scheduledStart = start ? `${start}T09:00:00` : null;
    const scheduledEnd = end ? `${end}T17:00:00` : scheduledStart;

    updateTaskInWorkspace(taskId, {
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      due_date: scheduledEnd,
      estimate_points: Number(points) || 1,
    });

    try {
      const response = await api.put(`/planning/tasks/${taskId}/schedule`, {
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        due_date: scheduledEnd,
        estimate_points: Number(points) || 1,
      });
      updateTaskInWorkspace(taskId, response.data);
      setSelectedTask(null);
      toast.success("Schedule updated");
      window.dispatchEvent(new CustomEvent("task-updated"));
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Failed to update schedule");
      fetchPlanning({ silent: true });
    }
  }

  async function addTaskToSprint(taskId, sprintId) {
    try {
      await api.post(`/planning/sprints/${sprintId}/tasks`, { task_id: taskId });
      toast.success("Sprint plan updated");
      fetchPlanning({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Failed to update sprint");
    }
  }

  async function createSprint(event) {
    event.preventDefault();
    try {
      await api.post("/planning/sprints", {
        ...sprintDraft,
        velocity: Number(sprintDraft.velocity) || 0,
        project_id: sprintDraft.project_id ? Number(sprintDraft.project_id) : null,
      });
      setSprintDraft({
        name: "",
        goal: "",
        start_date: toDateKey(new Date()),
        end_date: toDateKey(addDays(new Date(), 14)),
        velocity: 20,
        project_id: "",
      });
      toast.success("Sprint created");
      fetchPlanning({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Failed to create sprint");
    }
  }

  async function handleDragEnd(event) {
    const task = event.active?.data?.current?.task;
    const targetId = event.over?.id;
    if (!task || !targetId) return;

    const target = String(targetId);
    if (target.startsWith("day-")) {
      const dateKey = target.replace("day-", "");
      await scheduleTask(task.id, dateKey, dateKey, task.estimate_points || 1);
    }
    if (target.startsWith("sprint-")) {
      await addTaskToSprint(task.id, Number(target.replace("sprint-", "")));
    }
  }

  function barStyle(startValue, endValue) {
    const start = getTaskStart({ scheduled_start: startValue, due_date: startValue });
    const end = getTaskEnd({ scheduled_end: endValue, due_date: endValue }) || start;
    if (!start) return { display: "none" };
    const left = clamp(((start - timelineBounds.start) / DAY_MS / timelineDays) * 100, 0, 100);
    const width = clamp((((end || start) - start) / DAY_MS + 1) / timelineDays * 100, 2, 100 - left);
    return { left: `${left}%`, width: `${width}%` };
  }

  if (loading) {
    return (
      <MainLayout>
        <CalendarSkeleton />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="workspace-shell">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-slate-950 p-3 text-white">
                <CalendarDays size={26} />
              </div>
              <div>
                <h1 className="workspace-title">
                  Planning
                </h1>
                <p className="workspace-subtitle mt-0.5">
                  One planning system for calendar commitments, delivery timeline,
                  sprint scope, workload, and AI schedule risk.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-secondary p-1">
              {[
                ["calendar", CalendarDays],
                ["timeline", GanttChartSquare],
                ["sprints", Target],
                ["workload", Users],
              ].map(([tab, Icon]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-all duration-150 ${
                    activeTab === tab
                      ? "bg-white dark:bg-slate-800 text-text-primary shadow-card"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  <Icon size={16} />
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={selectedProject}
                onChange={(event) => setSelectedProject(event.target.value)}
                className="control-input"
              >
                <option value="all">All projects</option>
                {(workspace.projects || []).map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                className="control-input"
              >
                <option value="all">All statuses</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="review">Review</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
              </select>
              <select
                value={selectedUser}
                onChange={(event) => setSelectedUser(event.target.value)}
                className="control-input"
              >
                <option value="all">All owners</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name}</option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-text-secondary shadow-card">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Realtime planning
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
            <section className="min-w-0">
              {activeTab === "calendar" && (
                <div className="flex-1 overflow-hidden rounded-xl border border-border bg-white dark:bg-slate-800 shadow-card">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => shiftCursor(-1)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface-secondary transition-all hover:bg-surface-tertiary" title="Previous">
                        <ChevronLeft size={18} />
                      </button>
                      <h2 className="min-w-[220px] text-center text-base font-bold text-text-primary">
                        {rangeLabel}
                      </h2>
                      <button onClick={() => shiftCursor(1)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface-secondary transition-all hover:bg-surface-tertiary" title="Next">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-secondary p-1">
                      {VIEW_OPTIONS.map((option) => (
                        <button
                          key={option}
                          onClick={() => setView(option)}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                            view === option ? "bg-white dark:bg-slate-800 text-text-primary shadow-card" : "text-text-tertiary hover:text-text-secondary"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`grid ${view === "day" ? "grid-cols-1" : "grid-cols-7"}`}>
                    {days.map((day) => {
                      const key = toDateKey(day);
                      const dayTasks = filteredTasks.filter((task) =>
                        [task.scheduled_start, task.scheduled_end, task.due_date].some((value) => toDateKey(value) === key)
                      );
                      const milestones = (workspace.calendar?.milestones || []).filter((milestone) => toDateKey(milestone.due_date) === key);
                      const isCurrentMonth = day.getMonth() === cursor.getMonth();
                      const isToday = key === toDateKey(new Date());

                      return (
                        <DropZone
                          key={key}
                          id={`day-${key}`}
                          className={`min-h-[100px] cursor-pointer border-b border-r border-border p-2 transition-colors hover:bg-surface-secondary/50 ${
                            isToday ? "border-brand-200 bg-brand-50/50" : isCurrentMonth || view !== "month" ? "bg-white dark:bg-slate-800" : "bg-surface-secondary"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className={`${isToday ? "flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" : "text-sm font-medium text-text-secondary hover:text-text-primary"}`}>
                              {day.toLocaleDateString("en", { weekday: "short", day: "numeric" })}
                            </span>
                            {milestones.length > 0 && <Flag size={14} className="text-amber-500" />}
                          </div>
                          <div className="space-y-1.5">
                            {milestones.map((milestone) => (
                              <div key={milestone.id} className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                                {milestone.title}
                              </div>
                            ))}
                            {dayTasks.slice(0, view === "month" ? 3 : 12).map((task) => (
                              <DraggableTask key={task.id} task={task} compact={view === "month"} onOpen={setSelectedTask} />
                            ))}
                            {dayTasks.length > (view === "month" ? 3 : 12) && (
                              <p className="px-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                                +{dayTasks.length - 3} more
                              </p>
                            )}
                          </div>
                        </DropZone>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === "timeline" && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
                    <div>
                      <h2 className="font-bold text-slate-950">Enterprise Timeline</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{formatRange(timelineBounds.start, timelineBounds.end)}</p>
                    </div>
                    <div className="flex rounded-md bg-slate-100 dark:bg-slate-800 p-1">
                      {ZOOM_OPTIONS.map((option) => (
                        <button
                          key={option}
                          onClick={() => setZoom(option)}
                          className={`rounded px-3 py-1.5 text-xs font-bold capitalize ${
                            zoom === option ? "bg-white dark:bg-slate-800 text-slate-950 shadow-sm dark:shadow-slate-900/50" : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 overflow-x-auto p-4">
                    {filteredTimeline.map((project) => (
                      <div key={project.id} className="min-w-[760px] border-b border-slate-100 dark:border-slate-800 pb-5 last:border-0">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-slate-950">{project.name}</h3>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {formatDate(project.start_date)} to {formatDate(project.end_date)}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                            {project.progress || 0}% complete
                          </span>
                        </div>

                        <div className="relative h-8 rounded-md bg-slate-100 dark:bg-slate-800">
                          <div className="absolute inset-y-0 rounded-md bg-slate-900" style={barStyle(project.start_date, project.end_date)} />
                        </div>

                        <div className="mt-3 space-y-2">
                          {(project.tasks || []).map((task) => {
                            const overdue = getTaskEnd(task) && getTaskEnd(task) < new Date() && task.status !== "completed";
                            return (
                              <div key={task.id} className="grid grid-cols-[180px_1fr] items-center gap-3">
                                <button
                                  onClick={() => setSelectedTask(task)}
                                  className="truncate text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-950"
                                >
                                  {task.title}
                                </button>
                                <div className="relative h-7 rounded bg-slate-50 dark:bg-slate-900">
                                  <div
                                    className={`absolute inset-y-1 rounded-md ${overdue ? "bg-rose-500" : "bg-blue-600"}`}
                                    style={barStyle(task.scheduled_start || task.due_date, task.scheduled_end || task.due_date)}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          {(project.milestones || []).map((milestone) => (
                            <div key={`milestone-${milestone.id}`} className="grid grid-cols-[180px_1fr] items-center gap-3">
                              <span className="truncate text-xs font-bold text-amber-700">{milestone.title}</span>
                              <div className="relative h-7 rounded bg-slate-50 dark:bg-slate-900">
                                <div
                                  className="absolute top-0 h-7 w-1 rounded-full bg-amber-500"
                                  style={{ left: `${clamp(((asDate(milestone.due_date) - timelineBounds.start) / DAY_MS / timelineDays) * 100, 0, 100)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "sprints" && (
                <div className="space-y-4">
                  <form onSubmit={createSprint} className="grid gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/50 lg:grid-cols-[1fr_1fr_130px_130px_100px_120px_auto]">
                    <input
                      value={sprintDraft.name}
                      onChange={(event) => setSprintDraft((draft) => ({ ...draft, name: event.target.value }))}
                      placeholder="Sprint name"
                      className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                      required
                    />
                    <input
                      value={sprintDraft.goal}
                      onChange={(event) => setSprintDraft((draft) => ({ ...draft, goal: event.target.value }))}
                      placeholder="Sprint goal"
                      className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      value={sprintDraft.start_date}
                      onChange={(event) => setSprintDraft((draft) => ({ ...draft, start_date: event.target.value }))}
                      className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      value={sprintDraft.end_date}
                      onChange={(event) => setSprintDraft((draft) => ({ ...draft, end_date: event.target.value }))}
                      className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min="0"
                      value={sprintDraft.velocity}
                      onChange={(event) => setSprintDraft((draft) => ({ ...draft, velocity: event.target.value }))}
                      className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                    />
                    <select
                      value={sprintDraft.project_id}
                      onChange={(event) => setSprintDraft((draft) => ({ ...draft, project_id: event.target.value }))}
                      className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                    >
                      <option value="">Global</option>
                      {(workspace.projects || []).map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                    <button className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white">
                      <Plus size={16} />
                      Sprint
                    </button>
                  </form>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {(workspace.sprints || []).map((sprint) => (
                      <DropZone key={sprint.id} id={`sprint-${sprint.id}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/50">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-slate-950">{sprint.name}</h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sprint.goal || "No goal set"}</p>
                            <p className="mt-2 text-xs font-semibold text-slate-400 dark:text-slate-500">{formatRange(sprint.start_date, sprint.end_date)}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                            {sprint.status}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-4 gap-2">
                          {[
                            ["Velocity", sprint.velocity || 0],
                            ["Committed", sprint.metrics?.committed_points || 0],
                            ["Done", sprint.metrics?.completed_points || 0],
                            ["Progress", `${sprint.metrics?.completion_rate || 0}%`],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-md bg-slate-50 dark:bg-slate-900 p-3">
                              <p className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500">{label}</p>
                              <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 space-y-2">
                          {(sprint.tasks || []).length === 0 ? (
                            <p className="rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">
                              Drag tasks here to plan the sprint.
                            </p>
                          ) : (
                            sprint.tasks.map((task) => (
                              <DraggableTask key={task.id} task={task} onOpen={setSelectedTask} />
                            ))
                          )}
                        </div>
                      </DropZone>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "workload" && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
                  <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-3">
                    <h2 className="font-bold text-slate-950">Workload & Capacity</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Utilization, overload, and schedule conflicts.</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {(workspace.workload || []).map((row) => (
                      <div key={row.user?.id || row.user?.email || row.points} className="grid gap-4 px-4 py-4 lg:grid-cols-[220px_1fr_120px]">
                        <div>
                          <p className="font-bold text-slate-950">{row.user?.full_name || "Unassigned"}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{row.points || 0} planned points</p>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {Object.entries(row.days || {}).slice(0, 14).map(([day, value]) => (
                            <div key={day} className="min-h-[54px] rounded-md bg-slate-50 dark:bg-slate-900 p-2">
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{formatDate(day, { year: false })}</p>
                              <div className={`mt-2 h-3 rounded-full ${value > 8 ? "bg-rose-500" : value > 5 ? "bg-amber-500" : "bg-emerald-500"}`} />
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-end">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${row.overloaded ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {row.utilization || 0}% utilized
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
                  <Sparkles size={17} className="text-blue-600" />
                  <h2 className="font-bold text-slate-950">AI Planning</h2>
                </div>
                <div className="space-y-3 p-4">
                  {(workspace.ai_insights || []).slice(0, 5).map((insight, index) => (
                    <div key={`${insight.type}-${index}`} className="rounded-md bg-slate-50 dark:bg-slate-900 p-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={15} className={insight.severity === "critical" ? "text-rose-600" : "text-amber-600"} />
                        <p className="text-sm font-bold text-slate-950">{insight.title}</p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{insight.message}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm dark:shadow-slate-900/50">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
                  <Layers3 size={17} className="text-slate-600 dark:text-slate-300" />
                  <h2 className="font-bold text-slate-950">Backlog</h2>
                </div>
                <div className="max-h-[520px] space-y-2 overflow-y-auto p-4">
                  {filteredTasks.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No tasks match the current filters.</p>
                  ) : (
                    filteredTasks.slice(0, 20).map((task) => (
                      <div key={task.id} className="space-y-1">
                        <DraggableTask task={task} onOpen={setSelectedTask} />
                        <div className="flex items-center justify-between gap-2 px-1">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${STATUS_STYLES[task.status] || STATUS_STYLES.todo}`}>
                            {task.status}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                            <Clock3 size={11} className="mr-1 inline" />
                            {formatDate(task.scheduled_end || task.due_date, { year: false })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/50">
                <div className="mb-3 flex items-center gap-2">
                  <BarChart3 size={17} className="text-slate-600 dark:text-slate-300" />
                  <h2 className="font-bold text-slate-950">Roadmap Health</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-3">
                    <p className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500">Projects</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{workspace.projects?.length || 0}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-3">
                    <p className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500">Sprints</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{workspace.sprints?.length || 0}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-3">
                    <p className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500">Tasks</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{filteredTasks.length}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-3">
                    <p className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500">Milestones</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{workspace.calendar?.milestones?.length || 0}</p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>

        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSchedule={scheduleTask}
        />
      </DndContext>
    </MainLayout>
  );
}
