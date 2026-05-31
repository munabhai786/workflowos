import { useEffect, useMemo, useRef, useState } from "react";

import { DndContext } from "@dnd-kit/core";
import { useSearchParams } from "react-router-dom";
import { Filter, Plus, Search, Signal, Sparkles } from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { logError } from "../utils/logger";
import { createRealtimeConnection } from "../services/realtime";
import KanbanColumn from "../components/KanbanColumn";
import TaskDiscussionPanel from "../components/TaskDiscussionPanel";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import StatCard from "../components/ui/StatCard";

const columns = [
  { id: "todo", title: "Todo", tone: "bg-slate-50 dark:bg-slate-900" },
  { id: "in_progress", title: "In Progress", tone: "bg-sky-50/60" },
  { id: "review", title: "Review", tone: "bg-amber-50/60" },
  { id: "blocked", title: "Blocked", tone: "bg-rose-50/60" },
  { id: "completed", title: "Completed", tone: "bg-emerald-50/60" },
];

const emptyForm = {
  title: "",
  description: "",
  project_id: "",
  assigned_to: "",
  priority: "medium",
  due_date: "",
  labels: "",
};

function normalize(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const taskTitleRef = useRef(null);

  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");

  const [formData, setFormData] = useState(emptyForm);
  const [selectedTask, setSelectedTask] = useState(null);
  const [socketStatus, setSocketStatus] = useState("disconnected");

  const [deleteConfirmation, setDeleteConfirmation] = useState({
    isOpen: false,
    taskId: null,
    taskTitle: null,
    isDeleting: false,
  });

  const userRole = localStorage.getItem("user_role");
  const canManageTasks = userRole === "Admin" || userRole === "Manager";
  const canCompleteTasks =
    canManageTasks ||
    userRole === "Team Member" ||
    userRole === "Freelancer";

  async function fetchData() {
    try {
      const [tasksResponse, projectsResponse, usersResponse] = await Promise.all([
        api.get("/tasks/"),
        api.get("/projects/"),
        api.get("/users/"),
      ]);

      setTasks(normalize(tasksResponse.data));
      setProjects(normalize(projectsResponse.data));
      setUsers(normalize(usersResponse.data));
    } catch (error) {
      logError(error, "Failed to load tasks, projects, and users");
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(fetchData, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (searchParams.get("quick") === "create") {
      window.setTimeout(() => taskTitleRef.current?.focus(), 80);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    return createRealtimeConnection({
      onStatus: setSocketStatus,
      onMessage: (message) => {
        if (
          [
            "task.created",
            "task.updated",
            "task.moved",
            "task.deleted",
            "comment.created",
            "attachment.created",
          ].includes(message.event)
        ) {
          fetchData();
        }
      },
    });
  }, []);

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const search = searchTerm.toLowerCase();

        const matchesSearch =
          task.title?.toLowerCase().includes(search) ||
          task.description?.toLowerCase().includes(search) ||
          task.assignee?.full_name?.toLowerCase().includes(search);

        const matchesPriority =
          priorityFilter === "all" || task.priority === priorityFilter;

        const matchesProject =
          projectFilter === "all" ||
          (projectFilter === "none"
            ? task.project_id == null
            : String(task.project_id) === projectFilter);

        return matchesSearch && matchesPriority && matchesProject;
      }),
    [tasks, searchTerm, priorityFilter, projectFilter]
  );

  function tasksFor(status) {
    return filteredTasks
      .filter((task) => task.status === status)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  const executionStats = useMemo(() => {
    const open = filteredTasks.filter((task) => task.status !== "completed");
    const blocked = filteredTasks.filter((task) => task.status === "blocked");
    const high = filteredTasks.filter(
      (task) => task.priority === "high" && task.status !== "completed"
    );
    const overdue = open.filter(
      (task) => task.due_date && new Date(task.due_date) < new Date()
    );

    return {
      open: open.length,
      blocked: blocked.length,
      high: high.length,
      overdue: overdue.length,
    };
  }, [filteredTasks]);

  function handleChange(event) {
    setFormData((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function createTask(event) {
    event.preventDefault();

    try {
      const projectId = formData.project_id ? Number(formData.project_id) : null;

      await api.post("/tasks/", {
        ...formData,
        project_id: projectId,
        assigned_to: formData.assigned_to ? Number(formData.assigned_to) : null,
        due_date: formData.due_date || null,
        labels: formData.labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
      });

      setFormData(emptyForm);
      toast.success("Task created successfully");
      window.dispatchEvent(new CustomEvent("task-created"));
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to create task");
    }
  }

  async function moveTask(taskId, status, position = 0) {
    const previousTasks = tasks;

    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              position,
            }
          : task
      )
    );

    try {
      await api.put(`/tasks/${taskId}/move`, { status, position });
      window.dispatchEvent(new CustomEvent("task-moved"));
      fetchData();
    } catch (error) {
      setTasks(previousTasks);
      toast.error(error?.response?.data?.detail || "Failed to move task");
    }
  }

  async function deleteTask(taskId) {
    try {
      setDeleteConfirmation((prev) => ({ ...prev, isDeleting: true }));

      await api.delete(`/tasks/${taskId}`, {
        headers: {
          role: localStorage.getItem("user_role"),
        },
      });

      setTasks((prev) => prev.filter((task) => task.id !== taskId));
      toast.success("Task deleted successfully");
      window.dispatchEvent(new CustomEvent("task-deleted"));

      setDeleteConfirmation({
        isOpen: false,
        taskId: null,
        taskTitle: null,
        isDeleting: false,
      });

      fetchData();
    } catch (error) {
      logError(error, "Failed to delete task", { taskId });
      toast.error(error?.response?.data?.detail || "Failed to delete task");
      setDeleteConfirmation((prev) => ({ ...prev, isDeleting: false }));
    }
  }

  function handleDeleteClick(taskId, taskTitle) {
    const title =
      taskTitle || tasks.find((task) => task.id === taskId)?.title || "this task";

    setDeleteConfirmation({
      isOpen: true,
      taskId,
      taskTitle: title,
      isDeleting: false,
    });
  }

  function handleDeleteConfirm() {
    if (deleteConfirmation.taskId) {
      deleteTask(deleteConfirmation.taskId);
    }
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id;
    const newStatus = over.id;

    if (!canManageTasks && newStatus !== "completed") {
      toast.error("You can only complete tasks");
      return;
    }

    moveTask(taskId, newStatus, tasksFor(newStatus).length);
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-[360px] skeleton-block xl:h-[620px]" />
          ))}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="workspace-shell">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="workspace-heading">
            <h1 className="workspace-title">Execution</h1>
            <p className="workspace-subtitle">
              Plan, move, discuss, attach, and complete work from one operating board.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300 shadow-sm dark:shadow-slate-900/50">
            <Signal
              size={17}
              className={
                socketStatus === "connected"
                  ? "text-emerald-600"
                  : "text-slate-400 dark:text-slate-500"
              }
            />
            {socketStatus}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Open work", executionStats.open, "info"],
            ["Blocked", executionStats.blocked, "danger"],
            ["High priority", executionStats.high, "purple"],
            ["Overdue", executionStats.overdue, "warning"],
          ].map(([label, value, accentColor]) => (
            <StatCard
              key={label}
              title={label}
              value={value}
              accentColor={accentColor}
            />
          ))}
        </div>

        <div className="workspace-card p-4">
          <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.8fr]">
            <label className="relative">
              <Search
                size={18}
                className="absolute left-3 top-3.5 text-slate-400 dark:text-slate-500"
              />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search tasks, descriptions, or assignees"
                className="control-input py-3 pl-10 pr-4"
              />
            </label>

            <label className="relative">
              <Filter
                size={18}
                className="absolute left-3 top-3.5 text-slate-400 dark:text-slate-500"
              />
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
                className="control-input py-3 pl-10 pr-4"
              >
                <option value="all">All priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>

            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="control-input"
            >
              <option value="all">All projects</option>
              <option value="none">No Project (Personal)</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {canManageTasks && (
          <form
            onSubmit={createTask}
            className="mb-5 rounded-xl border border-border bg-white p-4 shadow-card dark:bg-slate-800 sm:p-5"
          >
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-text-primary">
              <Sparkles size={17} className="text-blue-600" />
              Create focused work item
            </div>

            <div className="grid gap-3 2xl:grid-cols-[1fr_1.2fr_0.7fr_0.7fr_0.6fr_0.7fr_0.8fr_auto]">
              <input
                ref={taskTitleRef}
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Task title"
                className="control-input"
                required
              />
              <input
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Description"
                className="control-input"
              />
              <select
                name="project_id"
                value={formData.project_id}
                onChange={handleChange}
                className="control-input"
              >
                <option value="">No Project (Personal Task)</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>

              <select
                name="assigned_to"
                value={formData.assigned_to}
                onChange={handleChange}
                className="control-input"
              >
                <option value="">Assignee</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name}
                  </option>
                ))}
              </select>

              <select
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className="control-input"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>

              <input
                type="datetime-local"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                className="control-input"
              />

              <input
                name="labels"
                value={formData.labels}
                onChange={handleChange}
                placeholder="Labels"
                className="control-input"
              />

              <button type="submit" className="button-primary w-full">
                <Plus size={18} />
                Create
              </button>
            </div>
          </form>
        )}

        <DndContext onDragEnd={canCompleteTasks ? handleDragEnd : undefined}>
          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <div className="grid w-full min-w-[1080px] grid-cols-5 gap-3 pb-2 xl:min-w-0 xl:gap-4">
              {columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  id={column.id}
                  title={column.title}
                  tone={column.tone}
                  tasks={tasksFor(column.id)}
                  onOpen={setSelectedTask}
                  onDelete={(taskId, taskTitle) =>
                    handleDeleteClick(taskId, taskTitle)
                  }
                />
              ))}
            </div>
          </div>
        </DndContext>

        <TaskDiscussionPanel
          task={selectedTask}
          open={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          onChanged={fetchData}
        />

        <DeleteConfirmationModal
          isOpen={deleteConfirmation.isOpen}
          title="Confirm task deletion"
          description="This will permanently remove the task from your workspace."
          itemName={deleteConfirmation.taskTitle}
          isDeleting={deleteConfirmation.isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() =>
            setDeleteConfirmation({
              isOpen: false,
              taskId: null,
              taskTitle: null,
              isDeleting: false,
            })
          }
        />
      </div>
    </MainLayout>
  );
}

