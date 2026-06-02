import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  X,
  Loader2,
  Sparkles,
  Send,
  CalendarClock,
  UserRound,
  Trash2,
  Tag,
  Layers,
  Paperclip,
  CheckCircle2,
  History,
  Archive,
  MessageSquare,
  CornerDownRight,
  AlertTriangle,
  FileEdit,
} from "lucide-react";
import toast from "react-hot-toast";

import api from "../services/api";
import AttachmentCard from "./AttachmentCard";
import AttachmentPreviewModal from "./AttachmentPreviewModal";
import DeleteConfirmationModal from "./DeleteConfirmationModal";

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

const allowedFileExtensions = [
  "pdf",
  "doc",
  "docx",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "mp3",
  "wav",
  "m4a",
  "csv",
  "xlsx",
  "pptx",
];

const acceptedFileTypes = allowedFileExtensions.map((ext) => `.${ext}`).join(",");

function getFileExtension(fileName = "") {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CommentAttachmentList({ attachments = [], onPreview, onDownload }) {
  if (!attachments.length) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Attached
      </div>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/50"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Paperclip size={13} className="shrink-0 text-slate-400" />
            <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
              {attachment.original_filename}
            </span>
            <span className="shrink-0 text-slate-400">
              {formatFileSize(attachment.file_size ?? attachment.size ?? 0)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onPreview(attachment)}
              className="font-semibold text-slate-500 transition hover:text-slate-900 dark:hover:text-slate-100"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => onDownload(attachment)}
              className="font-semibold text-slate-500 transition hover:text-slate-900 dark:hover:text-slate-100"
            >
              Download
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function renderCommentBody(text) {
  if (!text) return "";
  const regex = /@([A-Za-z0-9_.-]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let idx = 0;
  while ((match = regex.exec(text)) !== null) {
    const before = text.substring(lastIndex, match.index);
    if (before) parts.push(before);
    parts.push(
      <span key={idx++} className="font-semibold text-blue-600 dark:text-brand-400 hover:underline cursor-pointer">
        @{match[1]}
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  const after = text.substring(lastIndex);
  if (after) parts.push(after);
  return parts.length > 0 ? parts : text;
}

export default function TaskWorkspace({
  task,
  open,
  onClose,
  onChanged,
  projects = [],
  users = [],
}) {
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [activities, setActivities] = useState([]);
  
  // Input body states
  const [body, setBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [discussionError, setDiscussionError] = useState("");
  const [commentFiles, setCommentFiles] = useState([]);
  const [commentUploading, setCommentUploading] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [editBody, setEditBody] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [deletingAttachment, setDeletingAttachment] = useState(null);
  const [deletingTaskConfirm, setDeletingTaskConfirm] = useState(false);

  // Property states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState("");
  
  // Checklist State
  const [checklist, setChecklist] = useState([]);

  // Comment Thread / Edit States
  const [replyingToCommentId, setReplyingToCommentId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);

  // Mentions autocomplete states
  const [mentionSearch, setMentionSearch] = useState("");
  const [showMentionsList, setShowMentionsList] = useState(false);
  const [textareaCursorPos, setTextareaCursorPos] = useState(0);
  const [activeInputType, setActiveInputType] = useState("comment"); // "comment", "reply", "edit"
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [activeEditId, setActiveEditId] = useState(null);

  // AI Summary States
  const [aiSummary, setAiSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);

  const role = localStorage.getItem("user_role");
  const currentUserId = Number(localStorage.getItem("user_id") || 0);
  const canDelete = role === "Admin" || role === "Manager";

  const fetchThread = useCallback(async () => {
    if (!task?.id) return;

    setDiscussionLoading(true);
    setDiscussionError("");

    try {
      const commentResponse = await api.get(`/tasks/${task.id}/comments`);
      setComments(Array.isArray(commentResponse.data) ? commentResponse.data : []);
    } catch (e) {
      console.error(e);
      setComments([]);
      setDiscussionError("Discussion could not be loaded.");
    } finally {
      setDiscussionLoading(false);
    }

    try {
      const activityResponse = await api.get("/activities/", { params: { task_id: task.id } });
      setActivities(Array.isArray(activityResponse.data) ? activityResponse.data : []);
    } catch (e) {
      console.error(e);
      setActivities([]);
    }

    try {
      const attachmentResponse = await api.get(`/tasks/${task.id}/files`);
      setAttachments(Array.isArray(attachmentResponse.data) ? attachmentResponse.data : []);
    } catch (e) {
      console.error(e);
      setAttachments([]);
    }
  }, [task]);

  useEffect(() => {
    let active = true;

    async function load() {
      await Promise.resolve();
      if (!active) return;

      if (open && task?.id) {
        fetchThread();
      } else {
        setComments([]);
        setAttachments([]);
        setActivities([]);
        setAiSummary("");
        setCommentFiles([]);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [open, task?.id, fetchThread]);

  // Synchronize local states when task prop changes
  useEffect(() => {
    let active = true;
    async function sync() {
      await Promise.resolve();
      if (!active) return;
      if (task) {
        setTitle(task.title || "");
        setDescription(task.description || "");
        setStatus(task.status || "todo");
        setPriority(task.priority || "medium");
        setAssigneeId(task.assigned_to || "");
        setProjectId(task.project_id || "");
        setDueDate(task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : "");
        setLabels(Array.isArray(task.labels) ? task.labels.join(", ") : task.labels || "");
        setChecklist(task.checklist || []);
      }
    }
    sync();
    return () => {
      active = false;
    };
  }, [task]);

  async function updateTaskField(field, value) {
    if (!task?.id) return;
    try {
      const payload = { [field]: value };
      await api.put(`/tasks/${task.id}`, payload);
      window.dispatchEvent(new CustomEvent("task-updated"));
      onChanged?.();
      toast.success("Task updated");
      fetchThread();
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to update ${field}`);
      // Revert state
      if (task) {
        if (field === "title") setTitle(task.title || "");
        if (field === "description") setDescription(task.description || "");
        if (field === "status") setStatus(task.status || "todo");
        if (field === "priority") setPriority(task.priority || "medium");
        if (field === "assigned_to") setAssigneeId(task.assigned_to || "");
        if (field === "project_id") setProjectId(task.project_id || "");
        if (field === "due_date") setDueDate(task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : "");
        if (field === "labels") setLabels(Array.isArray(task.labels) ? task.labels.join(", ") : task.labels || "");
        if (field === "checklist") setChecklist(task.checklist || []);
      }
    }
  }

  async function updateChecklist(newChecklist) {
    setChecklist(newChecklist);
    await updateTaskField("checklist", newChecklist);
  }

  async function submitComment(event, parentId = null) {
    if (event) event.preventDefault();
    const commentBody = parentId ? replyBody : body;
    if (!commentBody.trim()) return;

    try {
      setCommentError("");
      setCommentSubmitting(true);
      const response = await api.post(`/tasks/${task.id}/comments`, {
        body: commentBody.trim(),
        parent_id: parentId,
      });

      let attachmentUploadFailed = false;
      if (!parentId && commentFiles.length > 0 && response.data?.id) {
        setCommentUploading(true);
        try {
          await Promise.all(
            commentFiles.map((file) => {
              const form = new FormData();
              form.append("file", file);
              return api.post("/attachments/", form, {
                params: { comment_id: response.data.id },
                headers: { "Content-Type": "multipart/form-data" },
              });
            })
          );
        } catch {
          attachmentUploadFailed = true;
        }
      }

      if (parentId) {
        setReplyBody("");
        setReplyingToCommentId(null);
      } else {
        setBody("");
        setCommentFiles([]);
      }
      await fetchThread();
      onChanged?.();
      if (attachmentUploadFailed) {
        toast.error("Comment posted, but attachment upload failed");
        return;
      }

      toast.success(
        !parentId && commentFiles.length > 0
          ? "Comment posted with attachment"
          : parentId
            ? "Reply posted"
            : "Comment posted"
      );
    } catch (error) {
      setCommentError(error?.response?.data?.detail || "Could not post comment. Please try again.");
    } finally {
      setCommentSubmitting(false);
      setCommentUploading(false);
    }
  }

  async function submitEditComment(commentId) {
    if (!editBody.trim()) return;
    try {
      await api.put(`/comments/${commentId}`, { body: editBody.trim() });
      setEditingCommentId(null);
      setEditBody("");
      await fetchThread();
      onChanged?.();
      toast.success("Comment updated");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to edit comment");
    }
  }

  async function deleteComment(commentId) {
    try {
      await api.delete(`/comments/${commentId}`);
      await fetchThread();
      onChanged?.();
      toast.success("Comment deleted");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to delete comment");
    }
  }

  async function refreshAISummary() {
    if (!task?.id) return;
    try {
      setLoadingSummary(true);
      const response = await api.post(`/tasks/${task.id}/ai-summary`);
      setAiSummary(response.data?.summary || "");
      toast.success("AI Task Summary refreshed");
    } catch (e) {
      toast.error("Failed to generate AI task summary");
    } finally {
      setLoadingSummary(false);
    }
  }

  // Handle Autocomplete mapping when typing @
  const handleTextareaChange = (event, inputType, id = null) => {
    const val = event.target.value;
    if (inputType === "comment") {
      setBody(val);
    } else if (inputType === "reply") {
      setReplyBody(val);
    } else if (inputType === "edit") {
      setEditBody(val);
    }

    const cursor = event.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");

    if (lastAtIdx !== -1 && (lastAtIdx === 0 || /\s/.test(textBeforeCursor.charAt(lastAtIdx - 1)))) {
      const search = textBeforeCursor.slice(lastAtIdx + 1);
      if (!/\s/.test(search)) {
        setMentionSearch(search);
        setShowMentionsList(true);
        setTextareaCursorPos(lastAtIdx);
        setActiveInputType(inputType);
        setActiveReplyId(inputType === "reply" ? id : null);
        setActiveEditId(inputType === "edit" ? id : null);
        return;
      }
    }
    setShowMentionsList(false);
  };

  const insertMention = (user) => {
    const handle = user.full_name.toLowerCase().replace(/\s+/g, "_");
    let currentText = "";
    if (activeInputType === "comment") {
      currentText = body;
    } else if (activeInputType === "reply") {
      currentText = replyBody;
    } else if (activeInputType === "edit") {
      currentText = editBody;
    }

    const textBeforeAt = currentText.slice(0, textareaCursorPos);
    const textAfterCursor = currentText.slice(textareaCursorPos + mentionSearch.length + 1);
    const newText = `${textBeforeAt}@${handle} ${textAfterCursor}`;

    if (activeInputType === "comment") {
      setBody(newText);
    } else if (activeInputType === "reply") {
      setReplyBody(newText);
    } else if (activeInputType === "edit") {
      setEditBody(newText);
    }

    setShowMentionsList(false);
  };

  const filteredUsersForMentions = useMemo(() => {
    if (!mentionSearch) return users.slice(0, 5);
    const q = mentionSearch.toLowerCase();
    return users.filter((u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, mentionSearch]);

  async function handleDeleteAttachmentConfirm() {
    if (!deletingAttachment) return;
    try {
      await api.delete(`/tasks/${task.id}/files/${deletingAttachment.id}`);
      toast.success("File deleted");
      fetchThread();
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to delete file");
    } finally {
      setDeletingAttachment(null);
    }
  }

  function validateFiles(files) {
    const validFiles = [];
    const rejectedFiles = [];

    files.forEach((file) => {
      const extension = getFileExtension(file.name);
      if (allowedFileExtensions.includes(extension)) {
        validFiles.push(file);
      } else {
        rejectedFiles.push(file.name);
      }
    });

    if (rejectedFiles.length > 0) {
      toast.error(`Unsupported file type: ${rejectedFiles[0]}`);
    }

    return validFiles;
  }

  function handleCommentFileSelection(event) {
    const validFiles = validateFiles(Array.from(event.target.files || []));
    if (validFiles.length > 0) {
      setCommentFiles((current) => [...current, ...validFiles]);
    }
    event.target.value = "";
  }

  function removeCommentFile(index) {
    setCommentFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function uploadFile(file) {
    if (!file || !task?.id) return;

    const form = new FormData();
    form.append("file", file);

    try {
      setUploading(true);
      setUploadProgress(0);

      await api.post(`/tasks/${task.id}/files`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (p) => {
          if (!p?.total) return;
          const pct = Math.round((p.loaded * 100) / p.total);
          setUploadProgress(pct);
        },
      });

      await fetchThread();
      onChanged?.();
      toast.success("File uploaded");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function uploadFiles(files) {
    const validFiles = validateFiles(Array.from(files || []));
    if (validFiles.length === 0 || uploading) return;

    for (const file of validFiles) {
      await uploadFile(file);
    }
  }

  async function onFileInputChange(event) {
    await uploadFiles(event.target.files);
    event.target.value = "";
  }

  async function downloadAttachment(attachment) {
    try {
      const response = await api.get(`/attachments/${attachment.id}/download`, {
        responseType: "blob",
      });
      const objectUrl = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.original_filename || "task-file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to download file");
    }
  }

  async function handleTaskDeleteConfirm() {
    if (!task?.id) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      toast.success("Task deleted successfully");
      window.dispatchEvent(new CustomEvent("task-deleted"));
      onChanged?.();
      onClose();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to delete task");
    } finally {
      setDeletingTaskConfirm(false);
    }
  }

  // Interleave activities and root comments chronologically
  const timelineItems = useMemo(() => {
    const items = [];

    activities.forEach((act) => {
      items.push({
        id: `activity-${act.id}`,
        type: "activity",
        date: new Date(act.created_at),
        content: act.message || act.description,
        user: act.user?.full_name || "A teammate",
      });
    });

    // Only map root comments
    const rootComments = comments.filter((c) => !c.parent_id);
    rootComments.forEach((com) => {
      items.push({
        id: `comment-${com.id}`,
        type: "comment",
        date: new Date(com.created_at),
        content: com.body,
        user: com.author?.full_name || "A teammate",
        raw: com,
      });
    });

    return items.sort((a, b) => a.date - b.date);
  }, [comments, activities]);

  // Extract intelligence payload defensively
  const intelligence = useMemo(() => {
    return task?.intelligence || { score: 100, badge: "healthy", warnings: [], suggestions: [] };
  }, [task]);

  if (!open || !task) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm transition-all duration-300">
      <aside className="flex h-dvh w-full max-w-5xl flex-col bg-white dark:bg-slate-800 shadow-2xl border-l border-slate-200 dark:border-slate-700">
        
        {/* Header Section */}
        <header className="border-b border-slate-200 dark:border-slate-700 px-4 py-4 sm:px-6 sm:py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-2 text-blue-700 dark:text-blue-400">
              <Sparkles size={18} />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Execution Workspace
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeletingTaskConfirm(true)}
              className="rounded-lg p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
              title="Delete task"
            >
              <Trash2 size={18} />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-400 cursor-not-allowed transition hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Archive task (Future)"
              disabled
            >
              <Archive size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-950 dark:hover:text-slate-100"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Content Shell split layout */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          
          {/* Left Column - Main Workspace (Scrollable) */}
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 border-r border-slate-100 dark:border-slate-700/50 space-y-6">
            
            {/* Title Editor */}
            <div className="space-y-1">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title.trim() && title !== task.title) {
                    updateTaskField("title", title);
                  }
                }}
                className="w-full text-2xl font-bold bg-transparent border-0 hover:bg-slate-50 focus:bg-white dark:hover:bg-slate-900 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 rounded-lg px-2 py-1 text-slate-900 dark:text-slate-100 outline-none transition"
                placeholder="Task title"
              />
            </div>

            {/* Description Editor */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== (task.description || "")) {
                    updateTaskField("description", description);
                  }
                }}
                className="w-full min-h-[100px] text-sm bg-transparent hover:bg-slate-50 focus:bg-white dark:hover:bg-slate-900 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 outline-none transition"
                placeholder="Add a detailed description or use markdown..."
              />
            </div>

            {/* AI Summary Container (Phase E) */}
            <div className="rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-purple-950 dark:text-purple-300 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />
                  AI Task Summary
                </span>
                <button
                  type="button"
                  onClick={refreshAISummary}
                  disabled={loadingSummary}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 dark:bg-purple-700 hover:bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50"
                >
                  {loadingSummary ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles size={12} />}
                  Refresh with AI
                </button>
              </div>
              <p className="text-sm text-purple-900 dark:text-purple-200 leading-relaxed font-medium">
                {aiSummary || "No summary generated yet. Click 'Refresh with AI' to analyze task contents and comments."}
              </p>
            </div>

            {/* Notion-style Subtask Checklist (Phase D) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-slate-500" />
                  Subtasks Checklist
                </span>
                {checklist.length > 0 && (
                  <span className="text-xs text-slate-500 font-semibold">
                    {Math.round((checklist.filter((c) => c.completed).length / checklist.length) * 100)}% done
                  </span>
                )}
              </div>

              {checklist.length > 0 && (
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${(checklist.filter((c) => c.completed).length / checklist.length) * 100}%` }}
                  />
                </div>
              )}

              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center gap-3 group">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={(e) => {
                        const updated = checklist.map((c, i) =>
                          i === idx ? { ...c, completed: e.target.checked } : c
                        );
                        updateChecklist(updated);
                      }}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const updated = checklist.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c));
                        setChecklist(updated);
                      }}
                      onBlur={() => {
                        updateChecklist(checklist);
                      }}
                      className={`flex-1 text-sm bg-transparent border-0 py-0.5 px-1 hover:bg-slate-50 dark:hover:bg-slate-900 rounded outline-none focus:bg-white dark:focus:bg-slate-950 ${item.completed ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-200"}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = checklist.filter((_, i) => i !== idx);
                        updateChecklist(updated);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition"
                      title="Remove subtask"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a subtask... (Press Enter)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target.value.trim()) {
                      const newItem = {
                        id: Math.random().toString(36).substring(7),
                        name: e.target.value.trim(),
                        completed: false,
                      };
                      updateChecklist([...checklist, newItem]);
                      e.target.value = "";
                    }
                  }}
                  className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-850 dark:text-slate-205 outline-none focus:ring-2 focus:ring-slate-100"
                />
              </div>
            </div>

            {/* Task Files Section */}
            <div
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/20 p-4 space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                if (uploading) return;
                await uploadFiles(e.dataTransfer?.files);
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Paperclip size={16} />
                  Task Files
                </span>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-950 dark:bg-slate-700 hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition">
                  Upload
                  <input
                    type="file"
                    multiple
                    accept={acceptedFileTypes}
                    className="hidden"
                    onChange={onFileInputChange}
                  />
                </label>
              </div>

              {uploading && typeof uploadProgress === "number" && (
                <div className="w-full flex items-center gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-100">
                  <Loader2 className="animate-spin text-slate-500 h-4 w-4" />
                  <div className="flex-1 h-2 bg-slate-100 rounded-lg overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span className="text-xs text-slate-500">{uploadProgress}%</span>
                </div>
              )}

              <div className="grid gap-2">
                {attachments.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">No task files yet. Drag and drop files here to upload.</p>
                ) : (
                  attachments.map((attachment) => (
                    <AttachmentCard
                      key={attachment.id}
                      attachment={attachment}
                      canDelete={canDelete || attachment.uploader_id === currentUserId}
                      onPreview={() => {
                        setPreviewAttachment(attachment);
                        setPreviewOpen(true);
                      }}
                      onDownload={() => downloadAttachment(attachment)}
                      onDelete={() => setDeletingAttachment(attachment)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Combined Activity & Comments timeline */}
            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <History size={16} />
                Activity & Discussion
              </h3>

              <div className="space-y-4">
                {timelineItems.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No discussion or activity logs yet.</p>
                ) : (
                  timelineItems.map((item) => (
                    <div key={item.id} className="relative pl-6">
                      {/* Timeline Line Connector */}
                      <div className="absolute left-2.5 top-2.5 bottom-[-16px] w-0.5 bg-slate-100 dark:bg-slate-700" />
                      
                      {item.type === "activity" ? (
                        /* Activity Log View */
                        <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                          <div className="absolute left-1.5 top-2 h-2.5 w-2.5 rounded-full border border-slate-300 bg-slate-100 dark:border-slate-500 dark:bg-slate-800" />
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {item.user}
                          </span>
                          <span className="text-slate-400 leading-normal">
                            {item.content}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono ml-auto">
                            {relativeTime(item.date)}
                          </span>
                        </div>
                      ) : (
                        /* Comment Thread View (Phase D Support Threaded Replies & Comments Inline Editing) */
                        <div className="relative pl-2 py-1 space-y-2">
                          <div className="absolute left-1 top-2.5 h-3.5 w-3.5 rounded-full bg-blue-500 border-2 border-white dark:border-slate-800 flex items-center justify-center text-[8px] font-bold text-white">
                            C
                          </div>
                          <div className="flex gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-3 shadow-sm">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-700 font-bold text-white text-xs">
                              {initials(item.user)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-baseline gap-2">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                                    {item.user}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {relativeTime(item.date)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {/* Reply button */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyingToCommentId(replyingToCommentId === item.raw.id ? null : item.raw.id);
                                      setReplyBody("");
                                    }}
                                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
                                  >
                                    Reply
                                  </button>
                                  {/* Edit button */}
                                  {item.raw.author_id === currentUserId && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCommentId(item.raw.id);
                                        setEditBody(item.raw.body);
                                      }}
                                      className="rounded p-1 text-slate-450 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 transition"
                                      title="Edit comment"
                                    >
                                      <FileEdit size={13} />
                                    </button>
                                  )}
                                  {/* Delete button */}
                                  {(canDelete || item.raw.author_id === currentUserId) && (
                                    <button
                                      type="button"
                                      onClick={() => deleteComment(item.raw.id)}
                                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                      title="Delete comment"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {editingCommentId === item.raw.id ? (
                                <div className="mt-2 space-y-2">
                                  <textarea
                                    value={editBody}
                                    onChange={(e) => handleTextareaChange(e, "edit", item.raw.id)}
                                    rows="2"
                                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-100"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => submitEditComment(item.raw.id)}
                                      className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-950 dark:bg-slate-700 hover:bg-slate-800 text-white transition"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingCommentId(null)}
                                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 text-slate-600 dark:text-slate-300 transition"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                                  {renderCommentBody(item.content)}
                                </p>
                              )}
                              <CommentAttachmentList
                                attachments={item.raw.attachments || []}
                                onPreview={(attachment) => {
                                  setPreviewAttachment(attachment);
                                  setPreviewOpen(true);
                                }}
                                onDownload={downloadAttachment}
                              />
                            </div>
                          </div>

                          {/* Nested Comment Replies */}
                          {comments
                            .filter((child) => child.parent_id === item.raw.id)
                            .map((child) => (
                              <div key={child.id} className="ml-8 mt-2 flex gap-3 rounded-lg border border-slate-150 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-900/10 p-2.5 shadow-none relative">
                                <CornerDownRight size={14} className="absolute left-[-16px] top-4 text-slate-300" />
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 dark:bg-slate-600 font-bold text-white text-[10px]">
                                  {initials(child.author?.full_name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-baseline gap-2">
                                      <span className="font-semibold text-slate-900 dark:text-slate-105 text-xs">
                                        {child.author?.full_name || "A teammate"}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        {relativeTime(child.created_at)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {child.author_id === currentUserId && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingCommentId(child.id);
                                            setEditBody(child.body);
                                          }}
                                          className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                          title="Edit reply"
                                        >
                                          <FileEdit size={11} />
                                        </button>
                                      )}
                                      {(canDelete || child.author_id === currentUserId) && (
                                        <button
                                          type="button"
                                          onClick={() => deleteComment(child.id)}
                                          className="p-0.5 text-slate-400 hover:text-rose-600"
                                          title="Delete reply"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {editingCommentId === child.id ? (
                                    <div className="mt-2 space-y-2">
                                      <textarea
                                        value={editBody}
                                        onChange={(e) => handleTextareaChange(e, "edit", child.id)}
                                        rows="2"
                                        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-100"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => submitEditComment(child.id)}
                                          className="px-2 py-0.5 text-xs font-bold rounded-lg bg-slate-950 dark:bg-slate-700 hover:bg-slate-800 text-white transition"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingCommentId(null)}
                                          className="px-2 py-0.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 text-slate-600 transition"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                                      {renderCommentBody(child.body)}
                                    </p>
                                  )}
                                  <CommentAttachmentList
                                    attachments={child.attachments || []}
                                    onPreview={(attachment) => {
                                      setPreviewAttachment(attachment);
                                      setPreviewOpen(true);
                                    }}
                                    onDownload={downloadAttachment}
                                  />
                                </div>
                              </div>
                            ))}

                          {/* Reply submission box */}
                          {replyingToCommentId === item.raw.id && (
                            <div className="ml-8 mt-2 flex gap-2">
                              <textarea
                                value={replyBody}
                                onChange={(e) => handleTextareaChange(e, "reply", item.raw.id)}
                                rows="2"
                                placeholder="Reply to this thread..."
                                className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-100 resize-none"
                              />
                              <button
                                onClick={() => submitComment(null, item.raw.id)}
                                disabled={!replyBody.trim()}
                                className="px-3 rounded-lg bg-slate-950 dark:bg-slate-700 hover:bg-slate-800 text-white transition disabled:opacity-50"
                              >
                                Send
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Comment submission form */}
              <div className="relative pt-3">
                <form onSubmit={submitComment} className="space-y-2">
                  <div className="flex gap-3">
                    <textarea
                      value={body}
                      onChange={(event) => handleTextareaChange(event, "comment")}
                      rows="2"
                      placeholder="Write a comment or post an update..."
                      className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-slate-800 dark:text-slate-200 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 resize-none"
                    />
                    <div className="flex flex-col gap-2">
                      <label
                        className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        title="Attach file to comment"
                      >
                        <Paperclip size={16} />
                        <input
                          type="file"
                          multiple
                          accept={acceptedFileTypes}
                          className="hidden"
                          onChange={handleCommentFileSelection}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={!body.trim() || commentUploading}
                        className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white transition disabled:opacity-50"
                        title="Send comment"
                      >
                        {commentUploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                  </div>

                  {commentFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {commentFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${file.lastModified}-${index}`}
                          className="flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900/50"
                        >
                          <Paperclip size={12} className="shrink-0 text-slate-400" />
                          <span className="max-w-[220px] truncate font-semibold text-slate-600 dark:text-slate-300">
                            {file.name}
                          </span>
                          <span className="shrink-0 text-slate-400">{formatFileSize(file.size)}</span>
                          <button
                            type="button"
                            onClick={() => removeCommentFile(index)}
                            className="rounded p-0.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="Remove attachment"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </form>

                {/* Mentions autocomplete dropdown popup */}
                {showMentionsList && filteredUsersForMentions.length > 0 && (
                  <div className="absolute left-0 bottom-full mb-2 z-50 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-900/50">
                      Mention member
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredUsersForMentions.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => insertMention(user)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                        >
                          <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 dark:bg-slate-750 font-bold text-xs text-slate-600 dark:text-slate-350">
                            {initials(user.full_name)}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{user.full_name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Column - Properties Sidebar */}
          <aside className="w-full md:w-80 bg-slate-50 dark:bg-slate-900/40 p-4 sm:p-5 overflow-y-auto space-y-5">
            
            {/* Task Health Dial & Warnings (Phase E Support) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Task Health</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  intelligence.badge === "overdue" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-450" :
                  intelligence.badge === "at_risk" ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-450" :
                  intelligence.badge === "high_priority" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-450" :
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-450"
                }`}>
                  {intelligence.badge === "overdue" && "⏰ Overdue"}
                  {intelligence.badge === "at_risk" && "⚠️ At Risk"}
                  {intelligence.badge === "high_priority" && "🔥 High Priority"}
                  {intelligence.badge === "healthy" && "✅ Healthy"}
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center h-12 w-12 rounded-full border-4 border-slate-100 dark:border-slate-700" style={{
                  backgroundImage: `conic-gradient(#3b82f6 ${intelligence.score}%, transparent 0)`
                }}>
                  <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white dark:bg-slate-850 text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    {intelligence.score}%
                  </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {intelligence.score >= 85 ? "Task is fully healthy." :
                   intelligence.score >= 50 ? "Task requires monitoring." :
                   "Task health is critical."}
                </div>
              </div>

              {intelligence.warnings && intelligence.warnings.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-700 pt-2.5 space-y-1.5">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-rose-500" />
                    Risks detected
                  </span>
                  <ul className="list-disc pl-4 text-[11px] text-rose-600 dark:text-rose-400 space-y-1">
                    {intelligence.warnings.map((w, index) => (
                      <li key={index}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Properties
            </h3>

            <div className="space-y-4 text-sm">
              {/* Project selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-1.5 text-xs">
                  <Layers size={13} /> Project
                </label>
                <select
                  value={projectId}
                  onChange={(e) => updateTaskField("project_id", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-100"
                >
                  <option value="">Personal Task (No Project)</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-1.5 text-xs">
                  <CheckCircle2 size={13} /> Status
                </label>
                <select
                  value={status}
                  onChange={(e) => updateTaskField("status", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 capitalize text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-100"
                >
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {/* Priority selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-1.5 text-xs">
                  <Sparkles size={13} /> Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => updateTaskField("priority", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 capitalize text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-100"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Assignee selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-1.5 text-xs">
                  <UserRound size={13} /> Assignee
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => updateTaskField("assigned_to", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-100"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Due Date selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-1.5 text-xs">
                  <CalendarClock size={13} /> Due Date
                </label>
                <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => updateTaskField("due_date", e.target.value)}
                    className="flex-1 min-w-[140px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-100"
                  />
                  {dueDate && (
                    <button
                      type="button"
                      onClick={() => updateTaskField("due_date", null)}
                      className="px-2 py-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-500"
                      title="Clear due date"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Labels tag input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-medium flex items-center gap-1.5 text-xs">
                  <Tag size={13} /> Labels (Tags)
                </label>
                <input
                  type="text"
                  value={labels}
                  onChange={(e) => setLabels(e.target.value)}
                  onBlur={() => {
                    const list = labels.split(",").map((l) => l.trim()).filter(Boolean);
                    updateTaskField("labels", list);
                  }}
                  placeholder="marketing, api, bug"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-100"
                />
              </div>

              {/* Meta information */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-400 space-y-2">
                <div className="flex justify-between">
                  <span>Created date</span>
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {task.created_at ? new Date(task.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }) : "None"}
                  </span>
                </div>
              </div>

            </div>
          </aside>

        </div>
      </aside>

      {/* Preview Modal */}
      <AttachmentPreviewModal
        open={previewOpen}
        attachment={previewAttachment}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewAttachment(null);
        }}
      />

      {/* Delete Attachment Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={Boolean(deletingAttachment)}
        title="Delete task file?"
        description="This action cannot be undone and will permanently remove this file from the task."
        itemName={deletingAttachment?.original_filename || ""}
        onConfirm={handleDeleteAttachmentConfirm}
        onCancel={() => setDeletingAttachment(null)}
        isDangerous={false}
      />

      {/* Delete Task Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deletingTaskConfirm}
        title="Delete task?"
        description="This action cannot be undone and will permanently remove this task, comments, and files."
        itemName={task.title || ""}
        onConfirm={handleTaskDeleteConfirm}
        onCancel={() => setDeletingTaskConfirm(false)}
        isDangerous={true}
      />
    </div>
  );
}
