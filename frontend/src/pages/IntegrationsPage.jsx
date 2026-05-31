import { useEffect, useState } from "react";

import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Code2,
  ExternalLink,
  Globe2,
  KeyRound,
  Link2,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Video,
  Webhook,
} from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { createRealtimeConnection } from "../services/realtime";


const PROVIDER_ICONS = {
  github: Code2,
  slack: MessageSquare,
  discord: MessageSquare,
  google: CalendarDays,
  microsoft: CalendarDays,
  zoom: Video,
  webhook: Webhook,
};


function relativeTime(value) {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}


function statusClass(status) {
  if (["connected", "delivered", "processed", "completed", "active"].includes(status)) {
    return "bg-emerald-50 text-emerald-700";
  }
  if (["failed", "rejected", "refresh_required"].includes(status)) {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-slate-100 text-slate-600";
}


function providerSetupUrl(provider) {
  const urls = {
    github: "https://github.com/settings/developers",
    slack: "https://api.slack.com/apps",
    google: "https://console.cloud.google.com/apis/credentials",
    discord: "https://discord.com/developers/applications",
    microsoft: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  };
  return urls[provider];
}


export default function IntegrationsPage() {
  const [workspace, setWorkspace] = useState({
    providers: [],
    integrations: [],
    oauth_accounts: [],
    tokens: [],
    webhook_endpoints: [],
    webhook_logs: [],
    scopes: [],
    metrics: {},
  });
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("github");
  const [tokenDraft, setTokenDraft] = useState({
    name: "Operations API token",
    scopes: ["read:tasks", "analytics:read"],
  });
  const [webhookDraft, setWebhookDraft] = useState({
    name: "External orchestration webhook",
    provider: "webhook",
    events: "task.created,github.pull_request,slack.approval",
  });
  const [revealedToken, setRevealedToken] = useState("");
  const [revealedSecret, setRevealedSecret] = useState("");

  async function fetchWorkspace({ silent = false } = {}) {
    try {
      const response = await api.get("/integrations/workspace");
      setWorkspace(response.data || {});
    } catch (error) {
      console.error(error);
      if (!silent) toast.error(error.response?.data?.detail || "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWorkspace();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauth");
    const integration = params.get("integration");

    if (oauthStatus === "success") {
      toast.success(`${integration || "Integration"} connected`);
      window.history.replaceState({}, "", "/integrations");
    }

    if (oauthStatus === "failed") {
      toast.error(`${integration || "Integration"} authorization failed`);
      window.history.replaceState({}, "", "/integrations");
    }
  }, []);

  useEffect(() => {
    const stop = createRealtimeConnection({
      onMessage: (message) => {
        if (
          [
            "integration.connected",
            "integration.disconnected",
            "integration.webhook.received",
            "integration.external_event.processed",
            "integration.external_event.failed",
            "integration.sync.completed",
            "sync.completed",
          ].includes(message.event)
        ) {
          fetchWorkspace({ silent: true });
        }
      },
    });
    return stop;
  }, []);

  async function connectProvider(selectedProvider) {
    try {
      const response = await api.post(`/integrations/oauth/${selectedProvider}/start`, {
        frontend_return_url: `${window.location.origin}/integrations`,
      });
      if (!response.data?.authorization_url) {
        toast.error("OAuth authorization URL was not returned");
        return;
      }
      window.location.assign(response.data.authorization_url);
    } catch (error) {
      console.error(error);
      const detail = error.response?.data?.detail;
      toast.error(detail?.message || detail || "Failed to start OAuth authorization");
    }
  }

  async function disconnectIntegration(integrationId) {
    try {
      await api.delete(`/integrations/${integrationId}`);
      toast.success("Integration disconnected");
      fetchWorkspace({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error("Failed to disconnect integration");
    }
  }

  function connectedAccount(integration) {
    return (workspace.oauth_accounts || []).find((account) => account.integration_id === integration?.id);
  }

  function providerDetails(integration) {
    const sync = integration?.sync || {};

    if (integration?.provider === "github") {
      return {
        label: "Repositories",
        items: sync.repositories || [],
        secondary: "Organizations",
        secondaryItems: sync.organizations || [],
      };
    }

    if (integration?.provider === "slack") {
      return {
        label: "Channels",
        items: sync.channels || [],
        secondary: "Workflow approvals",
        secondaryItems: sync.notification_configuration?.approval_actions ? [{ name: "Enabled" }] : [],
      };
    }

    if (integration?.provider === "google") {
      return {
        label: "Calendars",
        items: sync.calendars || [],
        secondary: "Drive access",
        secondaryItems: [{ name: sync.drive_access_status || "Pending" }],
      };
    }

    if (integration?.provider === "microsoft") {
      return {
        label: "Calendars",
        items: sync.calendars || [],
        secondary: "Teams-ready meetings",
        secondaryItems: sync.teams_ready ? [{ name: "Enabled" }] : [],
      };
    }

    if (integration?.provider === "discord") {
      return {
        label: "Servers",
        items: sync.guilds || [],
        secondary: "Alerts",
        secondaryItems: [{ name: "Ready" }],
      };
    }

    return {
      label: "Synced objects",
      items: [],
      secondary: "Status",
      secondaryItems: [],
    };
  }

  function workspaceLabel(integration, account) {
    const metadata = integration?.metadata || account?.metadata || {};
    return (
      metadata.workspace_id ||
      metadata.team_id ||
      metadata.tenant_id ||
      metadata.team_url ||
      metadata.user_principal_name ||
      metadata.email ||
      "Account linked"
    );
  }

  async function createToken(event) {
    event.preventDefault();
    try {
      const response = await api.post("/integrations/tokens", tokenDraft);
      setRevealedToken(response.data?.token || "");
      toast.success("API token created");
      fetchWorkspace({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Failed to create token");
    }
  }

  async function revokeToken(tokenId) {
    try {
      await api.delete(`/integrations/tokens/${tokenId}`);
      toast.success("Token revoked");
      fetchWorkspace({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error("Failed to revoke token");
    }
  }

  async function createWebhookEndpoint(event) {
    event.preventDefault();
    try {
      const response = await api.post("/integrations/webhook-endpoints", {
        name: webhookDraft.name,
        provider: webhookDraft.provider,
        direction: "inbound",
        events: webhookDraft.events.split(",").map((item) => item.trim()).filter(Boolean),
      });
      setRevealedSecret(response.data?.secret || "");
      toast.success("Webhook endpoint created");
      fetchWorkspace({ silent: true });
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Failed to create webhook");
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="h-[720px] animate-pulse rounded-lg bg-slate-200" />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-slate-950 p-3 text-white">
              <Globe2 size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-950">
                Integrations Workspace
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Connect communication, developer workflow, calendar, storage, and external orchestration systems.
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchWorkspace({ silent: true })}
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Connected apps", workspace.metrics?.connected_apps || 0, CheckCircle2, "text-emerald-600"],
            ["Webhook events", workspace.metrics?.webhook_events || 0, Webhook, "text-blue-600"],
            ["Failures", workspace.metrics?.webhook_failures || 0, AlertTriangle, "text-rose-600"],
            ["Active tokens", workspace.metrics?.active_tokens || 0, KeyRound, "text-violet-600"],
          ].map(([label, value, Icon, tone]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <Icon size={18} className={tone} />
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <section className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link2 size={18} className="text-slate-600" />
                  <h2 className="font-bold text-slate-950">Connected Apps</h2>
                </div>
                <div className="flex rounded-md bg-slate-100 p-1">
                  {(workspace.providers || []).map((item) => (
                    <button
                      key={item.provider}
                      onClick={() => setProvider(item.provider)}
                      className={`rounded px-3 py-1.5 text-xs font-bold capitalize ${
                        provider === item.provider ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                      }`}
                    >
                      {item.provider}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 p-4 lg:grid-cols-2">
                {(workspace.providers || []).map((item) => {
                  const Icon = PROVIDER_ICONS[item.provider] || Globe2;
                  const isOAuthProvider = ["github", "slack", "discord", "google", "microsoft"].includes(item.provider);
                  const needsConfiguration = isOAuthProvider && !item.oauth_configured;
                  const connected = (workspace.integrations || []).find(
                    (integration) => integration.provider === item.provider && integration.status === "connected"
                  );
                  const account = connectedAccount(connected);
                  const details = providerDetails(connected);
                  return (
                    <article key={item.provider} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {connected?.avatar_url || account?.avatar_url ? (
                            <img
                              src={connected?.avatar_url || account?.avatar_url}
                              alt=""
                              className="h-10 w-10 rounded-md object-cover ring-1 ring-slate-200"
                            />
                          ) : (
                            <div className="rounded-md bg-slate-950 p-2 text-white">
                              <Icon size={20} />
                            </div>
                          )}
                          <div>
                            <h3 className="font-bold capitalize text-slate-950">
                              {connected?.account_name || item.provider}
                            </h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {connected
                                ? `${item.provider} OAuth - ${workspaceLabel(connected, account)}`
                                : (item.capabilities || []).slice(0, 3).join(", ")}
                            </p>
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(connected ? "connected" : needsConfiguration ? "failed" : "available")}`}>
                          {connected ? "connected" : needsConfiguration ? "setup required" : "available"}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(item.capabilities || []).map((capability) => (
                          <span key={capability} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                            {capability}
                          </span>
                        ))}
                      </div>
                      {connected && (
                        <div className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase text-slate-400">
                              {details.label}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {details.items.slice(0, 5).map((detail) => (
                                <span
                                  key={detail.id || detail.name || detail.full_name || detail.summary}
                                  className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200"
                                >
                                  {detail.full_name || detail.summary || detail.name}
                                </span>
                              ))}
                              {details.items.length === 0 && (
                                <span className="text-xs font-semibold text-slate-500">
                                  Sync pending
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase text-slate-400">
                              {details.secondary}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {details.secondaryItems.slice(0, 4).map((detail) => (
                                <span
                                  key={detail.id || detail.name || detail.login || detail.summary}
                                  className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200"
                                >
                                  {detail.login || detail.summary || detail.name}
                                </span>
                              ))}
                              {details.secondaryItems.length === 0 && (
                                <span className="text-xs font-semibold text-slate-500">
                                  None discovered
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {needsConfiguration && (
                        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                          <p className="text-sm font-bold text-amber-900">
                            OAuth app credentials required
                          </p>
                          <p className="mt-1 text-xs leading-5 text-amber-800">
                            Add {item.missing_config?.join(" and ")} to backend/.env, restart FastAPI, and set this callback URL in the provider app:
                          </p>
                          <code className="mt-2 block break-all rounded bg-white px-2 py-2 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
                            http://localhost:8000/api/v1/integrations/oauth/{item.provider}/callback
                          </code>
                          {providerSetupUrl(item.provider) && (
                            <a
                              href={providerSetupUrl(item.provider)}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-amber-900"
                            >
                              Open provider console
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      )}
                      <div className="mt-4 flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                          Connected: {relativeTime(connected?.connected_at)}
                        </p>
                        {connected ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => connectProvider(item.provider)}
                              className="rounded-md px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                            >
                              Reconnect
                            </button>
                            <button
                              onClick={() => disconnectIntegration(connected.id)}
                              className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Disconnect"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        ) : needsConfiguration ? (
                          <button
                            disabled
                            className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-slate-200 px-3 py-2 text-xs font-bold text-slate-500"
                          >
                            <AlertTriangle size={14} />
                            Configure OAuth
                          </button>
                        ) : isOAuthProvider ? (
                          <button
                            onClick={() => connectProvider(item.provider)}
                            className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white"
                          >
                            <ShieldCheck size={14} />
                            Connect OAuth
                          </button>
                        ) : (
                          <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                            Configure below
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                  <Webhook size={18} className="text-slate-600" />
                  <h2 className="font-bold text-slate-950">Webhook Monitor</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {(workspace.webhook_logs || []).slice(0, 10).map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">
                          {log.provider || "webhook"} - {log.event_type}
                        </p>
                        <p className="text-xs text-slate-500">{relativeTime(log.received_at)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(log.status)}`}>
                        {log.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                  <ShieldCheck size={18} className="text-slate-600" />
                  <h2 className="font-bold text-slate-950">OAuth Accounts</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {(workspace.oauth_accounts || []).length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500">No OAuth accounts linked yet.</p>
                  ) : (
                    (workspace.oauth_accounts || []).map((account) => (
                      <div key={account.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {account.avatar_url ? (
                            <img
                              src={account.avatar_url}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
                            />
                          ) : (
                            <div className="h-9 w-9 shrink-0 rounded-md bg-slate-950" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold capitalize text-slate-950">
                              {account.account_name || account.provider}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {account.external_account_email || `${account.provider} account`}
                            </p>
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(account.status)}`}>
                          {account.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </section>

          <aside className="space-y-5">
            <form onSubmit={createToken} className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                <KeyRound size={18} className="text-slate-600" />
                <h2 className="font-bold text-slate-950">API Tokens</h2>
              </div>
              <div className="space-y-4 p-4">
                <input
                  value={tokenDraft.name}
                  onChange={(event) => setTokenDraft((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Token name"
                />
                <div className="grid gap-2">
                  {(workspace.scopes || []).map((scope) => (
                    <label key={scope} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                      {scope}
                      <input
                        type="checkbox"
                        checked={tokenDraft.scopes.includes(scope)}
                        onChange={(event) => {
                          setTokenDraft((current) => ({
                            ...current,
                            scopes: event.target.checked
                              ? [...current.scopes, scope]
                              : current.scopes.filter((item) => item !== scope),
                          }));
                        }}
                        className="h-4 w-4"
                      />
                    </label>
                  ))}
                </div>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
                  <Plus size={16} />
                  Create token
                </button>
                {revealedToken && (
                  <div className="break-all rounded-md bg-amber-50 p-3 text-xs font-bold text-amber-800">
                    {revealedToken}
                  </div>
                )}
                <div className="divide-y divide-slate-100">
                  {(workspace.tokens || []).slice(0, 5).map((token) => (
                    <div key={token.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-bold text-slate-950">{token.name}</p>
                        <p className="text-xs text-slate-500">{token.token_prefix} - {token.revoked_at ? "revoked" : "active"}</p>
                      </div>
                      {!token.revoked_at && (
                        <button
                          type="button"
                          onClick={() => revokeToken(token.id)}
                          className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Revoke"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </form>

            <form onSubmit={createWebhookEndpoint} className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                <Code2 size={18} className="text-slate-600" />
                <h2 className="font-bold text-slate-950">Inbound Webhook</h2>
              </div>
              <div className="space-y-4 p-4">
                <input
                  value={webhookDraft.name}
                  onChange={(event) => setWebhookDraft((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Endpoint name"
                />
                <select
                  value={webhookDraft.provider}
                  onChange={(event) => setWebhookDraft((current) => ({ ...current, provider: event.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold"
                >
                  {(workspace.providers || []).map((item) => (
                    <option key={item.provider} value={item.provider}>{item.provider}</option>
                  ))}
                </select>
                <textarea
                  value={webhookDraft.events}
                  onChange={(event) => setWebhookDraft((current) => ({ ...current, events: event.target.value }))}
                  className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Comma separated event names"
                />
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
                  <Webhook size={16} />
                  Create webhook
                </button>
                {revealedSecret && (
                  <div className="break-all rounded-md bg-amber-50 p-3 text-xs font-bold text-amber-800">
                    {revealedSecret}
                  </div>
                )}
                <div className="space-y-2">
                  {(workspace.webhook_endpoints || []).slice(0, 5).map((endpoint) => (
                    <div key={endpoint.id} className="rounded-md bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-950">{endpoint.name}</p>
                        <Radio size={15} className={endpoint.enabled ? "text-emerald-600" : "text-slate-400"} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {endpoint.provider} - {endpoint.direction} - {endpoint.events?.length || 0} events
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </form>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-blue-600" />
                <h2 className="font-bold text-slate-950">AI Orchestration Feed</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                GitHub, Slack, Discord, calendar, deployment, and webhook events are normalized for automations, realtime updates, and AI operational intelligence.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
}
