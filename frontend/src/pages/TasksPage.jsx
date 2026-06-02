import { useEffect, useMemo, useRef, useState } from "react";

import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useSearchParams } from "react-router-dom";
import { Filter, Loader2, Paperclip, Plus, Search, Signal, Sparkles, X } from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { logError } from "../utils/logger";
import { createRealtimeConnection } from "../services/realtime";
import KanbanColumn from "../components/KanbanColumn";
import TaskWorkspace from "../components/TaskWorkspace";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import StatCard from "../components/ui/StatCard";
import { KanbanBoardSkeleton } from "../components/ui/SkeletonLoader";

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

const allowedFileExtensions = [
  "pdf",
  "doc",
  "docx",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "mp3",
  "wav",
  "m4a",
  "csv",
  "xlsx",
  "pptx",
];

const acceptedFileTypes = allowedFileExtensions.map((ext) => `.${ext}`).join(",");

function getFileExtension(fileName = "") {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalize(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const taskTitleRef = useRef(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 5,
    },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");

  const [formData, setFormData] = useState(emptyForm);
  const [pendingTaskFiles, setPendingTaskFiles] = useState([]);
  const [creatingTask, setCreatingTask] = useState(false);
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

  function handleTaskFileSelection(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const validFiles = [];
    const rejectedFiles = [];

    files.forEach((file) => {
      const extension = getFileExtension(file.name);
      if (allowedFileExtensions.includes(extension)) {
        validFiles.push(file);
      } else {
        rejectedFiles.push(file.name);
      }
    });

    if (rejectedFiles.length > 0) {
      toast.error(`Unsupported file type: ${rejectedFiles[0]}`);
    }

    if (validFiles.length > 0) {
      setPendingTaskFiles((current) => [...current, ...validFiles]);
    }

    event.target.value = "";
  }

  function removePendingTaskFile(index) {
    setPendingTaskFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function createTask(event) {
    event.preventDefault();

    try {
      setCreatingTask(true);
      const projectId = formData.project_id ? Number(formData.project_id) : null;

      const response = await api.post("/tasks/", {
        ...formData,
        project_id: projectId,
        assigned_to: formData.assigned_to ? Number(formData.assigned_to) : null,
        due_date: formData.due_date || null,
        labels: formData.labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
      });

      const createdTaskId = response.data?.id;
      if (createdTaskId && pendingTaskFiles.length > 0) {
        await Promise.all(
          pendingTaskFiles.map((file) => {
            const uploadForm = new FormData();
            uploadForm.append("file", file);
            return api.post(`/tasks/${createdTaskId}/files`, uploadForm, {
              headers: { "Content-Type": "multipart/form-data" },
            });
          })
        );
      }

      setFormData(emptyForm);
      setPendingTaskFiles([]);
      toast.success(
        pendingTaskFiles.length > 0
          ? "Task created with files"
          : "Task created successfully"
      );
      window.dispatchEvent(new CustomEvent("task-created"));
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to create task");
    } finally {
      setCreatingTask(false);
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
        <KanbanBoardSkeleton />
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
          <div className="grid gap-3 grid-cols-1 md:grid-cols-3 xl:grid-cols-[1.4fr_0.8fr_0.8fr]">
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
                  {project.name.length > 30 ? project.name.slice(0, 30) + "..." : project.name}
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

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-[1fr_1.2fr_0.7fr_0.7fr_0.6fr_0.7fr_0.8fr]">
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
                    {project.name.length > 30 ? project.name.slice(0, 30) + "..." : project.name}
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
                    {user.full_name.length > 30 ? user.full_name.slice(0, 30) + "..." : user.full_name}
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

            </div>

            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/30">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <Paperclip size={16} className="text-slate-500" />
                    Attachments
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Optional files: pdf, doc, docx, txt, images, audio, csv, xlsx, pptx.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                  <Paperclip size={14} />
                  Upload files
                  <input
                    type="file"
                    multiple
                    accept={acceptedFileTypes}
                    onChange={handleTaskFileSelection}
                    className="hidden"
                  />
                </label>
              </div>

              {pendingTaskFiles.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {pendingTaskFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.lastModified}-${index}`}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-700 dark:text-slate-200">
                          {file.name}
                        </div>
                        <div className="text-slate-400">{formatFileSize(file.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePendingTaskFile(index)}
                        className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        title="Remove file"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                className="button-primary w-full sm:w-auto"
                disabled={creatingTask}
              >
                {creatingTask ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Create Task
              </button>
            </div>
          </form>
        )}

        <DndContext sensors={sensors} onDragEnd={canCompleteTasks ? handleDragEnd : undefined}>
          <div className="-mx-3 overflow-x-auto px-3 xl:mx-0 xl:overflow-x-visible xl:px-0">
            <div className="flex flex-col w-full gap-3 pb-2 xl:grid xl:grid-cols-5 xl:min-w-0 xl:gap-4">
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

        <TaskWorkspace
          task={selectedTask}
          open={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          onChanged={fetchData}
          projects={projects}
          users={users}
        />
      </div>

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
    </MainLayout>
  );
}
