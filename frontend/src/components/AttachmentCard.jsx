import { Download, FileText, Image as ImageIcon, Trash2 } from "lucide-react";

export default function AttachmentCard({
  attachment,
  onPreview,
  onDownload,
  onDelete,
  canDelete,
}) {
  const mimeType = attachment?.mime_type || attachment?.content_type;
  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf" || mimeType?.includes("pdf");

  const sizeBytes = attachment?.file_size ?? attachment?.size ?? 0;

  return (
    <div className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-premium-sm">
      <button
        type="button"
        onClick={onPreview}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        title="Preview"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] ring-1 ring-[var(--line)]">
          {isImage ? (
            <ImageIcon size={18} className="text-slate-700" />
          ) : isPdf ? (
            <FileText size={18} className="text-rose-700" />
          ) : (
            <FileText size={18} className="text-slate-700" />
          )}
        </div>

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text-strong)]">
            {attachment.original_filename}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>{mimeType || "unknown"}</span>
            <span>•</span>
            <span>{Math.ceil(sizeBytes / 1024)} KB</span>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          title="Download"
        >
          <Download size={16} />
        </button>

        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

