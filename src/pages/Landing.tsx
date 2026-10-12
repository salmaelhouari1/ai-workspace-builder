import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ClipboardList,
  Command,
  FileText,
  FolderKanban,
  Inbox,
  Layers,
  MessageSquare,
  MousePointerClick,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useNavigate } from "react-router";

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease },
};

const NEXT_ACTIONS = [
  { title: "Follow up with 3 leads", reason: "Your last follow-up was 4 days ago." },
  { title: "Finish the landing page", reason: "Due tomorrow." },
  { title: "Prepare tomorrow's content", reason: "You have nothing scheduled yet." },
];

const OLD_WAY = [
  "Create pages by hand",
  "Design databases & properties",
  "Wire up relations and templates",
  "Maintain the system forever",
];

const NEW_WAY = [
  "Describe what you're building",
  "OCIVO designs the workspace",
  "Review & confirm what it creates",
  "AI keeps organising as you work",
];

const STEPS = [
  {
    n: "01",
    title: "Tell it what you're building",
    body: "“I'm starting a small online clothing business.” That's the whole setup — plain language, no configuration.",
    icon: MessageSquare,
  },
  {
    n: "02",
    title: "Your workspace builds itself",
    body: "Projects, tasks, goals, documents and a dashboard appear already structured around your business — in seconds.",
    icon: Wand2,
  },
  {
    n: "03",
    title: "Work — and let AI maintain it",
    body: "Ask questions, dump notes, request changes. OCIVO answers from your data and prepares every change for your confirmation.",
    icon: Sparkles,
  },
];

const FEATURES = [
  {
    icon: Wand2,
    title: "AI onboarding",
    body: "One sentence in, a complete workspace out — no empty pages, no blank databases.",
  },
  {
    icon: Inbox,
    title: "Smart inbox",
    body: "Paste meeting notes or a brain dump. OCIVO splits it into tasks, notes and links for review.",
  },
  {
    icon: MessageSquare,
    title: "Assistant with context",
    body: "“What should I work on today?” — answered from your real tasks, projects and goals, with sources.",
  },
  {
    icon: ShieldCheck,
    title: "Preview → Confirm",
    body: "The AI never silently changes anything. You see exactly what will be created, then confirm.",
  },
  {
    icon: Command,
    title: "⌘K everything",
    body: "Create tasks in natural language, jump anywhere, search the whole workspace from one bar.",
  },
  {
    icon: Layers,
    title: "Adapts to your business",
    body: "A freelancer, a store and a creator each get a workspace that speaks their language.",
  },
];

const EXAMPLE_PROJECTS = [
  { name: "Client A Website", progress: 75 },
  { name: "Portfolio Redesign", progress: 40 },
  { name: "Get more clients", progress: 20 },
];

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  const startHref = isAuthenticated && !isLoading ? "/app" : "/auth?returnTo=/app";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-background text-foreground"
    >
      {/* ================= NAV ================= */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark className="size-8" />
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#example" className="transition-colors hover:text-foreground">Example</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => navigate(isAuthenticated ? "/app" : "/auth?returnTo=/app")}>
              {isAuthenticated ? "Open workspace" : "Sign in"}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => navigate(startHref)}>
              <span className="hidden sm:inline">Build my workspace</span>
              <span className="sm:hidden">Get started</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_520px_at_50%_-8%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_420px_at_88%_28%,color-mix(in_oklab,var(--ai)_14%,transparent),transparent)]"
        />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10">
          {/* Copy */}
          <div>
            <motion.span
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
              className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm"
            >
              <Sparkles className="size-3.5 text-ai-deep" />
              The AI-native workspace for small business
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.06, ease }}
              className="mt-6 font-display text-[2.75rem] leading-[1.04] tracking-tight sm:text-6xl md:text-[4.25rem]"
            >
              Your workspace
              <br />
              <span className="italic text-primary">builds itself.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14, ease }}
              className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg"
            >
              Tell OCIVO what you're building. It creates your projects, tasks,
              goals and docs — already organised around your business — then
              keeps them tidy while you work.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22, ease }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button size="lg" className="gap-2 px-6" onClick={() => navigate(startHref)}>
                Build my workspace
                <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" className="px-6" onClick={() => navigate(startHref)}>
                See it in action
              </Button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.34 }}
              className="mt-6 text-sm text-muted-foreground"
            >
              Built for freelancers, creators, e-commerce and small teams — not
              enterprises.
            </motion.p>
          </div>

          {/* Product mock */}
          <motion.div
            initial={{ opacity: 0, y: 30, rotate: -0.6 }}
            animate={{ opacity: 1, y: 0, rotate: -0.6 }}
            transition={{ duration: 0.7, delay: 0.25, ease }}
            className="relative"
          >
            {/* floating chips */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-3 -top-5 z-10 hidden rounded-xl border border-border/80 bg-card px-3 py-2 text-xs font-medium shadow-lg sm:block"
            >
              <span className="text-primary">✓</span> 12 tasks created
            </motion.div>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
              className="absolute -right-2 -bottom-6 z-10 hidden rounded-xl border border-ai/30 bg-[color-mix(in_oklab,var(--ai)_10%,var(--card))] px-3 py-2 text-xs font-medium shadow-lg sm:block"
            >
              <Sparkles className="mr-1 inline size-3 text-ai-deep" />
              Dashboard ready
            </motion.div>

            <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.18)]">
              {/* window bar */}
              <div className="mb-3 flex items-center gap-1.5 px-1">
                <span className="size-2.5 rounded-full bg-destructive/40" />
                <span className="size-2.5 rounded-full bg-ai/50" />
                <span className="size-2.5 rounded-full bg-primary/40" />
                <span className="ml-3 truncate text-[11px] text-muted-foreground">
                  OCIVO · Home
                </span>
              </div>

              <p className="px-1 font-display text-xl leading-tight tracking-tight md:text-2xl">
                Good morning, Salma 👋
              </p>
              <p className="mb-3 mt-1 px-1 text-xs text-muted-foreground md:text-sm">
                Here's what needs your attention today.
              </p>

              {/* main card */}
              <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
                <div className="mb-1 flex items-center gap-2 px-1 pb-1">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="size-3" />
                  </span>
                  <span className="text-sm font-semibold">What should I do next?</span>
                </div>
                <ul>
                  {NEXT_ACTIONS.map((item, i) => (
                    <motion.li
                      key={item.title}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.5 + i * 0.18, ease }}
                      className="flex items-start gap-3 border-t border-border/50 px-1 py-2.5"
                    >
                      <span
                        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          i === 0
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">{item.reason}</span>
                      </span>
                      <span className="ml-auto mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-transparent">
                        <Check className="size-3" />
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </div>

              {/* mini sections */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="text-[11px] font-semibold">
                    <span className="mr-1">📌</span> Active projects
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">Product Launch</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-[80%] rounded-full bg-primary" />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">80%</p>
                </div>
                <div className="rounded-xl border border-ai/25 bg-[color-mix(in_oklab,var(--ai)_6%,var(--card))] p-3">
                  <p className="text-[11px] font-semibold">
                    <span className="mr-1">💡</span> AI insights
                  </p>
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    You have 3 overdue tasks related to your product launch.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================= COMPARISON ================= */}
      <section className="border-y border-border/60 bg-card/50">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-16 md:grid-cols-2 md:py-20">
          <motion.div {...fadeUp} className="rounded-3xl border border-border/70 p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Traditional workspaces
            </p>
            <p className="mt-3 font-display text-2xl tracking-tight text-muted-foreground">
              You build the system.
            </p>
            <ul className="mt-5 space-y-2.5">
              {OLD_WAY.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span className="flex size-4 items-center justify-center rounded-full border border-border text-[10px]">
                    ×
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.12, ease }}
            className="relative rounded-3xl border border-primary/30 bg-primary/5 p-7 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.25)]"
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <Sparkles className="size-3.5" />
              OCIVO
            </p>
            <p className="mt-3 font-display text-2xl tracking-tight">
              The system builds itself.
            </p>
            <ul className="mt-5 space-y-2.5">
              {NEW_WAY.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm">
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how" className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <motion.div {...fadeUp} className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            How it works
          </p>
          <h2 className="mt-3 font-display text-3xl tracking-tight md:text-5xl">
            From one sentence to a working business OS.
          </h2>
        </motion.div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.n}
                {...fadeUp}
                transition={{ duration: 0.5, delay: 0.08 * i, ease }}
                className="relative rounded-3xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-display text-3xl text-border">{step.n}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="border-y border-border/60 bg-card/50">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
          <motion.div {...fadeUp} className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Built in
            </p>
            <h2 className="mt-3 font-display text-3xl tracking-tight md:text-5xl">
              Everything you'd have built yourself.
            </h2>
          </motion.div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  {...fadeUp}
                  transition={{ duration: 0.45, delay: 0.05 * i, ease }}
                  className="rounded-2xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_10px_30px_-16px_rgba(0,0,0,0.2)]"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-3.5 text-sm font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= EXAMPLE ================= */}
      <section id="example" className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <motion.div {...fadeUp}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              A real first minute
            </p>
            <h2 className="mt-3 font-display text-3xl tracking-tight md:text-5xl">
              “I'm a freelance web designer.
              <br />
              I have 5 clients and I want more.”
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
              That's the entire setup. OCIVO creates the goals, the client
              projects, the lead pipeline, the marketing tasks and the
              dashboard — then answers questions from that data.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Goals", "Projects", "Clients", "Lead pipeline", "Tasks", "Marketing"].map(
                (chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {chip}
                  </span>
                ),
              )}
            </div>
            <Button className="mt-7 gap-2" onClick={() => navigate(startHref)}>
              Try it with your business
              <ArrowRight className="size-4" />
            </Button>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.12, ease }}
            className="relative space-y-4"
          >
            <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.3)]">
              <p className="text-xs font-semibold text-muted-foreground">Generated projects</p>
              <ul className="mt-3 space-y-3">
                {EXAMPLE_PROJECTS.map((p) => (
                  <li key={p.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <FolderKanban className="size-3.5 text-primary" />
                        {p.name}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {p.progress}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
                {[
                  { icon: Target, label: "2 goals" },
                  { icon: ClipboardList, label: "14 tasks" },
                  { icon: FileText, label: "5 docs" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-muted/60 py-2">
                    <stat.icon className="mx-auto size-3.5 text-muted-foreground" />
                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-ai/30 bg-[color-mix(in_oklab,var(--ai)_7%,var(--card))] p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ai-deep">
                <Sparkles className="size-3.5" />
                You asked
              </p>
              <p className="mt-2 text-sm font-medium">“What should I do today?”</p>
              <div className="mt-3 rounded-2xl bg-card p-3.5 text-sm leading-relaxed shadow-sm">
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>
                    <b>Send proposal to Client A</b>{" "}
                    <span className="text-muted-foreground">— due today.</span>
                  </li>
                  <li>
                    <b>Finish homepage</b>{" "}
                    <span className="text-muted-foreground">— due tomorrow.</span>
                  </li>
                  <li>
                    <b>Follow up with 3 leads</b>{" "}
                    <span className="text-muted-foreground">— no reply in 4 days.</span>
                  </li>
                </ol>
                <div className="mt-2.5 flex gap-1.5">
                  <span className="rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Client work
                  </span>
                  <span className="rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Portfolio refresh
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================= PRINCIPLES ================= */}
      <section className="border-y border-border/60 bg-card/50">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-16 md:grid-cols-3 md:py-20">
          {[
            {
              icon: MousePointerClick,
              title: "Less setup",
              body: "Spend your time working, not building your productivity system.",
            },
            {
              icon: Search,
              title: "AI organises, not just chats",
              body: "The assistant is wired into your workspace — it acts, with your confirmation.",
            },
            {
              icon: Layers,
              title: "It adapts to you",
              body: "No two businesses get the same structure. The workspace follows your work.",
            },
          ].map((principle, i) => (
            <motion.div key={principle.title} {...fadeUp} transition={{ duration: 0.5, delay: i * 0.08, ease }}>
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <principle.icon className="size-5" />
              </span>
              <h3 className="mt-3.5 font-display text-xl tracking-tight">{principle.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {principle.body}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_340px_at_50%_120%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]"
        />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-20 text-center md:py-28">
          <motion.h2
            {...fadeUp}
            className="font-display text-4xl leading-tight tracking-tight md:text-6xl"
          >
            Tell it what you're building.
            <br />
            <span className="italic text-primary">Watch it organize.</span>
          </motion.h2>
          <motion.p
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.1, ease }}
            className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base"
          >
            From sign-up to a working dashboard in under five minutes. No credit
            card, no setup wizard.
          </motion.p>
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.18, ease }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <Button size="lg" className="gap-2 px-7" onClick={() => navigate(startHref)}>
              Build my workspace
              <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth?returnTo=/app")}>
              Sign in
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark className="size-7" />
            <Wordmark />
          </Link>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} OCIVO — a workspace that understands
            what you're doing.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <button onClick={() => navigate(startHref)} className="hover:text-foreground">
              Get started
            </button>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
