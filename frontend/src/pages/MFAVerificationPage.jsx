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
  KeyRound,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import toast from "react-hot-toast";

import api from "../services/api";


export default function MFAVerificationPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const mfaToken = location.state?.mfaToken || "";
  const method = location.state?.method || "email";
  const email = location.state?.email || "";

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(
    location.state?.resendAfter || 0
  );

  const isEmail = method === "email";
  const canResend = isEmail && countdown <= 0 && !resending;

  const progress = useMemo(() => {
    return Math.max(0, Math.min(100, (countdown / 60) * 100));
  }, [countdown]);

  useEffect(() => {
    if (!mfaToken) {
      navigate("/login");
    }
  }, [mfaToken, navigate]);

  useEffect(() => {
    if (countdown <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setCountdown((value) => value - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  const persistSession = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user_role", data.user.role);
    localStorage.setItem("user_name", data.user.full_name);
    localStorage.setItem("user_email", data.user.email);
  };

  const handleCodeChange = (event) => {
    setCode(
      event.target.value
        .replace(/\D/g, "")
        .slice(0, 6)
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (code.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post(
        "/auth/verify-mfa",
        {
          mfa_token: mfaToken,
          code,
        }
      );

      persistSession(response.data);
      toast.success("Login verified");
      navigate("/dashboard");
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

      setCode("");
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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-8">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-xl bg-slate-950 text-white flex items-center justify-center">
            {isEmail ? (
              <KeyRound size={24} />
            ) : (
              <Smartphone size={24} />
            )}
          </div>

          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 flex items-center gap-2">
            <ShieldCheck size={16} />
            MFA active
          </div>
        </div>

        <div className="mt-8">
          <h1 className="text-3xl font-bold text-slate-950">
            Confirm it is you
          </h1>

          <p className="text-slate-500 mt-3 leading-relaxed">
            {isEmail
              ? "Enter the one-time code sent to your email."
              : "Enter the rotating code from your authenticator app."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5"
        >
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={handleCodeChange}
            placeholder="000000"
            className="w-full h-16 rounded-xl border border-slate-300 bg-slate-50 text-center text-3xl font-bold tracking-[0.35em] focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950"
            required
          />

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full h-12 rounded-xl bg-slate-950 text-white font-semibold hover:bg-black disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading && (
              <Loader2
                size={18}
                className="animate-spin"
              />
            )}
            Verify and continue
          </button>
        </form>

        {isEmail && (
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
              className="mt-4 w-full h-11 rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold hover:border-slate-950 disabled:opacity-50 transition flex items-center justify-center gap-2"
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
        )}

        <div className="mt-7 flex justify-center">
          <Link
            to="/login"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-950 transition"
          >
            <ArrowLeft size={16} />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
