import {
  Menu,
  Moon,
  Search,
  Sun,
} from "lucide-react";

import useAuthStore from "../store/authStore";
import useThemeStore from "../store/themeStore";
import NotificationDropdown from "./NotificationDropdown";


export default function Topbar({
  setIsOpen,
}) {
  const { user } = useAuthStore();
  const { isDark, toggleDark } = useThemeStore();

  const userName =
    user?.full_name ||
    localStorage.getItem("user_name") ||
    "User";

  const userEmail =
    user?.email ||
    localStorage.getItem("user_email") ||
    "";

  const avatarUrl =
    user?.avatar_url ||
    localStorage.getItem("user_avatar_url") ||
    "";


  return (
    <header className="sticky top-0 z-10 flex min-w-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_0_#e2e8f0] transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:gap-4 sm:px-5 lg:px-6">

      <div className="flex min-w-0 items-center gap-2 sm:gap-4">

        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 lg:hidden"
          onClick={() =>
            setIsOpen(true)
          }
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>

        <div className="hidden min-w-0 md:block">

          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Workspace
          </h1>

          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
            AI-native project execution
          </p>

        </div>

      </div>


      <div className="mx-auto hidden min-w-0 max-w-lg flex-1 xl:block">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 pl-9 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:border-brand-400 focus:outline-none focus:shadow-glow dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
            placeholder="Search projects, tasks, comments, and AI context"
            readOnly
            onFocus={() => window.dispatchEvent(new CustomEvent("workflowos:open-command-palette"))}
            onClick={() => window.dispatchEvent(new CustomEvent("workflowos:open-command-palette"))}
          />
        </label>
      </div>


      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">

        <button
          type="button"
          onClick={toggleDark}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        <NotificationDropdown />

        <div className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-brand-600 text-xs font-bold text-white ring-1 ring-slate-200 dark:ring-slate-700">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="h-full w-full object-cover"
            />
          ) : (
            userName?.charAt(0)
          )}
        </div>

        <div className="hidden sm:block">

          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {userName}
          </p>

          <p className="max-w-[140px] truncate text-xs text-slate-400 dark:text-slate-500">
            {userEmail}
          </p>

        </div>

      </div>

    </header>
  );
}
