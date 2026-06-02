import {
  useDraggable,
} from "@dnd-kit/core";

import {
  CSS,
} from "@dnd-kit/utilities";

import {
  CalendarClock,
  GripVertical,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  Trash2,
  UserRound,
} from "lucide-react";


export default function TaskCard({

  task,

  onOpen,

  onDelete,
}) {

  const userRole =
    localStorage.getItem(
      "user_role"
    );


  const canManageTasks =
    userRole === "Admin" ||
    userRole === "Manager";


  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useDraggable({

    id: task.id,
  });


  const style = {

    transform:
      CSS.Translate.toString(
        transform
      ),

    transition,
  };

  const isOverdue =
    task.due_date &&
    new Date(task.due_date) < new Date() &&
    task.status !== "completed";

  const hasRisk =
    isOverdue ||
    task.status === "blocked" ||
    task.priority === "high";


  return (

    <article
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen?.(task)}
      className="group rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[var(--line-strong)] hover:shadow-premium-sm"
    >


      {/* DRAG HANDLE */}

      <div className="mb-3 flex items-center justify-between gap-2">

        <button
          type="button"
          {...listeners}
          {...attributes}
          onClick={(event) => event.stopPropagation()}
          className="
            touch-none
            cursor-grab
            rounded-lg
            p-1
            text-slate-400
            hover:bg-slate-100
            hover:text-slate-700
            dark:hover:bg-zinc-800
            dark:hover:text-zinc-100
            active:cursor-grabbing
          "
        >

          <GripVertical size={18} />

        </button>

        {hasRisk && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${
            isOverdue || task.status === "blocked"
              ? "bg-rose-50 text-rose-700"
              : "bg-amber-50 text-amber-700"
          }`}>
            <AlertTriangle size={12} />
            {isOverdue ? "overdue" : task.status === "blocked" ? "blocked" : "risk"}
          </span>
        )}

      </div>


      {/* TITLE */}

      <h3 className="text-sm font-semibold leading-5 text-[var(--text-strong)]">

        {task.title}

      </h3>


      {/* DESCRIPTION */}

      <p className="mt-2 line-clamp-2 min-h-[38px] text-sm leading-5 text-[var(--text-muted)]">

        {task.description}

      </p>


      {/* PRIORITY */}

      <div className="mt-3 flex flex-wrap gap-2">

        <span
          className={`status-pill ${
            task.priority === "high"
              ? "bg-rose-50 text-rose-700"
              : task.priority === "medium"
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >

          {task.priority}

        </span>

        {(task.labels || []).slice(0, 2).map((label) => (

          <span
            key={label}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300"
          >

            {label}

          </span>

        ))}

      </div>


      {/* META */}

      <div className="mt-3 space-y-2 text-xs font-medium text-[var(--text-muted)]">

        <div className="flex items-center gap-2">

          <UserRound size={14} />

          <span>

            {task.assignee?.full_name || "Unassigned"}

          </span>

        </div>


        {task.due_date && (

          <div className={`flex items-center gap-2 ${isOverdue ? "font-bold text-rose-600" : ""}`}>

            <CalendarClock size={14} />

            <span>

              {
                new Intl.DateTimeFormat(
                  "en",
                  {
                    month: "short",
                    day: "numeric",
                  }
                ).format(
                  new Date(
                    task.due_date
                  )
                )
              }

            </span>

          </div>

        )}

      </div>


      {/* FOOTER */}

      <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">

        <button
          type="button"
          onClick={() => onOpen?.(task)}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
        >

          <MessageSquare size={15} />

          {task.comment_count || 0}

        </button>


        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">

          <Paperclip size={14} />

          {task.attachment_count || 0}

        </div>

      </div>


      {/* ACTIONS */}

      {
        canManageTasks && (

          <div className="mt-3 flex justify-end">

            <button
              type="button"

              onClick={(event) => {

                event.stopPropagation();

                onDelete(task.id, task.title);
              }}

              className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
            >

              <Trash2 size={18} />

            </button>

          </div>

        )
      }

    </article>
  );
}
