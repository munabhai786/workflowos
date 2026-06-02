import { useEffect, useState, useRef } from "react";
import {
  Sparkles,
  Brain,
  Mic,
  MicOff,
  UploadCloud,
  X,
  Check,
  CheckSquare,
  Plus,
  Loader2,
  FolderKanban,
  AlertCircle,
  FileText,
  ArrowLeft,
} from "lucide-react";
import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useVoiceAssistant from "../hooks/useVoiceAssistant";

export default function MeetingSummarizerPage() {

  // Metadata states
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [fetchingMetadata, setFetchingMetadata] = useState(true);

  // Ingestion states
  const [transcript, setTranscript] = useState("");
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Operation states
  const [loading, setLoading] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState(false);

  // Output states
  const [analysisResult, setAnalysisResult] = useState(null);
  const [suggestedTasks, setSuggestedTasks] = useState([]);

  // Voice dictation hook
  const {
    voiceState,
    startListening,
    stopListening,
    speechSupported,
    voiceError,
  } = useVoiceAssistant({
    onTranscriptFinal: (newText) => {
      setTranscript((prev) => (prev ? prev + "\n" + newText : newText));
      toast.success("Voice note appended!");
    },
  });

  useEffect(() => {
    if (voiceError) {
      toast.error(voiceError);
    }
  }, [voiceError]);

  // Load Projects & Users on mount
  useEffect(() => {
    async function loadMetadata() {
      try {
        setFetchingMetadata(true);
        const [projectsRes, usersRes] = await Promise.all([
          api.get("/projects/"),
          api.get("/users/"),
        ]);

        const normalizedProjects = Array.isArray(projectsRes.data)
          ? projectsRes.data
          : Array.isArray(projectsRes.data?.data)
          ? projectsRes.data.data
          : [];

        const normalizedUsers = Array.isArray(usersRes.data)
          ? usersRes.data
          : Array.isArray(usersRes.data?.data)
          ? usersRes.data.data
          : [];

        setProjects(normalizedProjects);
        setUsers(normalizedUsers);

        if (normalizedProjects.length > 0) {
          setSelectedProjectId(normalizedProjects[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch initial metadata:", err);
        toast.error("Failed to load project/team lists.");
      } finally {
        setFetchingMetadata(false);
      }
    }

    loadMetadata();
  }, []);

  // File drag & drop handling
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    const allowedExtensions = ["pdf", "txt", "docx", "md"];
    const ext = selectedFile.name.split(".").pop().toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      toast.error("Unsupported file type. Please upload .pdf, .txt, .docx, or .md");
      return;
    }
    // Clear transcript if a file is uploaded to avoid conflict
    setTranscript("");
    setFile(selectedFile);
    toast.success(`Attached: ${selectedFile.name}`);
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Analyze Meeting notes API call
  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!transcript.trim() && !file) {
      toast.error("Please enter transcript text or upload a meeting notes file.");
      return;
    }

    setLoading(true);
    setAnalysisResult(null);
    setSuggestedTasks([]);

    try {
      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      } else {
        formData.append("text", transcript);
      }

      const response = await api.post("/summarizer/analyze", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const data = response.data;
      setAnalysisResult(data);

      if (data.suggested_tasks) {
        const mapped = data.suggested_tasks.map((task, idx) => ({
          ...task,
          id: idx,
          selected: true,
          due_in_days: task.due_in_days ?? 4,
          assignee_name: task.assignee_name || "",
        }));
        setSuggestedTasks(mapped);
      }
      toast.success("Meeting summarized successfully!");
    } catch (err) {
      console.error("Analysis error:", err);
      const msg = err.response?.data?.detail || "Failed to analyze meeting content.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Create tasks bulk generation
  const handleCreateTasks = async () => {
    const selected = suggestedTasks.filter((t) => t.selected);
    if (selected.length === 0) {
      toast.error("Please select at least one task to generate.");
      return;
    }
    if (!selectedProjectId) {
      toast.error("Please select a target project.");
      return;
    }

    setCreatingTasks(true);
    try {
      const payload = {
        project_id: selectedProjectId,
        tasks: selected.map((t) => ({
          title: t.title.trim(),
          priority: t.priority,
          assignee_name: t.assignee_name || null,
          due_in_days: t.due_in_days,
          reason: t.reason,
        })),
      };

      const res = await api.post("/summarizer/create-tasks", payload);
      if (res.data?.success) {
        toast.success(`Successfully generated ${res.data.created_count} tasks!`);
        window.dispatchEvent(new CustomEvent("task-created"));
        
        // Remove created tasks from view
        setSuggestedTasks((prev) => prev.filter((t) => !t.selected));
      }
    } catch (err) {
      console.error("Task generation error:", err);
      const msg = err.response?.data?.detail || "Failed to generate tasks.";
      toast.error(msg);
    } finally {
      setCreatingTasks(false);
    }
  };

  // Task inline editing helper
  const handleUpdateTaskField = (taskId, field, value) => {
    setSuggestedTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, [field]: value } : t))
    );
  };

  const handleToggleTaskSelect = (taskId) => {
    setSuggestedTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, selected: !t.selected } : t))
    );
  };

  const handleSelectAll = (checked) => {
    setSuggestedTasks((prev) => prev.map((t) => ({ ...t, selected: checked })));
  };

  const handleReset = () => {
    setAnalysisResult(null);
    setSuggestedTasks([]);
    setTranscript("");
    clearFile();
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        
        {/* HEADER SECTION */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 p-3 text-white shadow-lg shadow-brand-500/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                AI Meeting Summarizer
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Transform messy transcripts, voice recordings, or documents into structured project tasks.
              </p>
            </div>
          </div>
          
          {analysisResult && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-750"
            >
              <ArrowLeft className="h-4 w-4" />
              Start New Analysis
            </button>
          )}
        </div>

        {fetchingMetadata ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="text-sm text-slate-500">Loading project metadata...</p>
          </div>
        ) : !analysisResult ? (
          
          /* INGESTION SECTION (No analysis output yet) */
          <div className="mx-auto max-w-3xl">
            <form onSubmit={handleAnalyze} className="space-y-6">
              
              {/* TARGET PROJECT SELECTOR */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4">
                  <FolderKanban className="h-5 w-5 text-brand-500" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    1. Destination Project
                  </h2>
                </div>
                <div>
                  <label htmlFor="project-select" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Target Workspace Project
                  </label>
                  <select
                    id="project-select"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus:border-brand-500 focus:ring-brand-500"
                  >
                    <option value="" disabled>Select a project...</option>
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Generated tasks will be populated inside the selected project Board.
                  </p>
                </div>
              </div>

              {/* TRANSCRIPT / AUDIO / FILE INPUT CARD */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-6">
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Brain className="h-5 w-5 text-brand-500" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      2. Input Meeting Content
                    </h2>
                  </div>
                  
                  {/* Speech Dictation Button */}
                  {speechSupported && !file && (
                    <button
                      type="button"
                      onClick={voiceState === "listening" ? stopListening : startListening}
                      className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition shadow-sm ${
                        voiceState === "listening"
                          ? "bg-rose-500 hover:bg-rose-600 text-white animate-pulse"
                          : voiceState === "processing"
                          ? "bg-amber-500 hover:bg-amber-600 text-white"
                          : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-650 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {voiceState === "listening" ? (
                        <>
                          <MicOff className="h-3.5 w-3.5" />
                          Stop Dictating
                        </>
                      ) : voiceState === "processing" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Mic className="h-3.5 w-3.5 text-rose-500" />
                          Dictate Notes
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* File uploaded badge or Drag Zone */}
                {file ? (
                  <div className="rounded-lg border-2 border-dashed border-brand-500/30 bg-brand-500/5 p-6 text-center relative">
                    <button
                      type="button"
                      onClick={clearFile}
                      className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="Remove file"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    <FileText className="mx-auto h-12 w-12 text-brand-500 mb-3" />
                    <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB • Document Attached
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Drag-and-Drop Area */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
                        dragOver
                          ? "border-brand-500 bg-brand-500/5"
                          : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-650"
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept=".pdf,.txt,.docx,.md"
                        className="hidden"
                      />
                      <UploadCloud className="h-10 w-10 text-slate-400 dark:text-slate-500 mb-3" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Drag & drop a meeting file here, or <span className="text-brand-650 dark:text-brand-400 hover:underline">browse</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Supports PDF, TXT, DOCX, or MD files
                      </p>
                    </div>

                    <div className="relative flex py-2 items-center">
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                      <span className="flex-shrink mx-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">Or Paste Text</span>
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                    </div>

                    {/* Text area input */}
                    <div className="relative">
                      <textarea
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="Paste meeting transcript or notes here..."
                        rows={8}
                        className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-brand-500 focus:ring-brand-500"
                      />
                      {voiceState === "listening" && (
                        <div className="absolute inset-x-0 bottom-0 bg-slate-50/90 dark:bg-slate-800/90 p-3 rounded-b-lg border-t border-slate-200 dark:border-slate-700 flex items-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                          </span>
                          <span className="text-xs font-medium text-rose-500 animate-pulse">
                            Listening... Speak to record notes.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION TRIGGER */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-650 to-indigo-650 hover:from-brand-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed px-5 py-3 text-sm font-bold text-white shadow-md transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Analyze Meeting
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          
          /* RESULTS INTERFACE (Analysis populated) */
          <div className="grid gap-8 lg:grid-cols-12">
            
            {/* LEFT COLUMN: Summary, Decisions, Action Items */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Overview Card */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-bl from-brand-500/10 to-transparent rounded-bl-full pointer-events-none" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <Brain className="h-5 w-5 text-brand-500" />
                  Executive Summary
                </h3>
                <p className="text-sm leading-relaxed text-slate-650 dark:text-slate-350">
                  {analysisResult.summary}
                </p>
              </div>

              {/* Key Decisions Card */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-500 rounded-full bg-emerald-500/10 p-0.5" />
                  Key Decisions
                </h3>
                {analysisResult.key_decisions && analysisResult.key_decisions.length > 0 ? (
                  <ul className="space-y-3">
                    {analysisResult.key_decisions.map((decision, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-650 dark:text-slate-350">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                        <span>{decision}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 italic">No key decisions identified.</p>
                )}
              </div>

              {/* Action Items Card */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <CheckSquare className="h-5 w-5 text-indigo-500" />
                  Meeting Action Items
                </h3>
                {analysisResult.action_items && analysisResult.action_items.length > 0 ? (
                  <ul className="space-y-3">
                    {analysisResult.action_items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-650 dark:text-slate-350">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 italic">No direct action items identified.</p>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Suggested Tasks List */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Suggested Tasks
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Refine details below and select tasks to generate under target Board.
                  </p>
                </div>
                
                {suggestedTasks.length > 0 && (
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={suggestedTasks.every((t) => t.selected)}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Select All ({suggestedTasks.length})
                    </span>
                  </label>
                )}
              </div>

              {suggestedTasks.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center">
                  <Check className="mx-auto h-10 w-10 text-emerald-500 bg-emerald-500/10 rounded-full p-2 mb-3" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    All suggested tasks generated successfully!
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Check your project board to track progress.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {suggestedTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`rounded-xl border p-5 transition shadow-sm ${
                        task.selected
                          ? "border-brand-500/40 bg-brand-500/[0.02]"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      }`}
                    >
                      
                      {/* Checkbox + Title edit */}
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={task.selected}
                          onChange={() => handleToggleTaskSelect(task.id)}
                          className="mt-1 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <div className="flex-1">
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => handleUpdateTaskField(task.id, "title", e.target.value)}
                            placeholder="Enter task title"
                            className="w-full border-b border-transparent hover:border-slate-300 focus:border-brand-500 bg-transparent py-0.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Fields grid */}
                      <div className="mt-4 grid gap-4 sm:grid-cols-3 pl-7">
                        
                        {/* Assignee select */}
                        <div>
                          <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                            Assignee
                          </label>
                          <div className="relative">
                            <select
                              value={task.assignee_name || ""}
                              onChange={(e) => handleUpdateTaskField(task.id, "assignee_name", e.target.value)}
                              className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 pl-2.5 pr-8 text-xs text-slate-700 dark:text-slate-300 focus:border-brand-500 focus:ring-brand-500"
                            >
                              <option value="">Unassigned</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.full_name}>
                                  {user.full_name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Priority dropdown */}
                        <div>
                          <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                            Priority
                          </label>
                          <select
                            value={task.priority}
                            onChange={(e) => handleUpdateTaskField(task.id, "priority", e.target.value)}
                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 pl-2.5 pr-8 text-xs text-slate-700 dark:text-slate-300 focus:border-brand-500 focus:ring-brand-500"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>

                        {/* Due in days */}
                        <div>
                          <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                            Due (Days)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={task.due_in_days}
                            onChange={(e) => handleUpdateTaskField(task.id, "due_in_days", parseInt(e.target.value) || 0)}
                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 px-2.5 text-xs text-slate-700 dark:text-slate-300 focus:border-brand-500 focus:ring-brand-500"
                          />
                        </div>
                      </div>

                      {/* Explainability badge */}
                      {task.reason && (
                        <div className="mt-3.5 flex items-start gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-2.5 text-2xs text-slate-500 dark:text-slate-400 pl-7">
                          <AlertCircle className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-semibold text-slate-700 dark:text-slate-300">AI Context:</strong> {task.reason}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* BOTTOM ACTIONS BAR */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 dark:border-slate-800 pt-6 mt-6">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {suggestedTasks.filter((t) => t.selected).length} task(s) selected for generation
                    </p>
                    
                    <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="w-full sm:w-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-750"
                      >
                        Reset / Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateTasks}
                        disabled={creatingTasks || suggestedTasks.filter((t) => t.selected).length === 0}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-brand-650 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-5 py-2 text-sm font-semibold text-white shadow-sm transition"
                      >
                        {creatingTasks ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Create Selected Tasks
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
