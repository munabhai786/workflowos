import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Bell,
  CheckCircle2,
  Clock3,
  FolderKanban,
  GitBranch,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";

import api from "../services/api";


const activityIcons = {
  project_created: FolderKanban,
  project_updated: GitBranch,
  project_completed: CheckCircle2,
  project_status_changed: GitBranch,
  user_assigned_to_project: UserPlus,
  task_created: Plus,
  task_assigned: UserPlus,
  task_moved: GitBranch,
  task_completed: CheckCircle2,
  task_deleted: Trash2,
};


function relativeTime(value) {
  if (!value) return "";

  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}


function getActivitiesPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}


export default function ActivityFeed({
  title = "Recent activity",
  projectId,
  limit = 20,
  compact = false,
}) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);

      const response = await api.get("/activity/", {
        params: {
          limit,
          ...(projectId ? { project_id: projectId } : {}),
        },
      });

      setActivities(
        getActivitiesPayload(response.data)
      );
    } catch (error) {
      console.error(error);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [limit, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(fetchActivities, 0);

    return () => window.clearTimeout(timer);
  }, [fetchActivities]);

  return (
    <section className="workspace-card">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-bold text-slate-950">
            {title}
          </h2>
          {!compact && (
            <p className="mt-1 text-sm text-slate-500">
              Grouped operational changes across projects, tasks, and decisions
            </p>
          )}
        </div>

        <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
          <Bell size={18} />
        </div>
      </div>

      <div
        className={`overflow-y-auto ${
          compact ? "max-h-72" : "max-h-[520px]"
        }`}
      >
        {loading ? (
          <div className="space-y-4 p-5">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="flex animate-pulse gap-3"
              >
                <div className="h-9 w-9 rounded-lg bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-slate-200" />
                  <div className="h-3 w-1/3 rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Clock3 size={22} />
            </div>
            <p className="mt-4 font-semibold text-slate-800">
              No activity yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Collaboration updates will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activities.map((activity) => {
              const Icon =
                activityIcons[activity.action_type] ||
                Bell;

              return (
                <div
                  key={activity.id}
                  className="group flex gap-3 px-5 py-4 transition hover:bg-slate-50"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white transition group-hover:scale-105">
                    <Icon size={17} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-5 text-slate-800">
                      {activity.message}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        {activity.user?.full_name ||
                          "System"}
                      </span>
                      {activity.project?.name && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          {activity.project.name}
                        </span>
                      )}
                      {activity.task?.title && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          {activity.task.title}
                        </span>
                      )}
                      <span>
                        {relativeTime(activity.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
