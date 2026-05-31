// frontend/src/pages/SignupPage.jsx

import { useState } from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  ArrowRight,
  Briefcase,
  Brain,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Layers3,
  Loader2,
  Lock,
  Mail,
  Shield,
  Sparkles,
  User,
  UserCheck,
  Users,
  Workflow,
} from "lucide-react";

import { motion } from "framer-motion";

import toast from "react-hot-toast";

import api from "../services/api";

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

function ProductPanel({ invitedEmail, invitedRole }) {
  const highlights = [
    {
      icon: Brain,
      title: "AI Insights",
      detail: "Predict risks and surface priority work.",
      accent: "from-blue-500 to-cyan-400",
    },
    {
      icon: Users,
      title: "Team Collaboration",
      detail: "Coordinate ownership and decisions.",
      accent: "from-emerald-500 to-teal-400",
    },
    {
      icon: Shield,
      title: "Role-based Security",
      detail: "Protected access for every workspace.",
      accent: "from-violet-500 to-fuchsia-400",
    },
    {
      icon: Briefcase,
      title: "Smart Productivity",
      detail: "Turn execution into a repeatable system.",
      accent: "from-amber-500 to-orange-400",
    },
  ];

  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-slate-950 p-8 text-white lg:flex lg:flex-col">
      <motion.div
        className="absolute left-0 top-16 h-80 w-80 rounded-full bg-blue-500/25 blur-3xl"
        animate={{ scale: [1, 1.08, 1], opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 right-8 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl"
        animate={{ scale: [1.05, 1, 1.05], opacity: [0.65, 0.95, 0.65] }}
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
          Guided setup
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
            Create your workflow command center
          </motion.div>
          <motion.h1 variants={fadeUp} className="max-w-xl text-5xl font-black leading-tight tracking-tight">
            Start with a workspace that feels sharp from day one.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
            Build a modern operating layer for projects, priorities, analytics,
            and secure team collaboration.
          </motion.p>

          {invitedEmail || invitedRole ? (
            <motion.div variants={fadeUp} className="mt-8 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm font-semibold text-cyan-100">
              Invitation detected. Your email or workspace role may be pre-filled
              to keep onboarding secure and accurate.
            </motion.div>
          ) : null}

          <motion.div variants={fadeUp} className="mt-10 grid grid-cols-2 gap-3">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-xl">
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${item.accent} text-white shadow-lg`}>
                    <Icon size={20} />
                  </div>
                  <h2 className="text-sm font-extrabold text-white">{item.title}</h2>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">
                    {item.detail}
                  </p>
                </div>
              );
            })}
          </motion.div>
        </motion.div>
      </div>

      <p className="relative z-10 text-sm font-semibold text-slate-400">
        Built for modern teams, startups, freelancers, and enterprises.
      </p>
    </aside>
  );
}

export default function SignupPage() {

  const navigate = useNavigate();

  const [searchParams] =
    useSearchParams();


  // INVITATION PARAMS

  const invitedRole =
    searchParams.get("role");

  const invitedEmail =
    searchParams.get("email");

  const invitationToken =
    searchParams.get("token");


  const [loading, setLoading] =
    useState(false);

  const [showPassword, setShowPassword] =
    useState(false);


  const [formData, setFormData] =
    useState({

      full_name: "",

      email: invitedEmail || "",

      password: "",

      account_type: "Freelancer",

      role: invitedRole || "Viewer",
    });


  const handleChange = (e) => {

    setFormData({

      ...formData,

      [e.target.name]:
        e.target.value,
    });

  };

  const handleSubmit = async (e) => {

    e.preventDefault();

    try {

      setLoading(true);


      const response =
        await api.post(
          "/auth/register",
          {

            ...formData,

            invitation_token:
              invitationToken,
          }
        );


      toast.success(
        "Verification code sent"
      );


      navigate(
        "/verify-email",
        {
          state: {
            email:
              response.data.email ||
              formData.email,
            resendAfter:
              response.data.resend_after || 60,
          },
        }
      );

    } catch (error) {

      console.error(error);

      toast.error(
        error?.response?.data?.detail ||
        "Signup failed"
      );

    } finally {

      setLoading(false);

    }

  };


  return (

    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-slate-950 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <ProductPanel invitedEmail={invitedEmail} invitedRole={invitedRole} />

      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8 sm:px-6 lg:px-10">
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
          <motion.div variants={fadeUp} className="mb-6 flex justify-center lg:hidden">
            <BrandMark />
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="rounded-3xl border border-white/80 bg-white/82 p-6 shadow-2xl shadow-slate-950/10 backdrop-blur-xl sm:p-8"
          >
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
                <Workflow size={24} />
              </div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Start Your Workspace
              </p>
              <h1 className="text-4xl font-black tracking-tight text-slate-950">
                Create your account
              </h1>
              <p className="mt-4 text-sm font-medium leading-7 text-slate-600 sm:text-base">
                Launch a secure WorkflowOS workspace for smarter planning,
                execution, and team visibility.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-4"
            >
              <div>
                <label htmlFor="full_name" className="text-sm font-extrabold text-slate-800">
                  Full Name
                </label>
                <div className="relative mt-2">
                  <User
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="full_name"
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 py-3.5 pl-12 pr-4 text-base font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    required
                  />
                </div>
              </div>

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
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={!!invitedEmail}
                    placeholder="you@company.com"
                    autoComplete="email"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 py-3.5 pl-12 pr-4 text-base font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    required
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
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 py-3.5 pl-12 pr-13 text-base font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    required
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="account_type" className="text-sm font-extrabold text-slate-800">
                    Account Type
                  </label>
                  <div className="relative mt-2">
                    <select
                      id="account_type"
                      name="account_type"
                      value={formData.account_type}
                      onChange={handleChange}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white/90 py-3.5 pl-4 pr-10 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    >
                      <option value="Freelancer">
                        Freelancer
                      </option>

                      <option value="Startup">
                        Startup
                      </option>

                      <option value="Enterprise">
                        Enterprise
                      </option>
                    </select>
                    <ChevronDown
                      size={17}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="role" className="text-sm font-extrabold text-slate-800">
                    Platform Role
                  </label>
                  <div className="relative mt-2">
                    <select
                      id="role"
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      disabled={!!invitedRole}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white/90 py-3.5 pl-4 pr-10 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <option value="Admin">
                        Admin
                      </option>

                      <option value="Manager">
                        Manager
                      </option>

                      <option value="Team Member">
                        Team Member
                      </option>

                      <option value="Freelancer">
                        Freelancer
                      </option>

                      <option value="Viewer">
                        Viewer
                      </option>
                    </select>
                    <ChevronDown
                      size={17}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={loading}
                whileTap={{ scale: 0.98 }}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-4 text-base font-extrabold text-white shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-blue-600/25 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {
                  loading
                    ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Account...
                      </>
                    )
                    : (
                      <>
                        Create Account
                        <ArrowRight size={18} className="transition group-hover:translate-x-1" />
                      </>
                    )
                }
              </motion.button>
            </form>

            <div className="mt-7 text-center text-sm font-semibold text-slate-500">
              Already have an account?

              <Link
                to="/login"
                className="ml-2 font-extrabold text-blue-600 transition hover:text-blue-700 hover:underline"
              >
                Login
              </Link>
            </div>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-6 grid gap-3 text-sm font-bold text-slate-500 sm:grid-cols-2"
          >
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl">
              <UserCheck size={16} className="text-emerald-500" />
              Role-based access
            </div>
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl">
              <CheckCircle2 size={16} className="text-blue-500" />
              OTP verification
            </div>
          </motion.div>
        </motion.section>
      </main>
    </div>
  );
}
