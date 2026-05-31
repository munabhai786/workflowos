import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  FolderKanban,
  Info,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
  MailCheck,
  X,
} from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import ActivityFeed from "../components/ActivityFeed";
import UiStatCard from "../components/ui/StatCard";
import EmptyState from "../components/ui/EmptyState";


const initialFormData = {
  name: "",
  description: "",
  priority: "medium",
  status: "active",
  start_date: "",
  end_date: "",
  owner_id: "",
};

const validationRules = {
  name: {
    min: 20,
    max: 100,
  },
  description: {
    min: 100,
    max: 600,
  },
};


const statusOptions = [
  { value: "active", label: "Active" },
  { value: "planning", label: "Planning" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
];


const priorityStyles = {
  high: "bg-rose-50 text-rose-700 ring-rose-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};


const statusStyles = {
  active: "bg-sky-50 text-sky-700 ring-sky-200",
  planning: "bg-violet-50 text-violet-700 ring-violet-200",
  on_hold: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};


function formatDate(value) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}


function getDeadlineCountdown(project) {
  if (!project.end_date) return null;

  const deadline = new Date(`${project.end_date}T23:59:59`);
  const diff = deadline.getTime() - Date.now();

  if (diff <= 0) return "Overdue";

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (hours <= 12) {
    return `${hours}h ${minutes}m left`;
  }

  return null;
}


function normalizeProjects(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}


function validateProjectForm(formData) {
  const errors = {};
  const name = formData.name.trim();
  const description = formData.description.trim();

  if (!name) {
    errors.name = "Project title cannot be empty.";
  } else if (name.length < validationRules.name.min) {
    errors.name = "Project title must be at least 20 characters.";
  } else if (name.length > validationRules.name.max) {
    errors.name = "Project title cannot exceed 100 characters.";
  }

  if (!description) {
    errors.description = "Project description cannot be empty.";
  } else if (
    description.length < validationRules.description.min
  ) {
    errors.description =
      "Description must be at least 100 characters.";
  } else if (
    description.length > validationRules.description.max
  ) {
    errors.description =
      "Description cannot exceed 600 characters.";
  }

  if (!formData.start_date) {
    errors.start_date = "Start date is required.";
  }

  if (!formData.end_date) {
    errors.end_date = "End date is required.";
  }

  if (
    formData.start_date &&
    formData.end_date &&
    new Date(formData.end_date) <
      new Date(formData.start_date)
  ) {
    errors.end_date =
      "End date cannot be earlier than start date.";
  }

  return errors;
}


function validateProjectEditForm(formData, originalProject) {
  const errors = {};
  const nameChanged =
    formData.name !== (originalProject?.name || "");
  const descriptionChanged =
    formData.description !==
    (originalProject?.description || "");
  const startDateChanged =
    formData.start_date !==
    (originalProject?.start_date || "");
  const endDateChanged =
    formData.end_date !==
    (originalProject?.end_date || "");

  if (nameChanged) {
    const name = formData.name.trim();

    if (!name) {
      errors.name = "Project title cannot be empty.";
    } else if (name.length < validationRules.name.min) {
      errors.name = "Project title must be at least 20 characters.";
    } else if (name.length > validationRules.name.max) {
      errors.name = "Project title cannot exceed 100 characters.";
    }
  }

  if (descriptionChanged) {
    const description = formData.description.trim();

    if (!description) {
      errors.description = "Project description cannot be empty.";
    } else if (
      description.length < validationRules.description.min
    ) {
      errors.description =
        "Description must be at least 100 characters.";
    } else if (
      description.length > validationRules.description.max
    ) {
      errors.description =
        "Description cannot exceed 600 characters.";
    }
  }

  if (
    (startDateChanged || endDateChanged) &&
    !formData.start_date
  ) {
    errors.start_date = "Start date is required.";
  }

  if (
    (startDateChanged || endDateChanged) &&
    !formData.end_date
  ) {
    errors.end_date = "End date is required.";
  }

  if (
    formData.start_date &&
    formData.end_date &&
    new Date(formData.end_date) <
      new Date(formData.start_date)
  ) {
    errors.end_date =
      "End date cannot be earlier than start date.";
  }

  return errors;
}


function getApiErrorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item)
      .join(" ");
  }

  return "Failed to save project";
}


function FieldMessage({ error, helper }) {
  return (
    <p
      className={`mt-2 flex items-start gap-1.5 text-xs transition ${
        error
          ? "text-rose-600"
          : "text-slate-500 dark:text-slate-400"
      }`}
    >
      <Info
        size={13}
        className="mt-0.5 shrink-0"
      />
      <span>{error || helper}</span>
    </p>
  );
}


function CharacterCounter({ value, min, max }) {
  const length = value.trim().length;
  const isValid = length >= min && length <= max;

  return (
    <span
      className={`text-xs font-semibold ${
        isValid
          ? "text-emerald-600"
          : "text-slate-400 dark:text-slate-500"
      }`}
    >
      {length}/{max}
    </span>
  );
}


function Badge({ children, className }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}


function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {value}
          </p>
        </div>

        <div className={`rounded-lg p-3 ${tone}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}


function ProgressBar({ value }) {
  const progress = Math.min(
    Math.max(Number(value) || 0, 0),
    100
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span>Progress</span>
        <span>{progress}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-slate-900 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}


function ProjectTimeline({ project }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <CalendarDays size={14} />
        Timeline
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Start
          </p>
          <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
            {formatDate(project.start_date)}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Due
          </p>
          <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
            {formatDate(project.end_date)}
          </p>
        </div>
      </div>
    </div>
  );
}


function ProjectCard({
  project,
  canManageProjects,
  onEdit,
  onDelete,
}) {
  const countdown = getDeadlineCountdown(project);
  const isCritical =
    project.alert_level === "critical" ||
    (countdown && countdown !== "Overdue");

  const statusLabel =
    statusOptions.find(
      (option) => option.value === project.status
    )?.label || project.status;

  return (
    <article className="group rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50 transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                project.is_overdue
                  ? "bg-rose-50 text-rose-700 ring-rose-200"
                  : statusStyles[project.status] ||
                    statusStyles.active
              }
            >
              {project.is_overdue ? "Overdue" : statusLabel}
            </Badge>

            <Badge
              className={
                priorityStyles[project.priority] ||
                priorityStyles.medium
              }
            >
              {project.priority}
            </Badge>

            {isCritical && (
              <Badge className="animate-pulse bg-rose-50 text-rose-700 ring-rose-200">
                Critical
              </Badge>
            )}
          </div>

          <h3 className="mt-4 truncate text-lg font-bold text-slate-950">
            {project.name}
          </h3>

          <p className="mt-2 line-clamp-2 min-h-[40px] text-sm leading-5 text-slate-500 dark:text-slate-400">
            {project.description || "No description yet."}
          </p>
        </div>

        {canManageProjects && (
          <div className="flex shrink-0 items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
            <button
              type="button"
              onClick={() => onEdit(project)}
              className="rounded-lg p-2 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 hover:text-slate-950"
              title="Edit project"
            >
              <Edit3 size={17} />
            </button>

            <button
              type="button"
              onClick={() => onDelete(project.id)}
              className="rounded-lg p-2 text-slate-500 dark:text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              title="Delete project"
            >
              <Trash2 size={17} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-5">
        <ProgressBar value={project.progress} />
      </div>

      <div className="mt-5 grid gap-3">
        {countdown && (
          <div className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm">
            <span className="font-semibold text-rose-700">
              Deadline countdown
            </span>
            <span className="font-bold text-rose-800">
              {countdown}
            </span>
          </div>
        )}

        <ProjectTimeline project={project} />

        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex min-w-0 items-center gap-2 text-slate-500 dark:text-slate-400">
            <UserRound size={16} />
            <span className="truncate">
              {project.owner?.full_name || "Unassigned"}
            </span>
          </div>

          <div className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {project.completed_task_count || 0}/
            {project.task_count || 0} tasks
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>Alert status</span>
          <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
            {project.email_sent && (
              <MailCheck size={14} />
            )}
            {project.email_sent
              ? "Email sent"
              : project.alert_level || "none"}
          </span>
        </div>
      </div>
    </article>
  );
}


function ProjectSection({
  title,
  description,
  projects,
  icon: Icon,
  canManageProjects,
  onEdit,
  onDelete,
}) {
  if (!projects.length) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-slate-900 p-2 text-white">
          <Icon size={18} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-950">
            {title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            canManageProjects={canManageProjects}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}


function ProjectModal({
  open,
  mode,
  formData,
  users,
  saving,
  validationErrors,
  touchedFields,
  isFormValid,
  completionPercent,
  onClose,
  onChange,
  onBlur,
  onSubmit,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-lg bg-white dark:bg-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Project planning
            </p>
            <h2 className="text-2xl font-bold text-slate-950">
              {mode === "edit"
                ? "Edit Project"
                : "Create Project"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 hover:text-slate-950"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          className="max-h-[80vh] overflow-y-auto px-6 py-6"
        >
          <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Project quality gate
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Complete every required planning field before submission.
                </p>
              </div>
              <div
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  isFormValid
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {isFormValid
                  ? "Ready"
                  : "Needs input"}
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFormValid
                    ? "bg-emerald-500"
                    : "bg-slate-950"
                }`}
                style={{
                  width: `${completionPercent}%`,
                }}
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Project title</span>
                <CharacterCounter
                  value={formData.name}
                  min={validationRules.name.min}
                  max={validationRules.name.max}
                />
              </span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={onChange}
                onBlur={onBlur}
                maxLength={validationRules.name.max}
                className={`mt-2 w-full rounded-lg border px-4 py-3 text-slate-900 outline-none transition focus:ring-4 ${
                  validationErrors.name &&
                  touchedFields.name
                    ? "border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-100"
                    : "border-slate-300 focus:border-slate-900 focus:ring-slate-100"
                }`}
                required
              />
              <FieldMessage
                error={
                  touchedFields.name
                    ? validationErrors.name
                    : null
                }
                helper="Use a clear, specific title between 20 and 100 characters."
              />
            </label>

            <label className="md:col-span-2">
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Description</span>
                <CharacterCounter
                  value={formData.description}
                  min={validationRules.description.min}
                  max={validationRules.description.max}
                />
              </span>
              <span className="sr-only">
                Description
              </span>
              <textarea
                name="description"
                value={formData.description}
                onChange={onChange}
                onBlur={onBlur}
                rows="4"
                maxLength={validationRules.description.max}
                className={`mt-2 w-full resize-none rounded-lg border px-4 py-3 text-slate-900 outline-none transition focus:ring-4 ${
                  validationErrors.description &&
                  touchedFields.description
                    ? "border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-100"
                    : "border-slate-300 focus:border-slate-900 focus:ring-slate-100"
                }`}
              />
              <FieldMessage
                error={
                  touchedFields.description
                    ? validationErrors.description
                    : null
                }
                helper="Add goals, scope, stakeholders, and expected delivery details."
              />
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Status
              </span>
              <select
                name="status"
                value={formData.status}
                onChange={onChange}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
              >
                {statusOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Priority
              </span>
              <select
                name="priority"
                value={formData.priority}
                onChange={onChange}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Start date
              </span>
              <input
                type="date"
                name="start_date"
                value={formData.start_date || ""}
                onChange={onChange}
                onBlur={onBlur}
                className={`mt-2 w-full rounded-lg border px-4 py-3 outline-none transition focus:ring-4 ${
                  validationErrors.start_date &&
                  touchedFields.start_date
                    ? "border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-100"
                    : "border-slate-300 focus:border-slate-900 focus:ring-slate-100"
                }`}
              />
              <FieldMessage
                error={
                  touchedFields.start_date
                    ? validationErrors.start_date
                    : null
                }
                helper="Required for delivery planning and deadline intelligence."
              />
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                End date
              </span>
              <input
                type="date"
                name="end_date"
                value={formData.end_date || ""}
                onChange={onChange}
                onBlur={onBlur}
                className={`mt-2 w-full rounded-lg border px-4 py-3 outline-none transition focus:ring-4 ${
                  validationErrors.end_date &&
                  touchedFields.end_date
                    ? "border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-100"
                    : "border-slate-300 focus:border-slate-900 focus:ring-slate-100"
                }`}
              />
              <FieldMessage
                error={
                  touchedFields.end_date
                    ? validationErrors.end_date
                    : null
                }
                helper="Required. Must be the same day as or later than the start date."
              />
            </label>

            <label className="md:col-span-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Owner
              </span>
              <select
                name="owner_id"
                value={formData.owner_id || ""}
                onChange={onChange}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option
                    key={user.id}
                    value={user.id}
                  >
                    {user.full_name} - {user.role}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-200 dark:border-slate-700 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || !isFormValid}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && (
                <Loader2
                  size={18}
                  className="animate-spin"
                />
              )}
              {mode === "edit"
                ? "Save Changes"
                : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


export default function ProjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState({
    total: 0,
    active: 0,
    overdue: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_desc");
  const [formData, setFormData] = useState(initialFormData);
  const [touchedFields, setTouchedFields] = useState({});

  const userRole = localStorage.getItem("user_role");
  const canManageProjects =
    userRole === "Admin" || userRole === "Manager";

  const validationErrors = useMemo(
    () =>
      editingProject
        ? validateProjectEditForm(
            formData,
            editingProject
          )
        : validateProjectForm(formData),
    [editingProject, formData]
  );

  const isFormValid =
    Object.keys(validationErrors).length === 0;

  const completionPercent = useMemo(() => {
    const checks = [
      !validationErrors.name,
      !validationErrors.description,
      !validationErrors.start_date,
      !validationErrors.end_date,
    ];
    const completedChecks = checks.filter(Boolean).length;

    return Math.round(
      (completedChecks / checks.length) * 100
    );
  }, [validationErrors]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (searchParams.get("quick") === "create" && canManageProjects) {
      openCreateModal();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, canManageProjects]);

  async function fetchData() {
    try {
      setLoading(true);

      const [
        projectsResponse,
        usersResponse,
        analyticsResponse,
      ] = await Promise.all([
        api.get("/projects/"),
        api.get("/users/"),
        api.get("/projects/analytics/summary"),
      ]);

      setProjects(
        normalizeProjects(projectsResponse.data)
      );

      setUsers(
        Array.isArray(usersResponse.data)
          ? usersResponse.data
          : []
      );

      setAnalytics({
        total: analyticsResponse.data?.total || 0,
        active: analyticsResponse.data?.active || 0,
        overdue: analyticsResponse.data?.overdue || 0,
        completed:
          analyticsResponse.data?.completed || 0,
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to load projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  const openCreateModal = () => {
    setEditingProject(null);
    setFormData(initialFormData);
    setTouchedFields({});
    setModalOpen(true);
  };

  const openEditModal = (project) => {
    setEditingProject(project);
    setFormData({
      name: project.name || "",
      description: project.description || "",
      priority: project.priority || "medium",
      status: project.status || "active",
      start_date: project.start_date || "",
      end_date: project.end_date || "",
      owner_id: project.owner_id || "",
    });
    setTouchedFields({});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingProject(null);
    setFormData(initialFormData);
    setTouchedFields({});
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleBlur = (event) => {
    const { name } = event.target;

    setTouchedFields((current) => ({
      ...current,
      [name]: true,
    }));
  };

  const buildPayload = () => {
    const payload = {
      ...formData,
      owner_id: formData.owner_id
        ? Number(formData.owner_id)
        : null,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
    };

    if (!editingProject) {
      return payload;
    }

    const changedPayload = {};

    Object.entries(payload).forEach(([key, value]) => {
      let originalValue = editingProject[key];

      if (key === "owner_id") {
        originalValue = editingProject.owner_id || null;
      }

      if (["name", "description"].includes(key)) {
        originalValue = originalValue || "";
      }

      if (["start_date", "end_date"].includes(key)) {
        originalValue = originalValue || null;
      }

      if (value !== originalValue) {
        changedPayload[key] = value;
      }
    });

    return changedPayload;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canManageProjects) {
      toast.error("You have read-only access");
      return;
    }

    if (!isFormValid) {
      setTouchedFields({
        name: true,
        description: true,
        start_date: true,
        end_date: true,
      });
      toast.error("Please fix the project validation errors");
      return;
    }

    try {
      setSaving(true);

      if (editingProject) {
        await api.put(
          `/projects/${editingProject.id}`,
          buildPayload()
        );
        window.dispatchEvent(
          new CustomEvent("project-updated")
        );
        toast.success("Project updated successfully");
      } else {
        await api.post(
          "/projects/",
          buildPayload()
        );
        window.dispatchEvent(
          new CustomEvent("project-created")
        );
        toast.success("Project created successfully");
      }

      closeModal();
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(
        getApiErrorMessage(error)
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (projectId) => {
    if (!canManageProjects) {
      toast.error("You have read-only access");
      return;
    }

    const confirmed = window.confirm(
      "Delete this project? Related tasks will also be removed."
    );

    if (!confirmed) return;

    try {
      await api.delete(`/projects/${projectId}`);
      window.dispatchEvent(
        new CustomEvent("project-deleted")
      );
      toast.success("Project deleted successfully");
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(
        error?.response?.data?.detail ||
          "Failed to delete project"
      );
    }
  };

  const filteredProjects = useMemo(() => {
    const search = searchTerm.toLowerCase();

    return projects
      .filter((project) => {
        const ownerName =
          project.owner?.full_name?.toLowerCase() || "";

        const matchesSearch =
          project.name?.toLowerCase().includes(search) ||
          project.description
            ?.toLowerCase()
            .includes(search) ||
          ownerName.includes(search);

        const matchesStatus =
          statusFilter === "all"
            ? true
            : statusFilter === "overdue"
            ? project.is_overdue
            : project.status === statusFilter;

        const matchesPriority =
          priorityFilter === "all"
            ? true
            : project.priority === priorityFilter;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesPriority
        );
      })
      .sort((a, b) => {
        if (sortBy === "progress_desc") {
          return (b.progress || 0) - (a.progress || 0);
        }

        if (sortBy === "due_asc") {
          return (
            new Date(a.end_date || "9999-12-31") -
            new Date(b.end_date || "9999-12-31")
          );
        }

        if (sortBy === "name_asc") {
          return (a.name || "").localeCompare(
            b.name || ""
          );
        }

        return (
          new Date(b.created_at || 0) -
          new Date(a.created_at || 0)
        );
      });
  }, [
    projects,
    searchTerm,
    statusFilter,
    priorityFilter,
    sortBy,
  ]);

  const overdueProjects = filteredProjects.filter(
    (project) => project.is_overdue
  );

  const completedProjects = filteredProjects.filter(
    (project) =>
      !project.is_overdue &&
      (project.status === "completed" ||
        project.progress === 100)
  );

  const activeProjects = filteredProjects.filter(
    (project) =>
      !project.is_overdue &&
      project.status !== "completed" &&
      project.progress !== 100
  );

  if (loading) {
    return (
      <MainLayout>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-lg bg-slate-200"
            />
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div
              key={item}
              className="h-72 animate-pulse rounded-lg bg-slate-200"
            />
          ))}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-slate-950 p-3 text-white">
                <FolderKanban size={24} />
              </div>

              <div>
                <h1 className="text-4xl font-bold text-slate-950">
                  Projects
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Plan timelines, ownership, workload, and delivery status.
                </p>
              </div>
            </div>
          </div>

          {canManageProjects ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white shadow-sm dark:shadow-slate-900/50 transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
            >
              <Plus size={18} />
              New Project
            </button>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
              Read-only access
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <UiStatCard icon={LayoutGrid} title="Total Projects" value={analytics.total} accentColor="purple" />
          <UiStatCard icon={BarChart3} title="Active" value={analytics.active} accentColor="info" />
          <UiStatCard icon={AlertTriangle} title="Overdue" value={analytics.overdue} accentColor="danger" />
          <UiStatCard icon={CheckCircle2} title="Completed" value={analytics.completed} accentColor="success" />
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/50">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-3.5 text-slate-400 dark:text-slate-500"
              />
              <input
                type="text"
                placeholder="Search by project, description, or owner"
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(event.target.value)
                }
                className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-4 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="planning">Planning</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value)
              }
              className="rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
            >
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <div className="relative">
              <SlidersHorizontal
                size={18}
                className="absolute left-3 top-3.5 text-slate-400 dark:text-slate-500"
              />
              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value)
                }
                className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-4 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
              >
                <option value="created_desc">
                  Newest first
                </option>
                <option value="due_asc">
                  Due date
                </option>
                <option value="progress_desc">
                  Progress
                </option>
                <option value="name_asc">
                  Name
                </option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid gap-6 2xl:grid-cols-[1.4fr_0.6fr]">
          {filteredProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-medium bg-white dark:bg-slate-800 p-2 shadow-card">
              <EmptyState
                icon={FolderKanban}
                title="No projects match this view"
                description="Adjust your filters or create a new project plan"
                actionLabel={canManageProjects ? "+ New Project" : undefined}
                onAction={canManageProjects ? openCreateModal : undefined}
              />
            </div>
          ) : (
            <div className="space-y-10">
              <ProjectSection
                title="Overdue Projects"
                description="Projects past their due date and still open."
                icon={AlertTriangle}
                projects={overdueProjects}
                canManageProjects={canManageProjects}
                onEdit={openEditModal}
                onDelete={deleteProject}
              />

              <ProjectSection
                title="Active Projects"
                description="Current plans moving through delivery."
                icon={BarChart3}
                projects={activeProjects}
                canManageProjects={canManageProjects}
                onEdit={openEditModal}
                onDelete={deleteProject}
              />

              <ProjectSection
                title="Completed Projects"
                description="Finished work with all tasks complete or closed."
                icon={CheckCircle2}
                projects={completedProjects}
                canManageProjects={canManageProjects}
                onEdit={openEditModal}
                onDelete={deleteProject}
              />
            </div>
          )}

          <ActivityFeed
            title="Project activity"
            limit={18}
            compact
          />
        </div>
      </div>

      <ProjectModal
        open={modalOpen}
        mode={editingProject ? "edit" : "create"}
        formData={formData}
        users={users}
        saving={saving}
        onClose={closeModal}
        onChange={handleChange}
        onBlur={handleBlur}
        validationErrors={validationErrors}
        touchedFields={touchedFields}
        isFormValid={isFormValid}
        completionPercent={completionPercent}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
