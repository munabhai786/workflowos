import { useEffect, useMemo, useState } from "react";

import {
  CheckCircle2,
  MessageSquare,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";


import toast from "react-hot-toast";

import api from "../services/api";
import AttachmentCard from "./AttachmentCard";
import AttachmentPreviewModal from "./AttachmentPreviewModal";




function initials(name) {
  return (name || "U").charAt(0).toUpperCase();
}


function relativeTime(value) {
  if (!value) return "";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}


export default function TaskDiscussionPanel({
  task,
  open,
  onClose,
  onChanged,
}) {
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [body, setBody] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);


  const role = localStorage.getItem("user_role");
  const canDelete = role === "Admin" || role === "Manager";

  async function fetchThread() {
    if (!task?.id) return;

    const [commentResponse, attachmentResponse] = await Promise.all([
      api.get(`/tasks/${task.id}/comments`),
      api.get("/attachments/", {
        params: { task_id: task.id },
      }),
    ]);

    setComments(
      Array.isArray(commentResponse.data) ? commentResponse.data : []
    );
    setAttachments(
      Array.isArray(attachmentResponse.data) ? attachmentResponse.data : []
    );
  }


  useEffect(() => {
    let didCancel = false;

    async function run() {
      if (!open) return;
      if (didCancel) return;
      await fetchThread();
    }

    run();

    return () => {
      didCancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);



  const rootComments = useMemo(
    () => comments.filter((comment) => !comment.parent_id),
    [comments]
  );

  async function submitComment(event) {
    event.preventDefault();
    if (!body.trim()) return;

    try {
      await api.post(`/tasks/${task.id}/comments`, { body });
      setBody("");
      await fetchThread();
      onChanged?.();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to add comment");
    }
  }

  async function deleteComment(commentId) {
    try {
      await api.delete(`/comments/${commentId}`);
      await fetchThread();
      onChanged?.();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to delete comment");
    }
  }

  async function uploadFile(file) {
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    try {
      setUploading(true);
      setUploadProgress(0);

      await api.post("/attachments/", form, {
        params: { task_id: task.id },
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (p) => {
          if (!p?.total) return;
          const pct = Math.round((p.loaded * 100) / p.total);
          setUploadProgress(pct);
        },
      });

      await fetchThread();
      onChanged?.();
      toast.success("File attached");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      event?.target && (event.target.value = "");
    }
  }

  async function onFileInputChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    event.target.value = "";
  }


  if (!open || !task) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
      <aside className="flex h-dvh w-full max-w-3xl flex-col bg-white shadow-2xl">
        <header className="border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <MessageSquare size={16} />
                Execution workspace
              </div>
              <h2 className="mt-2 break-words text-xl font-bold text-slate-950 sm:text-2xl">
                {task.title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Comments, attachments, activity, and AI guidance stay attached
                to the work instead of scattered across the workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Status</p>
              <p className="mt-2 text-sm font-bold capitalize text-slate-950">
                {task.status || "todo"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Priority</p>
              <p className="mt-2 text-sm font-bold capitalize text-slate-950">
                {task.priority || "medium"}
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="flex items-center gap-1 text-xs font-bold uppercase text-blue-700">
                <Sparkles size={13} />
                AI focus
              </p>
              <p className="mt-2 text-sm font-bold text-blue-800">
                Review next action
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <Sparkles size={18} className="mt-0.5 shrink-0 text-blue-700" />
              <div>
                <p className="font-bold text-blue-950">AI execution note</p>
                <p className="mt-1 text-sm leading-6 text-blue-800">
                  Keep the next decision explicit: clarify owner, due date,
                  blocker, or acceptance criteria before moving this task.
                </p>
              </div>
            </div>
          </div>

          <div
            className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer?.files?.[0];
              if (!f || uploading) return;
              await uploadFile(f);
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-bold text-slate-700">Attachments</span>

              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                  <Paperclip size={16} />
                  {uploading ? "Uploading" : "Attach"}
                  <input type="file" className="hidden" onChange={onFileInputChange} />
                </label>

                {uploading && typeof uploadProgress === "number" && (
                  <div className="w-36 rounded-lg bg-slate-200">
                    <div
                      className="h-2 rounded-lg bg-slate-950 transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {attachments.length === 0 ? (
                <p className="text-sm text-slate-500">No files attached.</p>
              ) : (
                attachments.map((attachment) => (
                  <AttachmentCard
                    key={attachment.id}
                    attachment={attachment}
                    canDelete={canDelete}
                    onPreview={() => {
                      setPreviewAttachment(attachment);
                      setPreviewOpen(true);
                    }}
                    onDownload={() => {
                      window.open(
                        `${api.defaults.baseURL}/attachments/${attachment.id}/download`,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                    onDelete={async () => {
                      try {
                        await api.delete(`/attachments/${attachment.id}`);
                        await fetchThread();
                        onChanged?.();
                        toast.success("Attachment deleted");
                      } catch (e) {
                        toast.error(
                          e?.response?.data?.detail ||
                            "Failed to delete attachment"
                        );
                      }
                    }}
                  />
                ))
              )}
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Drag & drop files here to attach.
            </div>
          </div>

          <AttachmentPreviewModal
            open={previewOpen}
            attachment={previewAttachment}
            onClose={() => {
              setPreviewOpen(false);
              setPreviewAttachment(null);
            }}
          />


          <div className="space-y-4">
            {rootComments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm">
                  <CheckCircle2 size={19} />
                </div>
                No discussion yet. Start with the decision, blocker, or next action.
              </div>
            ) : (
              rootComments.map((comment) => (
                <div key={comment.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 font-bold text-white">
                    {initials(comment.author?.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-950">
                          {comment.author?.full_name || "User"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {relativeTime(comment.created_at)}
                        </span>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => deleteComment(comment.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          title="Delete comment"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {comment.body}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <form onSubmit={submitComment} className="border-t border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows="3"
              placeholder="Write a decision, blocker, mention, or update..."
              className="control-input min-h-[84px] flex-1 resize-none"
            />
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-slate-950 text-white transition hover:bg-slate-800 sm:h-[84px] sm:w-14"
              title="Send"
            >
              <Send size={19} />
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
