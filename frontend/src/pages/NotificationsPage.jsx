import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  Trash2,
  Filter,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";

import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";
import EmptyState from "../components/ui/EmptyState";


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
  critical: "bg-rose-100 text-rose-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-sky-100 text-sky-700",
};


function normalizeNotifications(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}


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


export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) => !notification.is_read
      ).length,
    [notifications]
  );

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);

      const params = {};
      if (filter === "unread") params.unread = true;
      if (filter === "high") params.priority = "high";
      if (filter === "smart") params.priority = "critical";

      const response = await api.get("/notifications/", { params });
      setNotifications(
        normalizeNotifications(response.data)
      );
    } catch (error) {
      console.error(error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const timer = window.setTimeout(fetchNotifications, 0);

    return () => window.clearTimeout(timer);
  }, [fetchNotifications]);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onMessage: (message) => {
        if (message.event === "notification.created") {
          fetchNotifications();
        }
      },
    });
    return stop;
  }, [fetchNotifications]);

  const markAsRead = async (notificationId) => {
    try {
      await api.put(
        `/notifications/${notificationId}/read`
      );

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                is_read: true,
              }
            : notification
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put("/notifications/read-all");

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          is_read: true,
        }))
      );
    } catch (error) {
      console.error(error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await api.delete(
        `/notifications/${notificationId}`
      );

      setNotifications((current) =>
        current.filter(
          (notification) =>
            notification.id !== notificationId
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  const runAction = async (notification, action) => {
    try {
      if (action.action === "mark_complete" && action.task_id) {
        await api.put(`/tasks/${action.task_id}`, { status: "completed" });
        await markAsRead(notification.id);
        toast.success("Task marked complete");
        fetchNotifications();
        return;
      }

      if (action.path) {
        navigate(action.path);
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Action failed");
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-lg bg-slate-200"
            />
          ))}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-950 p-3 text-white">
              <MessageSquare size={24} />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-slate-950">
                Collaboration
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Grouped updates, approvals, realtime activity, and AI-readable
                collaboration signals that keep execution aligned.
              </p>
            </div>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="button-primary"
          >
            <Check size={18} />
            Mark all as read
          </button>
        )}
      </div>

      <div className="workspace-card mb-6 flex flex-wrap items-center gap-2 p-3">
        <Filter size={17} className="text-slate-500 dark:text-slate-400" />
        {["all", "unread", "high", "smart"].map((option) => (
          <button
            key={option}
            onClick={() => setFilter(option)}
            className={`rounded-md px-3 py-1.5 text-sm font-bold capitalize ${
              filter === option
                ? "bg-slate-950 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="workspace-card p-5">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Total
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {notifications.length}
          </p>
        </div>
        <div className="workspace-card p-5">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Unread
          </p>
          <p className="mt-2 text-3xl font-bold text-sky-600">
            {unreadCount}
          </p>
        </div>
        <div className="workspace-card p-5">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Priority
          </p>
          <p className="mt-2 text-3xl font-bold text-rose-600">
            {
              notifications.filter(
                (notification) =>
                  notification.priority === "high" ||
                  notification.severity === "critical"
              ).length
            }
          </p>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-medium bg-white dark:bg-slate-800 p-2">
          <EmptyState
            icon={MessageSquare}
            title="All caught up"
            description="No unread collaboration signals right now"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((notification) => {
            const Icon =
              typeIcons[notification.type] || Info;
            const severity =
              notification.severity ||
              notification.type ||
              "low";

            const typeColor =
              notification.type === "warning" ||
              notification.type === "deadline" ||
              notification.type === "deadline_risk" ||
              notification.type === "sprint_risk" ||
              notification.type === "productivity_drop"
                ? "warning"
                : notification.type === "critical" ||
                  notification.type === "overdue_task" ||
                  notification.severity === "critical"
                ? "danger"
                : notification.type === "success" || notification.type === "milestone"
                ? "success"
                : notification.type === "automation" ||
                  notification.type === "ai" ||
                  notification.type === "ai_recommendation"
                ? "purple"
                : "info";
            const accentClass = {
              warning: "bg-status-warning",
              danger: "bg-status-danger",
              success: "bg-status-success",
              purple: "bg-status-purple",
              info: "bg-brand-500",
            }[typeColor];
            const iconClass = {
              warning: "bg-status-warning/10 text-status-warning",
              danger: "bg-status-danger/10 text-status-danger",
              success: "bg-status-success/10 text-status-success",
              purple: "bg-status-purple/10 text-status-purple",
              info: "bg-brand-500/10 text-brand-500",
            }[typeColor];

            return (
              <article
                key={notification.id}
                className={`group relative flex items-start gap-3 overflow-hidden rounded-xl border p-4 shadow-card transition-all duration-150 hover:bg-surface-secondary/50 hover:shadow-card-hover ${
                  notification.is_read
                    ? "border-slate-200 dark:border-slate-700"
                    : "border-sky-200 bg-sky-50/40"
                }`}
              >
                <span className={`absolute bottom-0 left-0 top-0 w-[3px] rounded-l-xl ${accentClass}`} />
                <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                  <Icon className="h-4 w-4" />
                </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold leading-snug text-text-primary">
                          {notification.title}
                        </h2>
                        {!notification.is_read && (
                          <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-semibold text-brand-600">
                            Unread
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full border border-status-purple/20 bg-status-purple/10 px-2 py-0.5 text-2xs font-semibold text-status-purple">
                          <Sparkles size={12} />
                          AI context
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                            severityStyles[severity] ||
                            severityStyles.low
                          }`}
                        >
                          {severity}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-text-secondary">
                        {notification.message}
                      </p>
                      <p className="mt-1.5 text-2xs font-medium text-text-tertiary">
                        {relativeTime(notification.created_at)}
                      </p>
                      {notification.actions?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {notification.actions.slice(0, 3).map((action) => (
                            <button
                              key={`${notification.id}-${action.label}`}
                              type="button"
                              onClick={() => runAction(notification, action)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                  <div className="ml-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    {!notification.is_read && (
                      <button
                        type="button"
                        onClick={() =>
                          markAsRead(notification.id)
                        }
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-all duration-150 hover:bg-surface-tertiary hover:text-text-primary"
                        title="Mark as read"
                      >
                        <CheckCircle2 size={19} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        deleteNotification(
                          notification.id
                        )
                      }
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-all duration-150 hover:bg-surface-tertiary hover:text-text-primary"
                      title="Delete notification"
                    >
                      <Trash2 size={19} />
                    </button>
                  </div>
              </article>
            );
          })}
        </div>
      )}
    </MainLayout>
  );
}
