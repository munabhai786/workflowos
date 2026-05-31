import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Layers3,
  LockKeyhole,
  Menu,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const navItems = [
  { label: "Features", href: "#features" },
  { label: "Benefits", href: "#benefits" },
  { label: "Testimonials", href: "#testimonials" },
];

const heroMetrics = [
  { value: "42%", label: "faster planning cycles" },
  { value: "3.8x", label: "more visible execution" },
  { value: "99.9%", label: "workflow uptime focus" },
];

const features = [
  {
    icon: Brain,
    title: "AI workflow intelligence",
    description:
      "Surface bottlenecks, predict delivery risks, and convert scattered work into clear next actions.",
    accent: "from-blue-500 to-cyan-400",
  },
  {
    icon: Workflow,
    title: "Adaptive Kanban operations",
    description:
      "Plan, prioritize, and rebalance work across teams with a fast board built for daily execution.",
    accent: "from-violet-500 to-fuchsia-400",
  },
  {
    icon: BarChart3,
    title: "Executive analytics",
    description:
      "Track velocity, blockers, workload, and delivery confidence in one polished command center.",
    accent: "from-emerald-500 to-teal-400",
  },
  {
    icon: Users,
    title: "Team collaboration hub",
    description:
      "Keep decisions, ownership, and updates connected so teams move without status-meeting drag.",
    accent: "from-amber-500 to-orange-400",
  },
];

const benefits = [
  {
    icon: Target,
    title: "Know what matters now",
    description:
      "AI prioritization highlights the work with the highest business impact and the highest risk.",
  },
  {
    icon: Clock3,
    title: "Protect delivery rhythm",
    description:
      "Spot aging tasks, overloaded teammates, and dependency gaps before they become launch delays.",
  },
  {
    icon: ShieldCheck,
    title: "Build operational trust",
    description:
      "Give leaders a reliable view of execution without asking teams to maintain extra reporting rituals.",
  },
];

const testimonials = [
  {
    quote:
      "WorkflowOS gave our product and engineering teams one calm operating layer. We finally see priorities, risks, and progress without chasing updates.",
    name: "Sarah Johnson",
    role: "VP Product, Northstar Labs",
    initials: "SJ",
  },
  {
    quote:
      "The AI recommendations are useful because they are tied to real workflow context. It helped us remove blockers a full sprint earlier.",
    name: "Michael Lee",
    role: "Engineering Lead, Apex Cloud",
    initials: "ML",
  },
  {
    quote:
      "It feels like the operating system our startup needed. Polished enough for leadership, fast enough for makers, and simple enough to adopt.",
    name: "Emma Carter",
    role: "Founder, Loomline",
    initials: "EC",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
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

function SectionHeader({ eyebrow, title, description }) {
  return (
    <motion.div
      className="mx-auto mb-12 max-w-3xl text-center sm:mb-16"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={fadeUp}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
        {eyebrow}
      </p>
      <h2 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
        {title}
      </h2>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
        {description}
      </p>
    </motion.div>
  );
}

function NavbarSection() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = () => setMobileMenu(false);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        isScrolled
          ? "border-slate-200/80 bg-white/82 shadow-sm backdrop-blur-xl"
          : "border-transparent bg-white/60 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="group flex items-center gap-3"
          onClick={closeMenu}
          aria-label="WorkflowOS home"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
            <Layers3 size={20} />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-slate-950">
            WorkflowOS
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur-xl md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-950 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/login"
            className="rounded-full px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
          >
            Login
          </Link>
          <Link
            to="/signup"
            className="group inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-blue-600/25"
          >
            Get Started
            <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm md:hidden"
          onClick={() => setMobileMenu((current) => !current)}
          aria-label={mobileMenu ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileMenu}
        >
          {mobileMenu ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileMenu && (
        <motion.div
          className="border-t border-slate-200/80 bg-white/95 px-5 py-5 shadow-xl shadow-slate-950/5 backdrop-blur-xl md:hidden"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="mx-auto grid max-w-7xl gap-2">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className="rounded-xl px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </a>
            ))}
            <Link
              to="/login"
              onClick={closeMenu}
              className="rounded-xl px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              Login
            </Link>
            <Link
              to="/signup"
              onClick={closeMenu}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-950/15"
            >
              Get Started
              <ArrowRight size={16} />
            </Link>
          </div>
        </motion.div>
      )}
    </header>
  );
}

function DashboardMockup() {
  const columns = [
    {
      title: "Now",
      color: "bg-blue-500",
      cards: ["Prioritize launch work", "Review AI delivery risks"],
    },
    {
      title: "Next",
      color: "bg-violet-500",
      cards: ["Sync design blockers", "Update sprint forecast"],
    },
    {
      title: "Done",
      color: "bg-emerald-500",
      cards: ["Approve onboarding flow", "Publish metrics brief"],
    },
  ];

  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, ease: "easeOut", delay: 0.12 }}
    >
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-blue-500/20 via-violet-500/12 to-cyan-400/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-3 shadow-2xl shadow-slate-950/15 backdrop-blur-xl">
        <div className="rounded-[1.35rem] border border-slate-200 bg-slate-950 p-4 text-white sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                Command Center
              </p>
              <h3 className="mt-1 text-xl font-bold">Product Launch OS</h3>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-emerald-200 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Live sync
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold text-white">Workflow board</p>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200">
                  18 active
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {columns.map((column) => (
                  <div
                    key={column.title}
                    className="rounded-xl border border-white/10 bg-slate-900/80 p-3"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${column.color}`} />
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-300">
                        {column.title}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {column.cards.map((card) => (
                        <div
                          key={card}
                          className="rounded-lg border border-white/10 bg-white/[0.07] p-3 text-xs font-semibold leading-5 text-slate-100"
                        >
                          {card}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-bold">AI brief</p>
                  <Sparkles size={17} className="text-cyan-200" />
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  Launch confidence is high. Move QA unblocker into today's focus
                  lane to protect release timing.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-bold">Velocity</p>
                  <span className="text-xs font-bold text-emerald-200">+24%</span>
                </div>
                <div className="flex h-20 items-end gap-2">
                  {[42, 58, 48, 72, 64, 88, 78].map((height, index) => (
                    <motion.span
                      key={height + index}
                      className="flex-1 rounded-t-md bg-gradient-to-t from-blue-500 to-cyan-300"
                      initial={{ height: 10 }}
                      animate={{ height }}
                      transition={{ delay: 0.3 + index * 0.05, duration: 0.55 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-14 sm:px-6 sm:pb-24 lg:px-8 lg:pb-28 lg:pt-20">
      <motion.div
        className="absolute left-1/2 top-0 -z-10 h-[680px] w-[920px] -translate-x-1/2 rounded-full bg-[linear-gradient(135deg,rgba(59,130,246,0.2),rgba(124,58,237,0.16),rgba(6,182,212,0.18))] blur-3xl"
        animate={{ scale: [1, 1.06, 1], rotate: [0, 4, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-x-0 top-0 -z-20 h-full bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_35%),radial-gradient(circle_at_top_right,rgba(124,58,237,0.12),transparent_30%)]" />

      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_0.95fr]">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="max-w-4xl"
        >
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/75 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm backdrop-blur-xl"
          >
            <Sparkles size={16} />
            AI-powered execution for modern teams
          </motion.div>

          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-5xl text-5xl font-black tracking-tight text-slate-950 sm:text-6xl lg:text-7xl"
          >
            Run every workflow from one intelligent command center.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl sm:leading-9"
          >
            WorkflowOS brings AI recommendations, Kanban execution, team
            collaboration, and productivity analytics into a polished operating
            layer for high-performing teams.
          </motion.p>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              to="/signup"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-7 py-4 text-base font-extrabold text-white shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-blue-600/25"
            >
              Start free
              <ArrowRight size={18} className="transition group-hover:translate-x-1" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/75 px-7 py-4 text-base font-extrabold text-slate-800 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
            >
              <PlayCircle size={18} />
              Login to workspace
            </Link>
          </motion.div>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mt-10 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {heroMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-xl"
              >
                <p className="text-2xl font-black text-slate-950">{metric.value}</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                  {metric.label}
                </p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <DashboardMockup />
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="bg-white px-5 py-20 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow="Feature System"
          title="Everything teams need to move with clarity"
          description="A connected workflow platform where AI, execution boards, analytics, and collaboration reinforce each other."
        />

        <motion.div
          className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: "easeOut" }}
                whileHover={{ y: -6 }}
              >
                <Link
                  to="/signup"
                  className="group relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-600/10"
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${feature.accent}`}
                  />
                  <div
                    className={`mb-7 flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.accent} text-white shadow-lg`}
                  >
                    <Icon size={24} />
                  </div>
                  <h3 className="text-xl font-extrabold tracking-tight text-slate-950">
                    {feature.title}
                  </h3>
                  <p className="mt-4 flex-1 text-sm leading-7 text-slate-600">
                    {feature.description}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1 text-sm font-extrabold text-blue-600">
                    Explore capability
                    <ChevronRight
                      size={16}
                      className="transition group-hover:translate-x-1"
                    />
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section
      id="benefits"
      className="relative overflow-hidden bg-slate-50 px-5 py-20 sm:px-6 sm:py-24 lg:px-8"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.35 }}
          variants={stagger}
        >
          <motion.p
            variants={fadeUp}
            className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-blue-600"
          >
            Operating Advantage
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl"
          >
            Replace fragmented work tracking with one calm source of truth.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-xl text-lg leading-8 text-slate-600"
          >
            WorkflowOS turns day-to-day execution into a reliable operating
            system: less chasing, fewer surprises, and better decisions at every
            level of the company.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-blue-600/20 hover:-translate-y-0.5 hover:bg-blue-700"
            >
              Build your workspace
              <ArrowRight size={17} />
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          className="grid gap-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={stagger}
        >
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={benefit.title}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-600/10 sm:p-6"
              >
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
                    <Icon size={22} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-3">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                        0{index + 1}
                      </span>
                      <span className="h-px w-10 bg-slate-200" />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-950">
                      {benefit.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="bg-white px-5 py-20 sm:px-6 sm:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow="Customer Proof"
          title="Built for teams that expect their tools to feel sharp"
          description="Premium workflow software should make every stakeholder more confident, from founders to team leads to individual contributors."
        />

        <motion.div
          className="grid gap-5 lg:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          {testimonials.map((testimonial) => (
            <motion.article
              key={testimonial.name}
              variants={fadeUp}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition hover:-translate-y-1 hover:bg-white hover:shadow-xl hover:shadow-slate-950/8"
            >
              <div className="mb-6 flex items-center gap-1 text-amber-400">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Sparkles key={index} size={15} fill="currentColor" />
                ))}
              </div>
              <p className="text-base font-medium leading-8 text-slate-700">
                "{testimonial.quote}"
              </p>
              <div className="mt-8 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-extrabold text-white">
                  {testimonial.initials}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-950">{testimonial.name}</h4>
                  <p className="text-sm font-semibold text-slate-500">
                    {testimonial.role}
                  </p>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="bg-white px-5 pb-20 sm:px-6 sm:pb-24 lg:px-8">
      <motion.div
        className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-slate-950 px-6 py-16 text-center text-white shadow-2xl shadow-slate-950/20 sm:px-10 lg:px-16"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <div className="relative mx-auto max-w-3xl">
          <div className="absolute inset-x-0 -top-24 mx-auto h-56 max-w-xl rounded-full bg-gradient-to-r from-blue-500/35 via-violet-500/25 to-cyan-400/30 blur-3xl" />
          <div className="relative">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-cyan-200">
              <Zap size={26} />
            </div>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
              Give your team a smarter way to execute.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              Start with a clean workspace, connect the work that matters, and
              let WorkflowOS turn momentum into a repeatable system.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-4 text-base font-extrabold text-slate-950 shadow-xl shadow-white/10 hover:-translate-y-0.5 hover:bg-blue-50"
              >
                Get Started
                <ArrowRight size={18} />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-7 py-4 text-base font-extrabold text-white hover:-translate-y-0.5 hover:bg-white/15"
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function FooterSection() {
  const footerColumns = [
    {
      title: "Product",
      links: [
        { label: "AI Insights", to: "/signup" },
        { label: "Kanban Workflow", to: "/signup" },
        { label: "Analytics", to: "/signup" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", to: "/about" },
        { label: "Careers", to: "/careers" },
        { label: "Contact", to: "/contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", to: "/privacy" },
        { label: "Terms Of Service", to: "/terms" },
        { label: "Security", to: "/security" },
      ],
    },
  ];

  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_2fr]">
          <div>
            <Link to="/" className="inline-flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                <Layers3 size={20} />
              </span>
              <span className="text-lg font-extrabold tracking-tight text-slate-950">
                WorkflowOS
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-600">
              AI-powered workflow management for teams that want clearer
              priorities, faster execution, and better operating visibility.
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm font-bold text-slate-500">
              <LockKeyhole size={16} />
              Secure workflow foundation for modern teams
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h4 className="text-sm font-extrabold text-slate-950">
                  {column.title}
                </h4>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-sm font-semibold text-slate-500 transition hover:text-blue-600"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-slate-200 pt-7 text-sm font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright 2026 WorkflowOS. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            Built for focused, high-velocity teams
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-slate-950">
      <NavbarSection />
      <main>
        <HeroSection />
        <FeaturesSection />
        <BenefitsSection />
        <TestimonialsSection />
        <CTASection />
      </main>
      <FooterSection />
    </div>
  );
}
