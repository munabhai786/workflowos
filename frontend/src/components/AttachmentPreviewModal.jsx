import { X } from "lucide-react";

import { useEffect, useMemo, useState } from "react";

import toast from "react-hot-toast";

import api from "../services/api";

export default function AttachmentPreviewModal({
  open,
  onClose,
  attachment,
}) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const mimeType = attachment?.mime_type || attachment?.content_type;

  useEffect(() => {
    if (!open || !attachment) return;

    let cancelled = false;
    let nextObjectUrl = null;

    Promise.resolve().then(() => {
      setLoading(true);
      setObjectUrl(null);
    });


    async function run() {
      try {
        const res = await api.get(
          `/attachments/${attachment.id}/download`,
          { responseType: "blob" }
        );
        if (cancelled) return;

        nextObjectUrl = URL.createObjectURL(res.data);
        setObjectUrl(nextObjectUrl);
      } catch {
        toast.error("Failed to load preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
      setLoading(false);
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [open, attachment?.id]);


  const title = useMemo(() => attachment?.original_filename || "Preview", [attachment]);

  if (!open || !attachment) return null;

  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf" || mimeType?.includes("pdf");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-700">{title}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {mimeType || "unknown"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[78vh] overflow-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-950" />
            </div>
          )}

          {!loading && objectUrl && isImage && (
            <img
              src={objectUrl}
              alt={title}
              className="w-full rounded-xl border border-slate-200"
            />
          )}

          {!loading && objectUrl && isPdf && (
            <iframe
              title={title}
              src={objectUrl}
              className="h-[78vh] w-full rounded-xl border border-slate-200 bg-slate-50"
            />
          )}

          {!loading && objectUrl && !isImage && !isPdf && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              Preview is available for images and PDFs only.
            </div>
          )}

          {!loading && !objectUrl && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              Failed to create preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

