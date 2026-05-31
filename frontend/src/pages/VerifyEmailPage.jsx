import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Loader2,
  MailCheck,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import toast from "react-hot-toast";

import api from "../services/api";


export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email || "";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [countdown, setCountdown] = useState(
    location.state?.resendAfter || 60
  );

  const canResend = countdown <= 0 && !resending;

  const progress = useMemo(() => {
    return Math.max(0, Math.min(100, (countdown / 60) * 100));
  }, [countdown]);

  useEffect(() => {
    if (!email) {
      navigate("/signup");
    }
  }, [email, navigate]);

  useEffect(() => {
    if (countdown <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setCountdown((value) => value - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  const handleOtpChange = (event) => {
    setOtp(
      event.target.value
        .replace(/\D/g, "")
        .slice(0, 6)
    );
  };

  const persistSession = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("workflowos_token", data.token);
    localStorage.setItem("user_role", data.user.role);
    localStorage.setItem("user_name", data.user.full_name);
    localStorage.setItem("user_email", data.user.email);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (otp.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post(
        "/auth/verify-email",
        {
          email,
          otp,
        }
      );

      persistSession(response.data);
      setVerified(true);
      toast.success("Email verified");

      window.setTimeout(() => {
        navigate("/dashboard");
      }, 900);
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
        "Verification failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResending(true);

      const response = await api.post(
        "/auth/resend-otp",
        { email }
      );

      setOtp("");
      setCountdown(response.data.resend_after || 60);
      toast.success("New code sent");
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
        "Unable to resend code"
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 grid lg:grid-cols-[0.95fr_1.05fr]">
      <div className="hidden lg:flex flex-col justify-between bg-slate-950 text-white p-10 overflow-hidden relative">
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
            <Brain size={24} />
          </div>

          <h1 className="text-2xl font-bold">
            WorkflowOS
          </h1>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 mb-8">
            <ShieldCheck size={16} />
            Protected account activation
          </div>

          <h2 className="text-5xl font-bold leading-tight">
            Confirm ownership before the workspace opens.
          </h2>

          <p className="mt-6 text-lg leading-relaxed text-slate-300">
            Every new account starts pending verification. Codes expire quickly,
            resend windows are rate-limited, and failed attempts are capped.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-3 text-sm">
          {["10 min expiry", "60s resend", "5 attempts"].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-200"
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-md bg-white border border-slate-100 sm:border-slate-200 rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-slate-950 text-white flex items-center justify-center">
              {verified ? (
                <CheckCircle2 size={25} />
              ) : (
                <MailCheck size={25} />
              )}
            </div>

            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">
                Email check
              </p>
              <p className="text-sm font-semibold text-slate-700">
                {email}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
              Verify your email
            </h2>

            <p className="text-slate-500 mt-3 leading-relaxed">
              Enter the 6-digit code sent to your inbox to activate your account.
            </p>
          </div>

          {verified ? (
            <div className="mt-8 rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-emerald-800">
              <p className="font-semibold">
                Verification complete
              </p>
              <p className="text-sm mt-1">
                Opening your dashboard now.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-5"
            >
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={handleOtpChange}
                placeholder="000000"
                className="w-full h-16 rounded-xl border border-slate-300 bg-slate-50 text-center text-2xl sm:text-3xl font-bold tracking-[0.25em] sm:tracking-[0.35em] focus:bg-white focus:outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10 transition-all placeholder:text-slate-300"
                required
              />

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full h-12 rounded-xl bg-slate-950 text-white font-semibold hover:bg-slate-800 disabled:opacity-50 shadow-lg shadow-slate-950/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {loading && (
                  <Loader2
                    size={18}
                    className="animate-spin"
                  />
                )}
                Verify account
              </button>
            </form>
          )}

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                Resend code
              </span>
              <span className="font-mono text-slate-500">
                {countdown > 0 ? `${countdown}s` : "Ready"}
              </span>
            </div>

            <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-slate-950 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            <button
              type="button"
              onClick={handleResend}
              disabled={!canResend}
              className="mt-4 w-full h-11 rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {resending ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <RotateCcw size={17} />
              )}
              Send a new code
            </button>
          </div>

          <div className="mt-7 flex justify-center">
            <Link
              to="/signup"
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-950 transition"
            >
              <ArrowLeft size={16} />
              Back to signup
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
