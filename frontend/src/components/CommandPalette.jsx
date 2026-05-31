import { useEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bot,
  CheckSquare,
  Command,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";


const navCommands = [
  { id: "nav-dashboard", title: "Go to dashboard", subtitle: "Workspace overview", path: "/dashboard", icon: LayoutDashboard, keywords: "home overview" },
  { id: "nav-projects", title: "Projects", subtitle: "Plans, owners, timelines", path: "/projects", icon: FolderKanban, keywords: "project planning" },
  { id: "nav-copilot", title: "AI Copilot", subtitle: "Ask WorkflowOS AI", path: "/ai-copilot", icon: Bot, keywords: "copilot chat ask ai" },
  { id: "nav-settings", title: "Settings", subtitle: "Account and workspace settings", path: "/settings", icon: Settings, keywords: "preferences account" },
  { id: "nav-analytics", title: "Analytics", subtitle: "Team intelligence", path: "/team-analytics", icon: BarChart3, keywords: "metrics reports productivity" },
  { id: "nav-risk", title: "AI Risk Prediction", subtitle: "Explainable delivery risks", path: "/ai-risk", icon: ShieldAlert, keywords: "risk prediction sprint delay workload bottleneck approval" },
  { id: "nav-approvals", title: "Approvals", subtitle: "Review AI actions", path: "/ai-approvals", icon: ShieldCheck, keywords: "approval review ai" },
  { id: "nav-reports", title: "Executive Reports", subtitle: "Generate AI reports", path: "/executive-reports", icon: FileText, keywords: "weekly sprint executive summary deadline" },
];

const actionCommands = [
  { id: "action-create-task", title: "Create task", subtitle: "Open the execution board", path: "/tasks?quick=create", icon: Plus, keywords: "new task todo work item" },
  { id: "action-create-project", title: "Create project", subtitle: "Open project creation", path: "/projects?quick=create", icon: FolderKanban, keywords: "new project plan" },
  { id: "action-ask-copilot", title: "Ask Copilot", subtitle: "Start an AI workspace question", path: "/ai-copilot", icon: Sparkles, keywords: "ask ai chat help" },
  { id: "action-generate-report", title: "Generate report", subtitle: "Create an executive report", path: "/executive-reports", icon: FileText, keywords: "weekly sprint report executive" },
  { id: "action-review-risk", title: "Review risk predictions", subtitle: "Open explainable risk dashboard", path: "/ai-risk", icon: ShieldAlert, keywords: "risk prediction failure delay burnout" },
];


function normalize(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}


function matches(command, query) {
  if (!query) return true;
  const haystack = `${command.title} ${command.subtitle || ""} ${command.keywords || ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => haystack.includes(part));
}


export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [workspaceData, setWorkspaceData] = useState({
    projects: [],
    tasks: [],
    users: [],
  });
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function isTypingTarget(target) {
      if (!target) return false;
      const tag = target.tagName?.toLowerCase?.() || "";
      const isEditable = !!target.isContentEditable;
      const isFormField = tag === "input" || tag === "textarea" || tag === "select";
      return isEditable || isFormField;
    }

    function handleKeyDown(event) {
      if (isTypingTarget(event.target)) return;

      const key = event.key?.toLowerCase?.() || "";

      // Ctrl/⌘ + K → toggle palette
      const isPaletteShortcut = (event.ctrlKey || event.metaKey) && key === "k";
      if (isPaletteShortcut) {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }

      // Shift + A → open AI Copilot
      const isCopilotShortcut = event.shiftKey && !event.ctrlKey && !event.metaKey && key === "a";
      if (isCopilotShortcut) {
        event.preventDefault();
        navigate("/ai-copilot");
        return;
      }

      if (key === "escape") {
        setOpen(false);
      }
    }

    function handleOpenPalette() {
      setOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("workflowos:open-command-palette", handleOpenPalette);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("workflowos:open-command-palette", handleOpenPalette);
    };
  }, [navigate]);


  useEffect(() => {
    if (!open) return;

    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 40);

    Promise.allSettled([
      api.get("/projects/"),
      api.get("/tasks/"),
      api.get("/users/"),
    ]).then(([projects, tasks, users]) => {
      setWorkspaceData({
        projects: projects.status === "fulfilled" ? normalize(projects.value.data) : [],
        tasks: tasks.status === "fulfilled" ? normalize(tasks.value.data) : [],
        users: users.status === "fulfilled" ? normalize(users.value.data) : [],
      });
    });
  }, [open]);

  const commands = useMemo(() => {
    const projectCommands = workspaceData.projects.slice(0, 12).map((project) => ({
      id: `project-${project.id}`,
      title: project.name,
      subtitle: `Project - ${project.status || "active"} - ${project.progress || 0}%`,
      path: "/projects",
      icon: FolderKanban,
      keywords: `${project.description || ""} ${project.owner?.full_name || ""}`,
    }));

    const taskCommands = workspaceData.tasks.slice(0, 16).map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      subtitle: `Task - ${task.status || "todo"}${task.project?.name ? ` - ${task.project.name}` : ""}`,
      path: "/tasks",
      icon: CheckSquare,
      keywords: `${task.description || ""} ${task.assignee?.full_name || ""} ${task.priority || ""}`,
    }));

    const userCommands = workspaceData.users.slice(0, 12).map((user) => ({
      id: `user-${user.id}`,
      title: user.full_name || user.email,
      subtitle: `User - ${user.role || "member"}`,
      path: "/team-analytics",
      icon: UserRound,
      keywords: `${user.email || ""} ${user.role || ""}`,
    }));

    return [
      ...actionCommands,
      ...navCommands,
      ...projectCommands,
      ...taskCommands,
      ...userCommands,
    ].filter((command) => matches(command, query));
  }, [query, workspaceData]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function execute(command) {
    if (!command) return;
    setOpen(false);
    navigate(command.path);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, commands.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      execute(commands[activeIndex]);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/35 px-3 py-20 backdrop-blur-sm sm:px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <Search className="h-5 w-5 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search commands, projects, tasks, users"
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-slate-950 outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Close command palette"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[62vh] overflow-y-auto p-2">
              {commands.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                  <Command className="mb-3 h-7 w-7 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No matching commands</p>
                  <p className="mt-1 text-xs text-slate-400">Try a project, task, user, or page name.</p>
                </div>
              ) : (
                commands.map((command, index) => {
                  const Icon = command.icon;
                  const active = index === activeIndex;

                  return (
                    <button
                      type="button"
                      key={command.id}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => execute(command)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left ${
                        active
                          ? "bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          active
                            ? "bg-white/10 dark:bg-slate-950/10"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{command.title}</span>
                        <span className={`block truncate text-xs ${active ? "text-white/65 dark:text-slate-600" : "text-slate-400"}`}>
                          {command.subtitle}
                        </span>
                      </span>
                      {active && <span className="hidden rounded-md bg-white/10 px-2 py-1 text-xs font-bold sm:inline">Enter</span>}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs font-semibold text-slate-400 dark:border-slate-800">
              <span>Ctrl K</span>
              <span>Shift A → Copilot • Arrow keys to move, Enter to open</span>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
