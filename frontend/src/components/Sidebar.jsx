import {
  useEffect,
  useState,
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
} from "lucide-react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { motion } from "framer-motion";

import api from "../services/api";
import { featureFlags } from "../config/featureFlags";


export default function Sidebar({
  isOpen = false,
  setIsOpen = () => {},
}) {

  const location = useLocation();

  const navigate = useNavigate();

  const [activityPreview, setActivityPreview] =
    useState([]);


  const role =
    localStorage.getItem(
      "user_role"
    );

  const userName =
    localStorage.getItem(
      "user_name"
    );


  async function fetchActivityPreview() {

    try {

      const response = await api.get(
        "/activity/",
        {
          params: {
            limit: 3,
          },
        }
      );

      setActivityPreview(
        Array.isArray(response.data?.data)
          ? response.data.data
          : []
      );

    } catch (error) {

      console.error(error);

      setActivityPreview([]);

    }

  }


  useEffect(() => {

    const timer = window.setTimeout(fetchActivityPreview, 0);

    return () => window.clearTimeout(timer);

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
    <motion.aside
      initial={false}
      animate={{ x: isOpen ? 0 : 0 }}
      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
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

      <div className="mx-3 mb-3 mt-auto rounded-xl border border-white/[0.06] bg-white/[0.04] p-3">

        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">

          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />

          <span>
            Live activity
          </span>

        </div>

        <div className="space-y-3">

          {activityPreview.length === 0 ? (

            <p className="border-b border-white/[0.04] py-1 text-xs leading-relaxed text-white/50 last:border-0">
              No recent collaboration updates.
            </p>

          ) : (

            activityPreview.map((activity) => (

              <div
                key={activity.id}
              className="border-b border-white/[0.04] py-1 text-xs leading-relaxed text-white/50 last:border-0"
              >
                {activity.message}
              </div>

            ))

          )}

        </div>

      </div>


      {/* LOGOUT */}

        <button
          onClick={logout}
          className="mx-3 mb-4 flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/5 px-4 py-2.5 text-sm font-medium text-white/50 transition-all duration-150 hover:bg-white/10 hover:text-white/80"
        >

          <LogOut className="h-4 w-4" />

          Logout

        </button>

    </motion.aside>
    </>
  );
}
