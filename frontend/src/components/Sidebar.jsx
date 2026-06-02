import {
  useEffect,
  useState,
  useRef,
} from "react";

import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Brain,
  Bot,
  CalendarDays,
  Bell,
  Settings,
  Shield,
  LogOut,
  BarChart3,
  FileText,
  Workflow,
  Globe2,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import api from "../services/api";
import { featureFlags } from "../config/featureFlags";
import { createRealtimeConnection } from "../services/realtime";


export default function Sidebar({
  isOpen = false,
  setIsOpen = () => {},
}) {

  const location = useLocation();

  const navigate = useNavigate();

  const [latestActivity, setLatestActivity] = useState(null);
  const activityTimerRef = useRef(null);

  const role =
    localStorage.getItem(
      "user_role"
    );

  const userName =
    localStorage.getItem(
      "user_name"
    );

  const showActivity = (activity) => {
    if (!activity || !activity.message) return;

    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
    }

    setLatestActivity(activity);

    activityTimerRef.current = setTimeout(() => {
      setLatestActivity(null);
    }, 30000); // 30 seconds
  };

  async function fetchActivityPreview() {
    try {
      const response = await api.get(
        "/activity/",
        {
          params: {
            limit: 1,
          },
        }
      );
      const data = response.data?.data;
      if (Array.isArray(data) && data.length > 0) {
        const latest = data[0];
        const createdAt = new Date(latest.created_at || latest.timestamp);
        const diffMs = new Date() - createdAt;
        // Only show on page load if it's within the last 5 minutes
        if (diffMs < 300000) {
          showActivity(latest);
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    fetchActivityPreview();

    const stopRealtime = createRealtimeConnection({
      onMessage: (message) => {
        if (
          message.event === "activity.created" ||
          message.event.startsWith("task.") ||
          message.event.startsWith("project.") ||
          message.event.startsWith("comment.")
        ) {
          fetchActivityPreview();
        }
      },
    });

    const localEvents = [
      "project-created",
      "project-updated",
      "project-deleted",
      "task-created",
      "task-updated",
      "task-moved",
      "task-deleted",
      "comment-added",
    ];

    const handleLocalEvent = () => {
      fetchActivityPreview();
    };

    localEvents.forEach((evt) => {
      window.addEventListener(evt, handleLocalEvent);
    });

    return () => {
      stopRealtime();
      localEvents.forEach((evt) => {
        window.removeEventListener(evt, handleLocalEvent);
      });
      if (activityTimerRef.current) {
        clearTimeout(activityTimerRef.current);
      }
    };
  }, []);

  const logout = () => {
    localStorage.clear();
    navigate("/login");
  };


  const primaryNavItems = [

    {
      name: "Home",
      icon: LayoutDashboard,
      path: "/dashboard",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
        "Viewer",
      ],
    },

    {
      name: "Execution",
      icon: CheckSquare,
      path: "/tasks",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
      ],
    },

    {
      name: "AI Copilot",
      icon: Bot,
      path: "/ai-copilot",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
      ],
    },

    {
      name: "Planning",
      icon: CalendarDays,
      path: "/planning",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
        "Viewer",
      ],
    },

    {
      name: "Collaboration",
      icon: MessageSquare,
      path: "/notifications",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
        "Viewer",
      ],
    },
  ];

  const supportNavItems = [
    {
      name: "Projects",
      icon: FolderKanban,
      path: "/projects",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
        "Viewer",
      ],
    },

    {
      name: "AI Insights",
      icon: Brain,
      path: "/ai-insights",
      roles: [
        "Admin",
        "Manager",
      ],
    },

    {
      name: "AI Risk",
      icon: ShieldAlert,
      path: "/ai-risk",
      roles: [
        "Admin",
        "Manager",
      ],
    },

    {
      name: "Automations",
      icon: Workflow,
      path: "/automations",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
      ],
    },

    {
      name: "Approvals",
      icon: Shield,
      path: "/ai-approvals",
      roles: [
        "Admin",
        "Manager",
      ],
    },

    {
      name: "Team Analytics",
      icon: BarChart3,
      path: "/team-analytics",
      roles: [
        "Admin",
        "Manager",
      ],
    },

    {
      name: "Reports",
      icon: FileText,
      path: "/executive-reports",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
        "Viewer",
      ],
    },
    {
      name: "Summarizer",
      icon: Sparkles,
      path: "/summarizer",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
        "Viewer",
      ],
    },

    {
      name: "Notifications",
      icon: Bell,
      path: "/notifications",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
        "Viewer",
      ],
    },

    {
      name: "Integrations",
      icon: Globe2,
      path: "/integrations",
      featureFlag: "integrationsEnabled",
      roles: [
        "Admin",
        "Manager",
      ],
    },

    {
      name: "Admin Panel",
      icon: Shield,
      path: "/admin",
      roles: [
        "Admin",
      ],
    },

    {
      name: "Settings",
      icon: Settings,
      path: "/settings",
      roles: [
        "Admin",
        "Manager",
        "Team Member",
        "Freelancer",
        "Viewer",
      ],
    },
  ];


  return (

    <>
    {isOpen && (
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
        onClick={() => setIsOpen(false)}
        aria-label="Close navigation"
      />
    )}
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(84vw,260px)] flex-col border-r border-white/5 bg-[#0f0f1a] text-white shadow-sidebar transition-transform duration-300 lg:sticky lg:top-0 lg:z-30 lg:w-[240px] lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >


      {/* LOGO */}

      <div className="border-b border-white/5 px-5 py-5">

        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-white">
              WorkflowOS
            </h1>

            <p className="mt-0.5 text-xs font-medium tracking-wider text-white/40">

              AI workspace

            </p>
          </div>
        </Link>

      </div>


      {/* USER */}

      <div className="mx-3 mb-4 mt-3 rounded-xl border border-white/[0.08] bg-white/5 px-3 py-2.5">

        <h3 className="truncate text-sm font-semibold text-white">

          {userName || "User"}

        </h3>

        <p className="text-xs font-medium uppercase tracking-wider text-white/40">

          {role || "Viewer"}

        </p>

      </div>


      {/* NAVIGATION */}

      <nav className="min-h-0 flex-1 overflow-y-auto pb-4">

        <p className="mb-1 mt-4 px-5 py-2 text-2xs font-semibold uppercase tracking-widest text-white/30">
          Core workspace
        </p>

        <div className="space-y-1">
        {
          primaryNavItems
            .filter((item) =>
              item.roles.includes(role) &&
              (!item.featureFlag || featureFlags[item.featureFlag])
            )
            .map((item) => {

              const Icon = item.icon;

              const isActive =
                location.pathname === item.path;

              return (

                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={`mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                    isActive
                      ? "border border-brand-500/20 bg-brand-600/15 font-semibold text-brand-400"
                      : "font-medium text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                  }`}
                >

                  <Icon className="h-4 w-4" />

                  <span className="font-medium">
                    {item.name}
                  </span>

                </Link>

              );
            })
        }
        </div>

        <p className="mb-1 mt-4 px-5 py-2 text-2xs font-semibold uppercase tracking-widest text-white/30">
          Supporting tools
        </p>

        <div className="space-y-1">
        {
          supportNavItems
            .filter((item) =>
              item.roles.includes(role) &&
              (!item.featureFlag || featureFlags[item.featureFlag])
            )
            .map((item) => {

              const Icon = item.icon;

              const isActive =
                location.pathname === item.path;

              return (

                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={`mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                    isActive
                      ? "border border-brand-500/20 bg-brand-600/15 font-semibold text-brand-400"
                      : "font-medium text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                  }`}
                >

                  <Icon className="h-4 w-4" />

                  <span className="font-medium">
                    {item.name}
                  </span>

                </Link>

              );
            })
        }
        </div>

      </nav>


      {/* ACTIVITY SUMMARY */}
      <AnimatePresence>
        {latestActivity && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mx-3 mb-3 mt-auto rounded-xl border border-white/[0.08] bg-[#161622]/50 p-3 shadow-md backdrop-blur-sm"
          >
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/40">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span>Live activity</span>
              </div>
              <span className="text-[9px] font-medium lowercase tracking-normal text-brand-400">
                just now
              </span>
            </div>

            <p className="line-clamp-2 text-xs leading-relaxed text-white/80" title={latestActivity.message}>
              {latestActivity.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>


      {/* LOGOUT */}

        <button
          onClick={logout}
          className="mx-3 mb-4 flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/5 px-4 py-2.5 text-sm font-medium text-white/50 transition-all duration-150 hover:bg-white/10 hover:text-white/80"
        >

          <LogOut className="h-4 w-4" />

          Logout

        </button>

    </aside>
    </>
  );
}
