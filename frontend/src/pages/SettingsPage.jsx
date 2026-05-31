import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Bell,
  BriefcaseBusiness,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  CreditCard,
  Globe2,
  Grid3X3,
  KeyRound,
  Laptop,
  LayoutDashboard,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  MonitorSmartphone,
  Moon,
  Palette,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Sparkles,
  Sun,
  UserRound,
  X,
  Eye,
  EyeOff,
} from "lucide-react";

import toast from "react-hot-toast";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import {
  updateProfile,
  uploadAvatar,
} from "../services/authService";
import useAuthStore from "../store/authStore";
import useThemeStore from "../store/themeStore";


const sections = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "sessions", label: "Devices", icon: MonitorSmartphone },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "preferences", label: "Workspace", icon: Palette },
  { id: "integrations", label: "Integrations", icon: Grid3X3 },
  { id: "billing", label: "Billing", icon: CreditCard },
];

const SHOW_ACCOUNT_INTEGRATIONS = false;

const defaultNotifications = {
  projectUpdates: true,
  taskMentions: true,
  deadlines: true,
  approvals: true,
  aiCopilotAlerts: true,
  teamActivity: false,
  securityAlerts: true,
};

const notificationRows = [
  ["projectUpdates", "Project updates", "Digest changes across active projects."],
  ["taskMentions", "Task mentions", "Notify when teammates mention you."],
  ["deadlines", "Deadlines", "Remind me before due dates and SLA windows."],
  ["approvals", "Approvals", "Send approval requests and handoff notices."],
  ["aiCopilotAlerts", "AI copilot alerts", "Surface automation summaries and blocked actions."],
  ["teamActivity", "Team activity", "Weekly collaboration and delivery highlights."],
  ["securityAlerts", "Security alerts", "Always send login, MFA, and account safety alerts."],
];

const defaultWorkspacePrefs = {
  compactMode: false,
  focusMode: true,
  defaultDashboard: "Executive overview",
  weekStartsOn: "Monday",
};

const sessionRows = [
  {
    id: "current",
    device: "Current browser",
    meta: "WorkspaceOS web app",
    location: "Active session",
    lastSeen: "Now",
    current: true,
  },
  {
    id: "mac",
    device: "Chrome on macOS",
    meta: "Last authenticated with password and MFA",
    location: "Karachi, PK",
    lastSeen: "2 hours ago",
  },
  {
    id: "mobile",
    device: "Safari on iPhone",
    meta: "Mobile workspace review",
    location: "Karachi, PK",
    lastSeen: "Yesterday",
  },
];

const fallbackIntegrations = [
  { provider: "google", label: "Google", connected: false, icon: Globe2 },
  { provider: "github", label: "GitHub", connected: false, icon: Code2 },
  { provider: "slack", label: "Slack", connected: false, icon: MessageSquare },
  { provider: "discord", label: "Discord", connected: false, icon: MessageCircle },
  { provider: "microsoft", label: "Microsoft", connected: false, icon: BriefcaseBusiness },
];

function loadJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function SectionShell({ id, eyebrow, title, description, icon: Icon, children, action }) {
  return (
    <motion.section
      id={id}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="scroll-mt-24 rounded-xl border border-slate-200/80 bg-white/90 shadow-card ring-1 ring-white/70 backdrop-blur dark:border-slate-800 dark:bg-slate-900/82 dark:ring-white/5"
    >
      <div className="flex min-w-0 flex-col gap-4 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950">
            <Icon size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-2xs font-extrabold uppercase text-brand-600">{eyebrow}</p>
            <h2 className="mt-0.5 text-lg font-extrabold text-slate-950 dark:text-white">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        {action && <div className="flex shrink-0 justify-start sm:justify-end">{action}</div>}
      </div>
      <div className="p-4 sm:p-5">
        {children}
      </div>
    </motion.section>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-2xs font-extrabold uppercase text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs font-medium text-slate-400">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 overflow-hidden rounded-full border transition-all ${
        checked
          ? "border-brand-600 bg-brand-600"
          : "border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
      } ${disabled ? "cursor-not-allowed opacity-60" : "hover:shadow-glow"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function PasswordVisibilityButton({ visible, onClick }) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <button
      type="button"
      aria-label={visible ? "Hide password" : "Show password"}
      onClick={onClick}
      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <Icon size={17} />
    </button>
  );
}

function StatusBadge({ tone = "slate", children, icon: Icon }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300",
    rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300",
    slate: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold ${tones[tone]}`}>
      {Icon && <Icon size={14} />}
      {children}
    </span>
  );
}

export default function SettingsPage() {
  const {
    user,
    updateUser,
  } = useAuthStore();
  const { isDark, toggleDark } = useThemeStore();

  const fileInputRef = useRef(null);
  const [activeSection, setActiveSection] = useState("account");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [fullName, setFullName] = useState(
    user?.full_name ||
    localStorage.getItem("user_name") ||
    ""
  );
  const [email, setEmail] = useState(
    user?.email ||
    localStorage.getItem("user_email") ||
    ""
  );
  const [username, setUsername] = useState(
    localStorage.getItem("settings_username") ||
    (user?.email ? user.email.split("@")[0] : "")
  );
  const [bio, setBio] = useState(localStorage.getItem("settings_bio") || "");
  const [timezone, setTimezone] = useState(localStorage.getItem("settings_timezone") || "Asia/Karachi");
  const [language, setLanguage] = useState(localStorage.getItem("settings_language") || "English");

  const [security, setSecurity] = useState({
    is_verified: false,
    two_factor_enabled: false,
    two_factor_method: null,
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const [setup, setSetup] = useState(null);
  const [googleCode, setGoogleCode] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [notifications, setNotifications] = useState(() =>
    loadJson("settings_notifications", defaultNotifications)
  );
  const [workspacePrefs, setWorkspacePrefs] = useState(() =>
    loadJson("settings_workspace_preferences", defaultWorkspacePrefs)
  );
  const [integrations, setIntegrations] = useState(fallbackIntegrations);
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false);

  const visibleSections = useMemo(
    () =>
      sections.filter(
        (section) =>
          SHOW_ACCOUNT_INTEGRATIONS || section.id !== "integrations"
      ),
    []
  );

  const initials = useMemo(() => {
    const source = fullName || user?.full_name || email || "U";
    return source
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U";
  }, [email, fullName, user?.full_name]);

  const securityScore = useMemo(() => {
    let score = 45;
    if (security.is_verified) score += 20;
    if (security.two_factor_enabled) score += 25;
    if (newPassword.length >= 12) score += 10;
    return Math.min(score, 100);
  }, [newPassword.length, security.is_verified, security.two_factor_enabled]);

  useEffect(() => {
    const loadSecurity = async () => {
      try {
        const response = await api.get("/auth/mfa/status");
        const data = response.data.data;

        setSecurity(data);
        setFullName(data.full_name || "");
        setEmail(data.email || "");
        updateUser(data);
      } catch (error) {
        toast.error(
          error?.response?.data?.detail ||
          "Unable to load security settings"
        );
      }
    };

    loadSecurity();
  }, [updateUser]);

  useEffect(() => {
    if (!SHOW_ACCOUNT_INTEGRATIONS) {
      return;
    }

    const loadIntegrations = async () => {
      try {
        const response = await api.get("/integrations/workspace");
        const workspace = response.data || {};
        const connectedProviders = new Set(
          (workspace.integrations || [])
            .filter((integration) => integration.status === "connected")
            .map((integration) => integration.provider)
        );
        setIntegrations(
          fallbackIntegrations.map((item) => ({
            ...item,
            connected: connectedProviders.has(item.provider),
          }))
        );
      } catch (error) {
        console.info("Integrations workspace unavailable for settings summary", error);
      } finally {
        setIntegrationsLoaded(true);
      }
    };

    loadIntegrations();
  }, []);

  useEffect(() => {
    localStorage.setItem("settings_username", username);
    localStorage.setItem("settings_bio", bio);
    localStorage.setItem("settings_timezone", timezone);
    localStorage.setItem("settings_language", language);
  }, [bio, language, timezone, username]);

  useEffect(() => {
    saveJson("settings_notifications", notifications);
  }, [notifications]);

  useEffect(() => {
    saveJson("settings_workspace_preferences", workspacePrefs);
  }, [workspacePrefs]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarPreview(ev.target.result);
    };
    reader.readAsDataURL(file);

    try {
      setAvatarUploading(true);
      setProfileError(null);

      const result = await uploadAvatar(file);
      updateUser({
        avatar_url: result.avatar_url,
      });
    } catch (error) {
      console.error(error);
      setAvatarPreview(null);
      setProfileError(
        error?.response?.data?.detail ||
        "Failed to upload image. Try a smaller file."
      );
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      setProfileError("Full name cannot be empty.");
      return;
    }

    try {
      setProfileSaving(true);
      setProfileError(null);
      setProfileSuccess(false);

      const result = await updateProfile({
        full_name: fullName,
        email,
      });

      updateUser(result.user);
      setFullName(result.user.full_name || "");
      setEmail(result.user.email || "");
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (error) {
      console.error(error);
      setProfileError(
        error?.response?.data?.detail ||
        "Failed to save profile."
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (!newPassword) {
      setPasswordError("Please enter a new password.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(
        "New password and confirm password do not match."
      );
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordError(
        "New password must be different from your current password."
      );
      return;
    }

    try {
      setPasswordSaving(true);
      setPasswordError(null);
      setPasswordSuccess(false);

      await api.put("/users/password", {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 4000);
    } catch (error) {
      console.error(error);
      setPasswordError(
        error?.response?.data?.detail ||
        "Failed to update password. Please try again."
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const refreshSecurity = (data) => {
    if (data.user) {
      setSecurity(data.user);
      return;
    }

    setSecurity(data);
  };

  const enableEmailMfa = async () => {
    try {
      setLoadingAction("email");

      const response = await api.post(
        "/auth/mfa/enable-email",
        { method: "email" }
      );

      refreshSecurity(response.data);
      setSetup(null);
      toast.success("Email 2FA enabled");
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
        "Unable to enable email 2FA"
      );
    } finally {
      setLoadingAction("");
    }
  };

  const startGoogleSetup = async () => {
    if (setup) {
      toast.success("Use the current QR code");
      return;
    }

    try {
      setLoadingAction("google");

      const response = await api.post(
        "/auth/mfa/setup-google"
      );

      setSetup(response.data);
      setGoogleCode("");
      toast.success("Scan the QR code");
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
        "Unable to start authenticator setup"
      );
    } finally {
      setLoadingAction("");
    }
  };

  const verifyGoogleSetup = async (event) => {
    event.preventDefault();

    if (googleCode.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }

    try {
      setLoadingAction("verify-google");

      const response = await api.post(
        "/auth/mfa/verify-google",
        {
          code: googleCode,
          setup_token: setup?.setup_token,
        }
      );

      refreshSecurity(response.data);
      setSetup(null);
      setGoogleCode("");
      toast.success("Google Authenticator enabled");
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
        "Invalid authenticator code"
      );
    } finally {
      setLoadingAction("");
    }
  };

  const disableMfa = async () => {
    try {
      setLoadingAction("disable");

      const response = await api.post(
        "/auth/mfa/disable"
      );

      refreshSecurity(response.data);
      setSetup(null);
      toast.success("2FA disabled");
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
        "Unable to disable 2FA"
      );
    } finally {
      setLoadingAction("");
    }
  };

  const scrollToSection = (id) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 via-cyan-500 to-emerald-400" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={security.two_factor_enabled ? "emerald" : "amber"} icon={security.two_factor_enabled ? ShieldCheck : ShieldOff}>
                  {security.two_factor_enabled ? "Protected account" : "MFA recommended"}
                </StatusBadge>
                <StatusBadge tone={security.is_verified ? "emerald" : "amber"} icon={Mail}>
                  {security.is_verified ? "Email verified" : "Email pending"}
                </StatusBadge>
              </div>
              <h1 className="mt-3 text-3xl font-extrabold text-slate-950 dark:text-white sm:text-4xl">
                Account center
              </h1>
              <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
                Manage identity, sign-in protection, devices, notifications, workspace preferences, and subscription details.
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/70 sm:min-w-[360px]">
              {[
                ["Security", `${securityScore}%`, ShieldCheck],
                ["MFA", security.two_factor_method || "Off", KeyRound],
                SHOW_ACCOUNT_INTEGRATIONS
                  ? ["Apps", integrations.filter((item) => item.connected).length, Grid3X3]
                  : ["Theme", isDark ? "Dark" : "Light", Palette],
              ].map(([label, value, Icon]) => (
                <div key={label} className="rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2 text-slate-400">
                    <span className="text-2xs font-extrabold uppercase">{label}</span>
                    <Icon size={14} />
                  </div>
                  <p className="mt-1 truncate text-lg font-extrabold capitalize text-slate-950 dark:text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
            <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white/90 p-2 shadow-card backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 xl:block xl:space-y-1 xl:overflow-visible">
              {visibleSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => scrollToSection(section.id)}
                    className={`flex min-w-max items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-all xl:w-full ${
                      isActive
                        ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    <Icon size={17} />
                    <span>{section.label}</span>
                    <ChevronRight size={15} className="ml-auto hidden xl:block" />
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 space-y-5">
            <SectionShell
              id="account"
              eyebrow="Account"
              title="Profile management"
              description="Keep your public identity and workspace defaults accurate across the product."
              icon={UserRound}
              action={
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={profileSaving}
                  className="button-primary w-full sm:w-auto"
                >
                  {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : profileSuccess ? <Check className="h-4 w-4" /> : null}
                  {profileSaving ? "Saving" : profileSuccess ? "Saved" : "Save profile"}
                </button>
              }
            >
              <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handleAvatarClick}
                      className="group relative h-22 w-22 shrink-0 overflow-hidden rounded-xl border border-white bg-slate-200 shadow-sm ring-1 ring-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:ring-slate-700"
                    >
                      {avatarUploading ? (
                        <span className="flex h-full w-full items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                        </span>
                      ) : (avatarPreview || user?.avatar_url) ? (
                        <img
                          src={avatarPreview || user.avatar_url}
                          alt="Profile"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 to-brand-700 text-2xl font-black text-white">
                          {initials}
                        </span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 opacity-0 transition-opacity group-hover:opacity-100">
                        <Camera className="h-5 w-5 text-white" />
                      </span>
                    </button>
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold text-slate-950 dark:text-white">{fullName || "Unnamed user"}</p>
                      <p className="truncate text-sm font-medium text-slate-500">{email || "No email set"}</p>
                      <button
                        type="button"
                        onClick={handleAvatarClick}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <Camera size={14} />
                        {avatarUploading ? "Uploading" : "Upload photo"}
                      </button>
                    </div>
                  </div>
                  <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">
                    JPG, PNG, WEBP, or GIF. This uses the existing avatar upload endpoint.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Full name">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      className="control-input"
                    />
                  </Field>
                  <Field label="Username" hint="Stored locally until backend support is available.">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      className="control-input"
                    />
                  </Field>
                  <Field label="Email address">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="control-input"
                    />
                  </Field>
                  <Field label="Timezone">
                    <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="control-input">
                      <option>Asia/Karachi</option>
                      <option>UTC</option>
                      <option>America/New_York</option>
                      <option>Europe/London</option>
                      <option>Asia/Dubai</option>
                    </select>
                  </Field>
                  <Field label="Language preference">
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="control-input">
                      <option>English</option>
                      <option>Urdu</option>
                      <option>Arabic</option>
                      <option>French</option>
                      <option>Spanish</option>
                    </select>
                  </Field>
                  <Field label="Bio">
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Add a short workspace bio"
                      className="control-input min-h-[86px] resize-y md:col-span-2"
                    />
                  </Field>
                </div>
              </div>

              <AnimatePresence>
                {profileSuccess && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                    <Check className="h-4 w-4" />
                    Profile saved successfully.
                  </motion.div>
                )}
                {profileError && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{profileError}</span>
                    <button type="button" onClick={() => setProfileError(null)} aria-label="Dismiss profile error">
                      <X className="h-4 w-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </SectionShell>

            <SectionShell
              id="security"
              eyebrow="Security"
              title="Password and authentication"
              description="Protect your workspace with a strong password, verified email, and multi-factor authentication."
              icon={ShieldCheck}
              action={<StatusBadge tone={security.two_factor_enabled ? "emerald" : "amber"} icon={security.two_factor_enabled ? CheckCircle2 : ShieldOff}>{security.two_factor_enabled ? "MFA enabled" : "MFA off"}</StatusBadge>}
            >
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                      <Mail className="h-4 w-4 text-brand-600" />
                      <p className="mt-2 text-xs font-bold text-slate-500">Email verification</p>
                      <p className="font-extrabold text-slate-950 dark:text-white">{security.is_verified ? "Verified" : "Pending"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                      <Lock className="h-4 w-4 text-brand-600" />
                      <p className="mt-2 text-xs font-bold text-slate-500">OTP method</p>
                      <p className="font-extrabold capitalize text-slate-950 dark:text-white">{security.two_factor_method || "None"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                      <Sparkles className="h-4 w-4 text-brand-600" />
                      <p className="mt-2 text-xs font-bold text-slate-500">Security score</p>
                      <p className="font-extrabold text-slate-950 dark:text-white">{securityScore}%</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <h3 className="text-sm font-extrabold text-slate-950 dark:text-white">Change password</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Current password">
                        <div className="relative">
                          <input
                            type={showCurrentPw ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => {
                              setCurrentPassword(e.target.value);
                              setPasswordError(null);
                            }}
                            placeholder="Enter current password"
                            className="control-input pr-11"
                          />
                          <PasswordVisibilityButton visible={showCurrentPw} onClick={() => setShowCurrentPw(!showCurrentPw)} />
                        </div>
                      </Field>
                      <Field label="New password">
                        <div className="relative">
                          <input
                            type={showNewPw ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => {
                              setNewPassword(e.target.value);
                              setPasswordError(null);
                            }}
                            placeholder="Enter new password"
                            className="control-input pr-11"
                          />
                          <PasswordVisibilityButton visible={showNewPw} onClick={() => setShowNewPw(!showNewPw)} />
                        </div>
                      </Field>
                      <Field label="Confirm new password">
                        <div className="relative">
                          <input
                            type={showConfirmPw ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => {
                              setConfirmPassword(e.target.value);
                              setPasswordError(null);
                            }}
                            placeholder="Confirm new password"
                            className={`control-input pr-11 ${
                              confirmPassword && confirmPassword !== newPassword
                                ? "border-rose-300 focus:border-rose-400"
                                : confirmPassword && confirmPassword === newPassword
                                  ? "border-emerald-300 focus:border-emerald-400"
                                  : ""
                            }`}
                          />
                          <PasswordVisibilityButton visible={showConfirmPw} onClick={() => setShowConfirmPw(!showConfirmPw)} />
                        </div>
                      </Field>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleUpdatePassword}
                          disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                          className="button-primary w-full bg-slate-950 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                        >
                          {passwordSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                          {passwordSaving ? "Updating" : "Update password"}
                        </button>
                      </div>
                    </div>
                    {newPassword && (
                      <p className={`mt-3 text-xs font-extrabold ${
                        newPassword.length >= 12
                          ? "text-emerald-600"
                          : newPassword.length >= 8
                            ? "text-amber-600"
                            : "text-rose-600"
                      }`}>
                        {newPassword.length >= 12
                          ? "Strong password"
                          : newPassword.length >= 8
                            ? "Acceptable password. Longer is better."
                            : "Too short. Minimum 8 characters."}
                      </p>
                    )}
                    <AnimatePresence>
                      {passwordSuccess && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                          <Check className="h-4 w-4" />
                          Password updated successfully.
                        </motion.div>
                      )}
                      {passwordError && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{passwordError}</span>
                          <button type="button" onClick={() => setPasswordError(null)} aria-label="Dismiss password error">
                            <X className="h-4 w-4" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-extrabold text-slate-950 dark:text-white">Email OTP</h3>
                        <p className="mt-1 text-sm text-slate-500">Receive a 6-digit code during sign-in.</p>
                      </div>
                      <Mail className="h-5 w-5 text-brand-600" />
                    </div>
                    <button
                      type="button"
                      onClick={enableEmailMfa}
                      disabled={loadingAction !== ""}
                      className="button-secondary mt-4 w-full justify-center"
                    >
                      {loadingAction === "email" && <Loader2 className="h-4 w-4 animate-spin" />}
                      Enable email OTP
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-extrabold text-slate-950 dark:text-white">Authenticator app</h3>
                        <p className="mt-1 text-sm text-slate-500">Use a rotating TOTP code.</p>
                      </div>
                      <Smartphone className="h-5 w-5 text-emerald-600" />
                    </div>
                    <button
                      type="button"
                      onClick={startGoogleSetup}
                      disabled={loadingAction !== "" || !!setup}
                      className="button-secondary mt-4 w-full justify-center"
                    >
                      {loadingAction === "google" && <Loader2 className="h-4 w-4 animate-spin" />}
                      {setup ? "Setup pending" : "Set up authenticator"}
                    </button>

                    {setup && (
                      <form onSubmit={verifyGoogleSetup} className="mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                          <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                            <img src={setup.qr_code} alt="Google Authenticator QR code" className="aspect-square w-full object-contain" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-2xs font-extrabold uppercase text-slate-400">Manual key</p>
                            <p className="mt-2 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs font-bold text-slate-700 dark:bg-slate-950 dark:text-slate-200">{setup.secret}</p>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={googleCode}
                              onChange={(event) =>
                                setGoogleCode(
                                  event.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 6)
                                )
                              }
                              className="control-input mt-3 h-11 font-mono text-lg tracking-[0.2em]"
                              placeholder="000000"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={loadingAction !== "" || googleCode.length !== 6}
                          className="button-primary w-full"
                        >
                          {loadingAction === "verify-google" && <Loader2 className="h-4 w-4 animate-spin" />}
                          Verify and enable
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/70 dark:bg-rose-950/20">
                    <div className="flex items-start gap-3">
                      <KeyRound className="mt-0.5 h-5 w-5 text-rose-600" />
                      <div>
                        <h3 className="font-extrabold text-rose-950 dark:text-rose-200">Disable 2FA</h3>
                        <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">Password-only sign-in will be allowed again.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={disableMfa}
                      disabled={loadingAction !== "" || !security.two_factor_enabled}
                      className="button-danger mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingAction === "disable" && <Loader2 className="h-4 w-4 animate-spin" />}
                      Disable 2FA
                    </button>
                  </div>
                </div>
              </div>
            </SectionShell>

            <SectionShell
              id="sessions"
              eyebrow="Devices"
              title="Devices and sessions"
              description="Session management UI is ready. Backend session APIs are not assumed, so revoke actions are disabled gracefully."
              icon={MonitorSmartphone}
            >
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {sessionRows.map((session) => (
                  <div key={session.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {session.current ? <Laptop size={19} /> : <MonitorSmartphone size={19} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-extrabold text-slate-950 dark:text-white">{session.device}</p>
                          {session.current && <StatusBadge tone="emerald">Current</StatusBadge>}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{session.meta}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                          <Clock3 size={13} />
                          {session.location} - {session.lastSeen}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-extrabold text-slate-400 dark:border-slate-800 dark:bg-slate-950"
                    >
                      <RotateCcw size={14} />
                      Revoke unavailable
                    </button>
                  </div>
                ))}
              </div>
            </SectionShell>

            <SectionShell
              id="notifications"
              eyebrow="Notifications"
              title="Preference center"
              description="Choose which email notifications should be sent for collaboration, workflow, AI, and security events."
              icon={Bell}
              action={<StatusBadge tone="slate">Local preferences</StatusBadge>}
            >
              <div className="grid gap-3 md:grid-cols-2">
                {notificationRows.map(([key, title, description]) => (
                  <div key={key} className="flex min-w-0 items-start gap-3 overflow-hidden rounded-xl border border-slate-200 p-4 transition-colors hover:border-brand-200 hover:bg-brand-50/30 dark:border-slate-800 dark:hover:bg-slate-800/50 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-extrabold text-slate-950 dark:text-white">{title}</h3>
                      <p className="mt-1 text-sm text-slate-500">{description}</p>
                    </div>
                    <div className="flex h-7 shrink-0 items-start justify-end">
                      <Toggle
                        label={title}
                        checked={notifications[key]}
                        disabled={key === "securityAlerts"}
                        onChange={(value) => setNotifications((current) => ({ ...current, [key]: value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SectionShell>

            <SectionShell
              id="preferences"
              eyebrow="Workspace"
              title="Workspace preferences"
              description="Personalize density, theme, timezone, language, focus settings, and default dashboard behavior."
              icon={Palette}
              action={<StatusBadge tone="emerald" icon={CheckCircle2}>Autosaved locally</StatusBadge>}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {isDark ? <Moon size={19} /> : <Sun size={19} />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-slate-950 dark:text-white">Appearance</h3>
                        <p className="text-sm text-slate-500">{isDark ? "Dark mode" : "Light mode"}</p>
                      </div>
                    </div>
                    <Toggle label="Toggle dark mode" checked={isDark} onChange={toggleDark} />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <LayoutDashboard className="h-5 w-5 text-brand-600" />
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-slate-950 dark:text-white">Compact mode</h3>
                        <p className="text-sm text-slate-500">Increase dashboard density.</p>
                      </div>
                    </div>
                    <Toggle label="Toggle compact mode" checked={workspacePrefs.compactMode} onChange={(value) => setWorkspacePrefs((current) => ({ ...current, compactMode: value }))} />
                  </div>
                </div>
                <Field label="Default dashboard layout">
                  <select
                    value={workspacePrefs.defaultDashboard}
                    onChange={(e) => setWorkspacePrefs((current) => ({ ...current, defaultDashboard: e.target.value }))}
                    className="control-input"
                  >
                    <option>Executive overview</option>
                    <option>My tasks</option>
                    <option>Team operations</option>
                    <option>AI command center</option>
                  </select>
                </Field>
                <Field label="Week starts on">
                  <select
                    value={workspacePrefs.weekStartsOn}
                    onChange={(e) => setWorkspacePrefs((current) => ({ ...current, weekStartsOn: e.target.value }))}
                    className="control-input"
                  >
                    <option>Monday</option>
                    <option>Sunday</option>
                    <option>Saturday</option>
                  </select>
                </Field>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 lg:col-span-2">
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Sparkles className="h-5 w-5 text-brand-600" />
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-slate-950 dark:text-white">Productivity focus</h3>
                        <p className="text-sm text-slate-500">Prioritize AI summaries, blocked work, and upcoming deadlines.</p>
                      </div>
                    </div>
                    <Toggle label="Toggle productivity focus" checked={workspacePrefs.focusMode} onChange={(value) => setWorkspacePrefs((current) => ({ ...current, focusMode: value }))} />
                  </div>
                </div>
              </div>
            </SectionShell>

            {SHOW_ACCOUNT_INTEGRATIONS && (
              <SectionShell
                id="integrations"
                eyebrow="Integrations"
                title="Connected accounts"
                description="A compact account-center view of provider connection status. Full OAuth flows remain on the Integrations page."
                icon={Grid3X3}
                action={<StatusBadge tone={integrationsLoaded ? "emerald" : "slate"}>{integrationsLoaded ? "Status loaded" : "Loading"}</StatusBadge>}
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {integrations.map((integration) => {
                    const Icon = integration.icon;
                    return (
                      <div key={integration.provider} className="rounded-xl border border-slate-200 p-4 transition-all hover:-translate-y-0.5 hover:shadow-card-hover dark:border-slate-800">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                            <Icon size={19} />
                          </div>
                          <StatusBadge tone={integration.connected ? "emerald" : "slate"}>
                            {integration.connected ? "Connected" : "Not connected"}
                          </StatusBadge>
                        </div>
                        <h3 className="mt-4 font-extrabold text-slate-950 dark:text-white">{integration.label}</h3>
                        <p className="mt-1 text-sm text-slate-500">{integration.connected ? "Available for workflow automation." : "Ready to connect from Integrations."}</p>
                      </div>
                    );
                  })}
                </div>
              </SectionShell>
            )}

            <SectionShell
              id="billing"
              eyebrow="Billing"
              title="Billing and subscription"
              description="Plan and usage summary placeholder. Payments are intentionally not implemented here."
              icon={CreditCard}
              action={<StatusBadge tone="slate">No payment changes</StatusBadge>}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-2xs font-extrabold uppercase text-brand-600">Current plan</p>
                      <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Team Starter</h3>
                      <p className="mt-1 text-sm text-slate-500">Workspace collaboration, AI assistance, and core integrations.</p>
                    </div>
                    <button type="button" className="button-primary">
                      Upgrade
                    </button>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Seats", "8 / 12"],
                      ["AI actions", "64%"],
                      ["Storage", "41%"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                        <p className="text-xs font-bold text-slate-500">{label}</p>
                        <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                  <h3 className="font-extrabold text-slate-950 dark:text-white">Usage guardrails</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">Add billing APIs later for invoices, payment methods, limits, and upgrade flows without changing this section layout.</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full w-[64%] rounded-full bg-gradient-to-r from-brand-600 to-emerald-500" />
                  </div>
                </div>
              </div>
            </SectionShell>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
