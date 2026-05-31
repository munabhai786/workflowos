import {
  Trash2,
  CheckCircle,
} from "lucide-react";


export default function NotificationCard({
  notification,
  onRead,
  onDelete,
}) {
  return (
    <div
      className={`workspace-card p-5
      ${
        notification.is_read
          ? "opacity-70"
          : "border-indigo-300"
      }`}
    >

      <div className="flex justify-between items-start">

        <div>

          <h3 className="text-lg font-semibold text-[var(--text-strong)]">
            {notification.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            {notification.message}
          </p>

        </div>

        <div className="flex gap-3">

          {!notification.is_read && (
            <button
              onClick={() =>
                onRead(notification.id)
              }
              className="rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700"
            >
              <CheckCircle size={20} />
            </button>
          )}

          <button
            onClick={() =>
              onDelete(notification.id)
            }
            className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 size={20} />
          </button>

        </div>

      </div>


      <div className="flex justify-between items-center mt-5">

        <span
          className={`px-3 py-1 rounded-full text-xs font-medium
          ${
            notification.type === "warning"
              ? "bg-yellow-100 text-yellow-700"
              : notification.type === "success"
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {notification.type}
        </span>

        <span className="text-xs font-medium text-[var(--text-muted)]">
          {notification.is_read
            ? "Read"
            : "Unread"}
        </span>

      </div>

    </div>
  );
}
