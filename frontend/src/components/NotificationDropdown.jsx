import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  Loader2,
  MessageSquare,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";

import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";

import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";


const typeIcons = {
  warning: AlertTriangle,
  success: CheckCircle2,
  critical: AlertTriangle,
  info: Info,
  deadline_risk: Clock3,
  overdue_task: AlertTriangle,
  approval_reminder: ShieldCheck,
  assignment_notification: CheckCircle2,
  sprint_risk: TrendingDown,
  productivity_drop: TrendingDown,
  ai_recommendation: Bot,
  mention_alert: MessageSquare,
};


const severityStyles = {
  critical: "bg-rose-50 text-rose-700",
  high: "bg-orange-50 text-orange-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-50 text-slate-600",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-sky-50 text-sky-700",
};


function relativeTime(value) {
  if (!value) return "";

  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}


function normalizeNotifications(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}


export default function NotificationDropdown() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) => !notification.is_read
      ).length,
    [notifications]
  );

  async function fetchNotifications() {
    try {
      setLoading(true);

      const response = await api.get("/notifications/");
      setNotifications(
        normalizeNotifications(response.data)
      );
    } catch (error) {
      console.error(error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(fetchNotifications, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onMessage: (message) => {
        if (message.event === "notification.created") {
          if (message.title) {
            toast(message.title, {
              icon: message.severity === "critical" ? "!" : undefined,
            });
          }
          fetchNotifications();
        }
      },
    });
    return stop;
  }, []);

  const markAsRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id
          ? { ...notification, is_read: true }
          : notification
      )
    );
  };

  const markAllAsRead = async () => {
    await api.put("/notifications/read-all");
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        is_read: true,
      }))
    );
  };

  const runAction = async (event, notification, action) => {
    event.stopPropagation();

    if (action.action === "mark_complete" && action.task_id) {
      await api.put(`/tasks/${action.task_id}`, { status: "completed" });
      toast.success("Task marked complete");
      markAsRead(notification.id);
      fetchNotifications();
      return;
    }

    if (action.path) {
      setOpen(false);
      navigate(action.path);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface-secondary text-text-tertiary hover:text-text-primary"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-status-danger" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="font-bold text-slate-950">
                Notifications
              </p>
              <p className="text-xs text-slate-500">
                {unreadCount} unread
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                <Check size={14} />
                Read all
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-500">
                <Loader2
                  size={20}
                  className="animate-spin"
                />
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 8).map((notification) => {
                const Icon =
                  typeIcons[notification.type] || Info;
                const severity =
                  notification.severity ||
                  notification.type ||
                  "low";

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() =>
                      !notification.is_read &&
                      markAsRead(notification.id)
                    }
                    className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      notification.is_read
                        ? "bg-white"
                        : "bg-sky-50/60"
                    }`}
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                      <Icon size={16} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {notification.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {notification.message}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${
                            severityStyles[severity] ||
                            severityStyles.low
                          }`}
                        >
                          {severity}
                        </span>
                        <p className="text-xs text-slate-400">
                          {relativeTime(notification.created_at)}
                        </p>
                      </div>
                      {notification.actions?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {notification.actions.slice(0, 3).map((action) => (
                            <span
                              key={`${notification.id}-${action.label}`}
                              role="button"
                              tabIndex={0}
                              onClick={(event) => runAction(event, notification, action)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                            >
                              {action.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
