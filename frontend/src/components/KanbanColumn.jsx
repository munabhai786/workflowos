import {
  useDroppable,
} from "@dnd-kit/core";

import TaskCard from "./TaskCard";
import EmptyState from "./ui/EmptyState";
import { CheckSquare } from "lucide-react";


export default function KanbanColumn({
  id,
  title,
  tasks,
  tone = "bg-slate-100",
  onEdit,
  onOpen,
  onDelete,
}) {
  const { setNodeRef } =
    useDroppable({
      id,
    });

  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const highPriorityCount = tasks.filter((task) => task.priority === "high").length;

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[150px] rounded-xl border border-border p-3 transition-colors xl:min-h-[620px] ${tone}`}
    >

      <div className="mb-3 rounded-lg border border-border bg-white p-3 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
            {title}
          </h2>
            <span className="rounded-full border border-border bg-surface-secondary px-2.5 py-1 text-xs font-bold text-text-secondary">
            {tasks.length}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {highPriorityCount > 0 && (
            <span className="status-pill bg-amber-50 text-amber-700">
              {highPriorityCount} high
            </span>
          )}
          {blockedCount > 0 && (
            <span className="status-pill bg-rose-50 text-rose-700">
              {blockedCount} blocked
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-medium bg-white p-2">
            <EmptyState
              icon={CheckSquare}
              title="No work here"
              description="Create a focused work item above to get started"
            />
          </div>
        ) : tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onEdit={onEdit}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}

      </div>

    </div>
  );
}
