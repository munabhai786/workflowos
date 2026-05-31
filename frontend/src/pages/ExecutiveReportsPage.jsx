import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  FileDown,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";


const fallbackTypes = [
  { value: "weekly", label: "Weekly Report" },
  { value: "sprint", label: "Sprint Report" },
  { value: "project", label: "Project Report" },
  { value: "executive", label: "Executive Summary" },
  { value: "productivity", label: "Productivity Report" },
  { value: "deadline_risk", label: "Deadline Risk Report" },
];


function formatDate(value) {
  if (!value) return "Not generated";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}


function downloadBlob(response, fallbackName) {
  const contentDisposition = response.headers["content-disposition"] || "";
  const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  const filename = filenameMatch
    ? decodeURIComponent(filenameMatch[1].replaceAll('"', ""))
    : fallbackName;
  const blob = new Blob([response.data], {
    type: response.headers["content-type"] || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}


function ReportMarkdown({ markdown }) {
  const blocks = useMemo(() => {
    if (!markdown) return [];

    return markdown
      .split(/\n(?=##?\s)/g)
      .map((block) => block.trim())
      .filter(Boolean);
  }, [markdown]);

  if (!markdown) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
        <div>
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No report generated yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a report type and generate from live workspace data.</p>
        </div>
      </div>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="space-y-5">
        {blocks.map((block, index) => {
          const [heading, ...body] = block.split("\n");
          const cleanHeading = heading.replace(/^#+\s*/, "");
          const content = body.join("\n").trim();

          return (
            <section key={`${cleanHeading}-${index}`} className={index === 0 ? "" : "border-t border-slate-100 pt-5 dark:border-slate-700"}>
              {index === 0 ? (
                <h2 className="text-2xl font-bold text-slate-950 dark:text-slate-100">{cleanHeading}</h2>
              ) : (
                <h3 className="text-base font-bold text-slate-950 dark:text-slate-100">{cleanHeading}</h3>
              )}
              {content && (
                <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {content}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
}


export default function ExecutiveReportsPage() {
  const [reportTypes, setReportTypes] = useState(fallbackTypes);
  const [reportType, setReportType] = useState("weekly");
  const [history, setHistory] = useState([]);
  const [currentReport, setCurrentReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function fetchReports() {
    try {
      const [typesResponse, historyResponse] = await Promise.all([
        api.get("/executive-reports/types"),
        api.get("/executive-reports/history"),
      ]);

      if (Array.isArray(typesResponse.data) && typesResponse.data.length) {
        setReportTypes(typesResponse.data);
      }

      const reports = Array.isArray(historyResponse.data) ? historyResponse.data : [];
      setHistory(reports);
      setCurrentReport((current) => current || reports[0] || null);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReports();
  }, []);

  async function generateReport() {
    try {
      setGenerating(true);
      const response = await api.post("/executive-reports/generate", {
        report_type: reportType,
      });
      setCurrentReport(response.data);
      setHistory((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)].slice(0, 12));
      toast.success("Executive report generated");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }

  async function exportReport(format) {
    if (!currentReport?.id) return;

    try {
      const response = await api.get(`/executive-reports/${currentReport.id}/${format}`, {
        responseType: "blob",
      });
      downloadBlob(response, format === "pdf" ? "workflowos_report.pdf" : "workflowos_report.md");
    } catch (error) {
      toast.error(error?.response?.data?.detail || `Failed to export ${format.toUpperCase()}`);
    }
  }

  async function copyReport() {
    if (!currentReport?.markdown) return;

    try {
      await navigator.clipboard.writeText(currentReport.markdown);
      toast.success("Report copied");
    } catch (error) {
      toast.error("Clipboard access was blocked");
    }
  }

  const sourceCounts = currentReport?.source_counts || {};
  const selectedTypeLabel =
    reportTypes.find((type) => type.value === reportType)?.label || "Report";

  if (loading) {
    return (
      <MainLayout>
        <div className="grid gap-4">
          <div className="h-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-[520px] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-slate-950 p-3 text-white dark:bg-slate-100 dark:text-slate-950">
              <FileText size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-950 dark:text-slate-100">Executive Reports</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Claude-generated reports grounded in tasks, projects, deadlines, approvals, activity, and analytics.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={reportType}
              onChange={(event) => setReportType(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {reportTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={generateReport}
              disabled={generating}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate Report
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Projects", sourceCounts.projects || 0, CheckCircle2],
            ["Tasks", sourceCounts.tasks || 0, FileText],
            ["Deadline risks", sourceCounts.overdue_tasks || 0, AlertTriangle],
            ["Activity logs", sourceCounts.activity_events_loaded || 0, RefreshCw],
          ].map(([label, value, Icon]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-slate-100">{value}</p>
                </div>
                <div className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
              <div>
                <p className="text-sm font-bold text-slate-950 dark:text-slate-100">{currentReport?.title || selectedTypeLabel}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Generated {formatDate(currentReport?.generated_at || currentReport?.created_at)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyReport} disabled={!currentReport} className="button-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  <Clipboard className="h-4 w-4" />
                  Copy
                </button>
                <button type="button" onClick={() => exportReport("markdown")} disabled={!currentReport} className="button-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  <Download className="h-4 w-4" />
                  Markdown
                </button>
                <button type="button" onClick={() => exportReport("pdf")} disabled={!currentReport} className="button-primary disabled:cursor-not-allowed disabled:opacity-50">
                  <FileDown className="h-4 w-4" />
                  PDF
                </button>
              </div>
            </div>

            <ReportMarkdown markdown={currentReport?.markdown} />
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-700">
              <h2 className="font-bold text-slate-950 dark:text-slate-100">Report History</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Recent generated reports are stored as AI summaries.</p>
            </div>
            <div className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
              {history.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">No report history yet.</p>
              ) : (
                history.map((report) => (
                  <button
                    type="button"
                    key={report.id}
                    onClick={() => setCurrentReport(report)}
                    className={`w-full px-4 py-4 text-left transition ${
                      currentReport?.id === report.id
                        ? "bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950"
                        : "hover:bg-slate-50 dark:hover:bg-slate-900"
                    }`}
                  >
                    <p className="truncate text-sm font-bold">{report.title}</p>
                    <p className={`mt-1 text-xs ${currentReport?.id === report.id ? "text-white/65 dark:text-slate-600" : "text-slate-400"}`}>
                      {formatDate(report.created_at || report.generated_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
}
