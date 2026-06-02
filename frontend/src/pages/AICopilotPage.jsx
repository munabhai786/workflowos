import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Bot,
  ChevronRight,
  Check,
  Copy,
  File,
  FileText,
  Image,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Upload,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import useVoiceAssistant from "../hooks/useVoiceAssistant";
import toast from "react-hot-toast";
import MainLayout from "../layouts/MainLayout";
import useAICopilotStore from "../store/aiCopilotStore";
import useAuthStore from "../store/authStore";
import { logError } from "../utils/logger";
import MarkdownRenderer from "../components/MarkdownRenderer";


const SAVED_PROMPTS = [
  "Create ecommerce sprint",
  "Generate launch plan",
  "Summarize uploaded requirements",
  "Find overdue risks",
  "What tasks are overdue in my projects?",
  "Give me a summary of this week's progress",
  "What should I focus on today?",
];

const VOICE_LANGUAGES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-AU", label: "English (AU)" },
  { value: "ur-PK", label: "Urdu (PK)" },
  { value: "hi-IN", label: "Hindi (IN)" },
];


const SUPPORTED_FILES = {
  pdf: {
    icon: FileText,
    color: "text-red-500",
    bg: "bg-red-50",
    label: "PDF",
  },
  png: {
    icon: Image,
    color: "text-blue-500",
    bg: "bg-blue-50",
    label: "PNG",
  },
  jpg: {
    icon: Image,
    color: "text-blue-500",
    bg: "bg-blue-50",
    label: "JPG",
  },
  jpeg: {
    icon: Image,
    color: "text-blue-500",
    bg: "bg-blue-50",
    label: "JPEG",
  },
  docx: {
    icon: FileText,
    color: "text-indigo-500",
    bg: "bg-indigo-50",
    label: "DOCX",
  },
  txt: {
    icon: File,
    color: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900",
    label: "TXT",
  },
};

function renderAssistantContent(content) {
  return <MarkdownRenderer content={content} />;
}


const AICopilotPage = () => {
  const [inputMessage, setInputMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [executingAction, setExecutingAction] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const lastAutoReadMessageRef = useRef(null);

  useAuthStore();

  const {
    conversations,
    messages,
    activeConversationId,
    isLoading,
    isSending,
    error,
    fetchConversations,
    loadConversation,
    sendMessage,
    executeAction,
    deleteConversation,
    startNewConversation,
    clearError,
  } = useAICopilotStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (activeConversationId && messages.length === 0) {
      loadConversation(activeConversationId);
    }
  }, [activeConversationId, loadConversation, messages.length]);

  const handleSend = useCallback(async (messageOverride) => {
    const msg =
      typeof messageOverride === "string"
        ? messageOverride.trim()
        : inputMessage.trim();

    if (!msg && !selectedFile) return;
    if (isSending) return;

    setInputMessage("");
    const file = selectedFile;
    setSelectedFile(null);

    await sendMessage(
      msg || "Please analyze this file.",
      file
    );

    inputRef.current?.focus();
  }, [inputMessage, isSending, selectedFile, sendMessage]);

  const {
    settings: voiceSettings,
    updateSettings: updateVoiceSettings,
    voiceState,
    interimTranscript,
    finalTranscript,
    voiceError,
    voices,
    speechSupported,
    ttsSupported,
    speakingMessageId,
    startListening,
    stopListening,
    cancelListening,
    speak,
    cancelSpeaking,
  } = useVoiceAssistant({
    onTranscriptFinal: (transcript, options) => {
      setInputMessage(transcript);
      inputRef.current?.focus();

      if (options?.autoSend) {
        handleSend(transcript);
      }
    },
  });

  useEffect(() => {
    if (!voiceSettings.autoReadResponses || isSending || messages.length === 0) {
      return;
    }

    const lastMessage = messages[messages.length - 1];

    if (
      lastMessage?.role === "assistant" &&
      lastMessage.id !== lastAutoReadMessageRef.current
    ) {
      lastAutoReadMessageRef.current = lastMessage.id;
      speak(lastMessage.id, lastMessage.content);
    }
  }, [isSending, messages, speak, voiceSettings.autoReadResponses]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name
      .split(".")
      .pop()
      .toLowerCase();

    if (!SUPPORTED_FILES[ext]) {
      toast.error(
        "Unsupported file type. Use PDF, PNG, JPG, DOCX, or TXT."
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max 10MB.");
      return;
    }

    setSelectedFile(file);
    e.target.value = "";
  };

  const handlePromptClick = (prompt) => {
    setInputMessage(prompt);
    inputRef.current?.focus();
  };

  const handleCopyMessage = async (messageId, content) => {
    try {
      await navigator.clipboard.writeText(content || "");
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId(null), 1600);
    } catch (err) {
      logError(err, "Copy failed");
      toast.error("Unable to copy the message. Please try again.");
    }
  };

  const handleRegenerateFrom = async (messageIndex) => {
    if (isSending) return;

    const previousUserMessage = messages
      .slice(0, messageIndex)
      .reverse()
      .find((message) => message.role === "user");

    if (!previousUserMessage?.content) return;

    await sendMessage(previousUserMessage.content, null);
  };

  const handleConfirmPendingAction = async (pendingAction) => {
    if (executingAction || !pendingAction) return;
    setExecutingAction(pendingAction);

    try {
      await executeAction(pendingAction);
    } catch (err) {
      console.error("Failed to execute action", err);
      alert(
        "Unable to perform the requested action. Please review the detected payload or try again."
      );
    } finally {
      setExecutingAction(null);
    }
  };

  const handleEditPendingAction = (pendingAction) => {
    if (!pendingAction) return;

    const suggestedText = pendingAction.summary || pendingAction.task_title || pendingAction.title || "Please update this task action.";
    setInputMessage(suggestedText);
    inputRef.current?.focus();
  };

  const handleCancelPendingAction = (messageId) => {
    useAICopilotStore.setState((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, pending_action: null }
          : msg
      ),
    }));
  };

  const handleDeleteConversation = async (id) => {
    const confirmed = window.confirm(
      "Delete this conversation? This cannot be undone."
    );

    if (!confirmed) return;

    try {
      await deleteConversation(id);

      if (activeConversationId === id) {
        startNewConversation();
      }
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete conversation. Please try again.");
    }
  };

  return (
    <MainLayout>
      <div className="flex h-[calc(100dvh-5.25rem)] min-h-[560px] overflow-hidden rounded-none bg-slate-50 dark:bg-slate-900 sm:h-[calc(100dvh-6.5rem)] sm:rounded-xl sm:border sm:border-slate-200 sm:dark:border-slate-700">
        <div className="hidden w-[260px] flex-shrink-0 flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 md:flex">
          <div className="border-b border-slate-200 dark:border-slate-700 p-4">
            <button
              type="button"
              onClick={startNewConversation}
              className="flex w-full items-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New Conversation
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoading && conversations.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <MessageSquare className="mb-2 h-8 w-8 text-slate-200" />
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  No conversations yet. Start chatting above.
                </p>
              </div>
            ) : (
              conversations.map((convo) => (
                <div
                  key={convo.id}
                  onClick={() => loadConversation(convo.id)}
                  className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-all ${
                    activeConversationId === convo.id
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="flex-1 truncate text-xs font-medium">
                    {convo.title}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleDeleteConversation(convo.id);
                    }}
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-all hover:bg-red-100 hover:text-red-500 ${
                      activeConversationId === convo.id
                        ? "opacity-60 hover:opacity-100"
                        : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    }`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800 sm:px-6 sm:py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                AI Copilot
              </p>
              <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                Powered by Claude - Reads files - Knows your projects
              </p>
            </div>
            <button
              type="button"
              onClick={startNewConversation}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 md:hidden"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 md:hidden"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              History
            </button>
            <div className="ml-auto hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600">
                connected
              </span>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="flex-1 text-sm text-red-700">
                {error}
              </p>
              <button
                type="button"
                onClick={clearError}
                className="text-red-400 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white px-3 py-4 dark:bg-slate-900 sm:px-6">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-slate-800 dark:text-slate-100">
                  How can I help you?
                </h2>
                <p className="mb-6 max-w-sm text-sm leading-relaxed text-slate-400 dark:text-slate-500">
                  Ask me about your projects, tasks, and deadlines. Upload PDF,
                  Word, or image files to analyze them.
                </p>
                <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                  {SAVED_PROMPTS.slice(0, 4).map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handlePromptClick(prompt)}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-left text-xs font-medium leading-snug text-slate-600 dark:text-slate-300 transition-all hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, index) => (
              <div
                key={msg.id || index}
                className={`flex items-start gap-3 ${
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {msg.role === "user" && (
                  <>
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-700">
                      <User className="h-4 w-4 text-white" />
                    </div>

                    <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-3 text-white sm:max-w-[75%]">
                      {msg.file_name && (
                        <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/20 px-2 py-1.5">
                          <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate text-xs font-medium">
                            {msg.file_name}
                          </span>
                        </div>
                      )}

                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {msg.content}
                      </p>

                      <p className="mt-1.5 text-[10px] text-blue-200">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </>
                )}

                {msg.role === "assistant" && (
                  <div className="flex max-w-full items-start gap-2 sm:max-w-[85%] sm:gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600">
                      <Bot className="h-4 w-4 text-white" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {msg.confidence !== null &&
                        msg.confidence !== undefined && (
                          <div className="mb-2 flex items-center gap-2">
                            <div
                              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
                              style={{
                                background:
                                  msg.confidence >= 0.8
                                    ? "#f0fdf4"
                                    : msg.confidence >= 0.6
                                      ? "#fffbeb"
                                      : "#fef2f2",
                                borderColor:
                                  msg.confidence >= 0.8
                                    ? "#bbf7d0"
                                    : msg.confidence >= 0.6
                                      ? "#fde68a"
                                      : "#fecaca",
                                color:
                                  msg.confidence >= 0.8
                                    ? "#15803d"
                                    : msg.confidence >= 0.6
                                      ? "#b45309"
                                      : "#dc2626",
                              }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  background:
                                    msg.confidence >= 0.8
                                      ? "#22c55e"
                                      : msg.confidence >= 0.6
                                        ? "#f59e0b"
                                        : "#ef4444",
                                }}
                              />
                              AI Confidence: {Math.round(msg.confidence * 100)}%
                            </div>
                          </div>
                        )}

                      <div className="rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm dark:shadow-slate-900/50">
                        {msg.file_name && (
                          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5">
                            <FileText className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                            <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                              {msg.file_name}
                            </span>
                          </div>
                        )}

                        <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                          {renderAssistantContent(msg.content)}
                        </div>

                        {msg.pending_action && (
                          <div className="mt-4 rounded-3xl border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/40">
                            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                                  Action detected
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {msg.pending_action.summary || "WorkflowOS action ready"}
                                </p>
                              </div>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${msg.pending_action.executable ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"}`}>
                                {msg.pending_action.executable ? "Ready to execute" : "Needs more info"}
                              </span>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              {[
                                ["Title", msg.pending_action.payload.title || msg.pending_action.payload.task_title || "—"],
                                ["Priority", msg.pending_action.payload.priority || "—"],
                                ["Due", msg.pending_action.payload.due_date || "—"],
                                ["Status", msg.pending_action.payload.status || (msg.pending_action.intent === "assign_task" ? "todo" : "—")],
                                ["Assignee", msg.pending_action.payload.assignee || "—"],
                              ].map(([label, value]) => (
                                <div key={label} className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                  <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                                    {label}
                                  </span>
                                  <span className="mt-1 block font-medium text-slate-800 dark:text-slate-100">
                                    {value}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {msg.pending_action.missing_fields?.length > 0 && (
                              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-200">
                                <strong>Missing fields:</strong> {msg.pending_action.missing_fields.join(", ")}
                              </div>
                            )}

                            {msg.pending_action.warnings?.length > 0 && (
                              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                <strong>Note:</strong> {msg.pending_action.warnings.join(" ")}
                              </div>
                            )}

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!msg.pending_action.executable || executingAction}
                                onClick={() => handleConfirmPendingAction(msg.pending_action)}
                                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                              >
                                {executingAction === msg.pending_action ? "Executing..." : "Confirm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditPendingAction(msg.pending_action)}
                                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelPendingAction(msg.id)}
                                className="inline-flex items-center justify-center rounded-xl border border-transparent bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyMessage(
                                  msg.id || `assistant-${index}`,
                                  msg.content
                                )
                              }
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-blue-900/30"
                              aria-label="Copy response"
                              title="Copy"
                            >
                              {copiedMessageId === (msg.id || `assistant-${index}`) ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRegenerateFrom(index)}
                              disabled={isSending}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-blue-900/30"
                              aria-label="Regenerate response"
                              title="Regenerate"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                            {ttsSupported && (
                            <button
                              type="button"
                              onClick={() =>
                                speak(msg.id || `assistant-${index}`, msg.content)
                              }
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                                speakingMessageId === (msg.id || `assistant-${index}`)
                                  ? "bg-blue-600 text-white shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
                                  : "bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-blue-900/30"
                              }`}
                              aria-label={
                                speakingMessageId === (msg.id || `assistant-${index}`)
                                  ? "Stop reading response"
                                  : "Read response aloud"
                              }
                              title={
                                speakingMessageId === (msg.id || `assistant-${index}`)
                                  ? "Stop"
                                  : "Read aloud"
                              }
                            >
                              {speakingMessageId === (msg.id || `assistant-${index}`) ? (
                                <VolumeX className="h-3.5 w-3.5" />
                              ) : (
                                <Volume2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {msg.suggested_actions?.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
                            <Sparkles className="h-3 w-3 text-amber-400" />
                            Suggested actions
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {msg.suggested_actions.map((action, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  setInputMessage(action);
                                  inputRef.current?.focus();
                                }}
                                className="group flex items-center gap-1.5 rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-400 transition-all hover:border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                              >
                                <ChevronRight className="h-3 w-3 text-blue-400 transition-transform group-hover:translate-x-0.5" />
                                {action}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isSending && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm dark:shadow-slate-900/50">
                  <div className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800 sm:px-4">
            {selectedFile && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-blue-500" />
                <span className="flex-1 truncate text-xs font-medium text-blue-700">
                  {selectedFile.name}
                </span>
                <span className="text-xs text-blue-400">
                  {(selectedFile.size / 1024).toFixed(0)}KB
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-blue-400 transition-colors hover:text-blue-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <AnimatePresence>
              {(voiceState === "listening" ||
                voiceState === "processing" ||
                voiceState === "error" ||
                interimTranscript ||
                finalTranscript) && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  className={`mb-2 overflow-hidden rounded-2xl border px-3 py-3 shadow-sm ${
                    voiceState === "error"
                      ? "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30"
                      : "border-blue-200 bg-gradient-to-r from-blue-50 via-white to-cyan-50 dark:border-blue-900/60 dark:from-blue-950/40 dark:via-slate-900 dark:to-cyan-950/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.28)]">
                      {voiceState === "listening" && (
                        <motion.span
                          className="absolute inset-0 rounded-full border border-blue-300"
                          animate={{ scale: [1, 1.55], opacity: [0.65, 0] }}
                          transition={{ duration: 1.25, repeat: Infinity }}
                        />
                      )}
                      {voiceState === "error" ? (
                        <MicOff className="h-4 w-4" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-xs font-bold ${
                            voiceState === "error"
                              ? "text-red-700 dark:text-red-300"
                              : "text-slate-700 dark:text-slate-100"
                          }`}
                        >
                          {voiceState === "listening"
                            ? "Listening..."
                            : voiceState === "processing"
                              ? "Processing voice..."
                              : voiceState === "error"
                                ? "Voice input needs attention"
                                : "Voice transcript ready"}
                        </p>
                        {voiceState === "listening" && (
                          <div className="flex h-4 items-end gap-0.5">
                            {[0, 1, 2, 3, 4].map((bar) => (
                              <motion.span
                                key={bar}
                                className="w-1 rounded-full bg-blue-500"
                                animate={{ height: [5, 14, 7, 16, 6] }}
                                transition={{
                                  duration: 0.85,
                                  repeat: Infinity,
                                  delay: bar * 0.08,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-slate-600 dark:text-slate-300">
                        {voiceError ||
                          interimTranscript ||
                          finalTranscript ||
                          "Start speaking and your words will appear here."}
                      </p>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-1">
                      {voiceState === "listening" && (
                        <button
                          type="button"
                          onClick={stopListening}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          aria-label="Stop listening"
                          title="Stop"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {voiceState === "error" && speechSupported && (
                        <button
                          type="button"
                          onClick={startListening}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-red-600 shadow-sm hover:bg-red-100 dark:bg-slate-800 dark:text-red-300 dark:hover:bg-red-950/40"
                          aria-label="Retry voice input"
                          title="Retry"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={cancelListening}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        aria-label="Cancel voice input"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-wrap items-end gap-2">
              {/* Secondary actions (Upload & Voice Input) */}
              <div className="flex items-center gap-2 order-2 sm:order-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 transition-all hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700"
                  title="Upload files"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={startListening}
                  disabled={voiceState === "processing"}
                  className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-all ${
                    voiceState === "listening"
                      ? "bg-blue-600 text-white shadow-[0_0_0_4px_rgba(37,99,235,0.14),0_10px_30px_rgba(37,99,235,0.3)]"
                      : voiceState === "error"
                        ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300"
                        : "bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-blue-900/30"
                  } disabled:cursor-wait disabled:opacity-70`}
                  aria-label={
                    voiceState === "listening" ? "Stop listening" : "Start voice input"
                  }
                  title={
                    speechSupported
                      ? voiceState === "listening"
                        ? "Stop listening"
                        : "Voice input"
                      : "Voice input is not supported in this browser."
                  }
                >
                  {voiceState === "listening" && (
                    <motion.span
                      className="absolute inset-0 rounded-xl border border-blue-300"
                      animate={{ scale: [1, 1.22], opacity: [0.55, 0] }}
                      transition={{ duration: 1.1, repeat: Infinity }}
                    />
                  )}
                  {voiceState === "listening" ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Main Input Bar and Send Button */}
              <div className="flex items-end gap-2 flex-1 order-1 sm:order-2 w-full sm:w-auto">
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your projects, tasks, or upload a file to analyze..."
                  rows={1}
                  className="max-h-32 min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700 transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:bg-slate-600 sm:px-4"
                  style={{
                    height: "auto",
                    minHeight: "44px",
                  }}
                  onInput={(e) => {
                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.min(e.target.scrollHeight, 128) + "px";
                  }}
                />

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={
                    isSending ||
                    (!inputMessage.trim() && !selectedFile)
                  }
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm dark:shadow-slate-900/50 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Settings Action Button */}
              <div className="relative order-3 sm:order-3">
                <button
                  type="button"
                  onClick={() => setIsVoiceSettingsOpen((current) => !current)}
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-all ${
                    isVoiceSettingsOpen
                      ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  }`}
                  aria-label="Voice settings"
                  aria-expanded={isVoiceSettingsOpen}
                  title="Voice settings"
                >
                  <Settings2 className="h-4 w-4" />
                </button>

                <AnimatePresence>
                  {isVoiceSettingsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.97 }}
                      className="absolute bottom-12 right-0 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            Voice settings
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            Browser-native speech controls
                          </p>
                        </div>
                        {speakingMessageId && (
                          <button
                            type="button"
                            onClick={cancelSpeaking}
                            className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                          >
                            Stop audio
                          </button>
                        )}
                      </div>

                      {!speechSupported && (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                          Voice input is not supported in this browser.
                        </div>
                      )}

                      <div className="space-y-3">
                        <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Auto-read responses
                          </span>
                          <input
                            type="checkbox"
                            checked={voiceSettings.autoReadResponses}
                            onChange={(event) =>
                              updateVoiceSettings({
                                autoReadResponses: event.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-blue-600"
                            disabled={!ttsSupported}
                          />
                        </label>

                        <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Auto-send transcript
                          </span>
                          <input
                            type="checkbox"
                            checked={voiceSettings.autoSendTranscript}
                            onChange={(event) =>
                              updateVoiceSettings({
                                autoSendTranscript: event.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-blue-600"
                            disabled={!speechSupported}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Voice speed: {Number(voiceSettings.rate).toFixed(1)}x
                          </span>
                          <input
                            type="range"
                            min="0.7"
                            max="1.4"
                            step="0.1"
                            value={voiceSettings.rate}
                            onChange={(event) =>
                              updateVoiceSettings({ rate: event.target.value })
                            }
                            className="w-full accent-blue-600"
                            disabled={!ttsSupported}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Voice language
                          </span>
                          <select
                            value={voiceSettings.language}
                            onChange={(event) =>
                              updateVoiceSettings({ language: event.target.value })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            {VOICE_LANGUAGES.map((language) => (
                              <option key={language.value} value={language.value}>
                                {language.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Preferred voice
                          </span>
                          <select
                            value={voiceSettings.voiceName}
                            onChange={(event) =>
                              updateVoiceSettings({ voiceName: event.target.value })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            disabled={!ttsSupported}
                          >
                            <option value="">System default</option>
                            {voices.map((voice) => (
                              <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                                {voice.name} ({voice.lang})
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <p className="mt-2 hidden text-center text-[10px] text-slate-400 dark:text-slate-500 sm:block">
              Press Enter to send - Shift+Enter for new line - Mic uses browser
              speech recognition - Supports PDF, PNG, JPG, DOCX, TXT
            </p>
          </div>
        </div>

        <div className="hidden w-[260px] flex-shrink-0 flex-col overflow-y-auto border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 xl:flex">
          <div className="border-b border-slate-200 dark:border-slate-700 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-yellow-500" />
              Quick Prompts
            </p>
            <div className="space-y-1.5">
              {SAVED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handlePromptClick(prompt)}
                  className="group flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 px-3 py-2.5 text-left text-xs font-medium leading-snug text-slate-600 dark:text-slate-300 transition-all hover:border-blue-300 dark:hover:border-blue-600 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm"
                >
                  <span>{prompt}</span>
                  <ChevronRight className="h-3 w-3 flex-shrink-0 text-slate-300 transition-colors group-hover:text-blue-400" />
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              <Upload className="h-3.5 w-3.5" />
              Supported Files
            </p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(SUPPORTED_FILES)
                .filter(([key]) => !["jpg", "webp"].includes(key))
                .map(([ext, info]) => {
                  const Icon = info.icon;

                  return (
                    <div
                      key={ext}
                      className={`flex flex-col items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-2 ${info.bg}`}
                    >
                      <Icon className={`h-4 w-4 ${info.color}`} />
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        {info.label}
                      </span>
                    </div>
                  );
                })}
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400 dark:text-slate-500">
              Max file size: 10MB
            </p>
          </div>
        </div>
      </div>

      {/* Mobile History Drawer */}
      <AnimatePresence>
        {showHistory && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 z-[100] bg-slate-950/40 backdrop-blur-sm md:hidden"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-[101] flex w-[280px] flex-col bg-white dark:bg-slate-800 shadow-2xl md:hidden border-r border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 p-4">
                <span className="text-sm font-bold text-slate-800 dark:text-white">Chat History</span>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-slate-200 dark:border-slate-700 p-4">
                <button
                  type="button"
                  onClick={() => {
                    startNewConversation();
                    setShowHistory(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  New Conversation
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                    <MessageSquare className="mb-2 h-8 w-8 text-slate-200" />
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      No conversations yet.
                    </p>
                  </div>
                ) : (
                  conversations.map((convo) => (
                    <div
                      key={convo.id}
                      onClick={() => {
                        loadConversation(convo.id);
                        setShowHistory(false);
                      }}
                      className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-all ${
                        activeConversationId === convo.id
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate text-xs font-medium">
                        {convo.title}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleDeleteConversation(convo.id);
                        }}
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-all hover:bg-red-100 hover:text-red-500 text-slate-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </MainLayout>
  );
};


export default AICopilotPage;
