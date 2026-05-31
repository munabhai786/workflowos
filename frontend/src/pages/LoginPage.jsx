import { useState } from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Brain,
  Eye,
  EyeOff,
  Layers3,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

import { motion } from "framer-motion";

import toast from "react-hot-toast";

import useAuthStore from "../store/authStore";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

function BrandMark() {
  return (
    <Link to="/" className="inline-flex items-center gap-3" aria-label="WorkflowOS home">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
        <Layers3 size={21} />
      </span>
      <span className="text-xl font-extrabold tracking-tight text-slate-950">
        WorkflowOS
      </span>
    </Link>
  );
}

function ProductPanel() {
  const insightRows = [
    { icon: Brain, title: "AI risk signals", detail: "2 launch blockers need review" },
    { icon: BarChart3, title: "Velocity forecast", detail: "Sprint confidence up 24%" },
    { icon: ShieldCheck, title: "Protected access", detail: "MFA-ready workspace security" },
  ];

  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-slate-950 p-8 text-white lg:flex lg:flex-col">
      <motion.div
        className="absolute left-10 top-16 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl"
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl"
        animate={{ scale: [1.05, 1, 1.05], opacity: [0.6, 0.95, 0.6] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-3" aria-label="WorkflowOS home">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-950">
            <Layers3 size={21} />
          </span>
          <span className="text-xl font-extrabold tracking-tight">WorkflowOS</span>
        </Link>
        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-cyan-100 backdrop-blur">
          Secure sign in
        </span>
      </div>

      <div className="relative z-10 flex flex-1 items-center">
        <motion.div
          className="w-full"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-cyan-100">
            <Sparkles size={16} />
            Intelligent workflow command center
          </motion.div>
          <motion.h1 variants={fadeUp} className="max-w-xl text-5xl font-black leading-tight tracking-tight">
            Welcome back to your team's operating layer.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
            Sign in to prioritize work, surface delivery risks, and keep every
            project moving from one premium workspace.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl"
          >
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                    Today
                  </p>
                  <h2 className="mt-1 text-xl font-extrabold">Execution Brief</h2>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/25">
                  <Zap size={20} />
                </div>
              </div>

              <div className="space-y-3">
                {insightRows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.title} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-cyan-100">
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-white">{row.title}</p>
                        <p className="text-xs font-semibold text-slate-400">{row.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <p className="relative z-10 text-sm font-semibold text-slate-400">
        Trusted workflow foundation for focused, high-velocity teams.
      </p>
    </aside>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await login({
        email: email.trim(),
        password,
      });

      if (result?.mfaRequired) {
        toast.success("Verification required");
        navigate(
          "/mfa",
          {
            state: {
              mfaToken: result.mfaToken,
              method: result.method,
              resendAfter: result.resendAfter || 0,
              email: email.trim(),
            },
          }
        );
        return;
      }

      navigate("/dashboard");
    } catch (err) {
      console.error(err);

      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 401) {
        setError(
          detail ||
          "Incorrect email or password. Please check your credentials."
        );
      } else if (status === 422) {
        setError("Please enter a valid email and password.");
      } else if (!navigator.onLine) {
        setError(
          "No internet connection. Please check your network."
        );
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-slate-950 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <ProductPanel />

      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-6 lg:px-10">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.13),transparent_32%)]" />
        <motion.div
          className="absolute left-1/2 top-0 -z-10 h-[520px] w-[640px] -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-500/15 via-violet-500/12 to-cyan-400/15 blur-3xl"
          animate={{ scale: [1, 1.05, 1], rotate: [0, 3, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.section
          className="w-full max-w-md"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="mb-8 flex justify-center lg:hidden">
            <BrandMark />
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="rounded-3xl border border-white/80 bg-white/82 p-6 shadow-2xl shadow-slate-950/10 backdrop-blur-xl sm:p-8"
          >
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
                <Lock size={24} />
              </div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Secure Access
              </p>
              <h1 className="text-4xl font-black tracking-tight text-slate-950">
                Welcome back
              </h1>
              <p className="mt-4 text-sm font-medium leading-7 text-slate-600 sm:text-base">
                Sign in to continue managing work, insights, and team execution.
              </p>
            </div>

            <form
              onSubmit={handleLogin}
              noValidate
              className="mt-8 space-y-5"
            >
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="flex-1 text-sm font-semibold leading-6 text-red-700">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="rounded-lg p-1 text-red-400 transition hover:bg-red-100 hover:text-red-600"
                    aria-label="Dismiss error"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              )}

              <div>
                <label htmlFor="email" className="text-sm font-extrabold text-slate-800">
                  Email Address
                </label>
                <div className="relative mt-2">
                  <Mail
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="you@company.com"
                    autoComplete="email"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 py-4 pl-12 pr-4 text-base font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="text-sm font-extrabold text-slate-800">
                  Password
                </label>
                <div className="relative mt-2">
                  <Lock
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 py-4 pl-12 pr-13 text-base font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm font-extrabold text-blue-600 transition hover:text-blue-700 hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>

              <motion.button
                type="submit"
                disabled={isLoading}
                whileTap={{ scale: 0.98 }}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-4 text-base font-extrabold text-white shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-blue-600/25 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight size={18} className="transition group-hover:translate-x-1" />
                  </>
                )}
              </motion.button>
            </form>

            <div className="mt-7 text-center text-sm font-semibold text-slate-500">
              Don't have an account?
              <Link
                to="/signup"
                className="ml-2 font-extrabold text-blue-600 transition hover:text-blue-700 hover:underline"
              >
                Signup
              </Link>
            </div>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-6 flex items-center justify-center gap-2 text-center text-sm font-bold text-slate-500"
          >
            <ShieldCheck size={16} className="text-emerald-500" />
            Enterprise-grade protected login system
          </motion.div>
        </motion.section>
      </main>
    </div>
  );
}
