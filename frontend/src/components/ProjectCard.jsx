import { Trash2 } from "lucide-react";


export default function ProjectCard({
  project,
  onDelete,
}) {
  return (
    <div className="workspace-card group p-6">

      <div className="flex justify-between items-start mb-4">

        <div>
          <h2 className="text-xl font-semibold text-[var(--text-strong)]">
            {project.name}
          </h2>

          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-muted)]">
            {project.description}
          </p>
        </div>

        <button
          onClick={() =>
            onDelete(project.id)
          }
          className="rounded-lg p-2 text-rose-500 opacity-70 transition hover:bg-rose-50 hover:text-rose-700 group-hover:opacity-100"
        >
          <Trash2 size={20} />
        </button>

      </div>

      <div className="flex justify-between items-center mt-6">

        <span
          className={`px-3 py-1 rounded-full text-sm font-medium
          ${
            project.priority === "high"
              ? "bg-red-100 text-red-600"
              : project.priority === "medium"
              ? "bg-yellow-100 text-yellow-600"
              : "bg-green-100 text-green-600"
          }`}
        >
          {project.priority}
        </span>

        <span className="text-sm font-medium text-[var(--text-muted)]">
          {project.status}
        </span>

      </div>

    </div>
  );
}
