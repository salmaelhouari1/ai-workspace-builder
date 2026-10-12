import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { relativeDayLabel, utcDayStart, DAY_MS } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FolderKanban,
  Lightbulb,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const ease = [0.22, 1, 0.36, 1] as const;

function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function SectionCard({
  emoji,
  title,
  action,
  children,
  tone = "default",
  className,
}: {
  emoji: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "ai";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",          tone === "ai"
            ? "border-ai/25 bg-[color-mix(in_oklab,var(--ai)_4%,var(--card))]"
            : "border-border/70",
        className,
      )}
    >
      <header className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          <span className="mr-1.5">{emoji}</span>
          {title}
        </h2>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function DueChip({ due, now }: { due?: number; now: number }) {
  if (due === undefined) return null;
  const today = utcDayStart(now);
  const diff = Math.round((due - today) / DAY_MS);
  const overdue = diff < 0;
  const soon = diff >= 0 && diff <= 1;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        overdue
          ? "bg-destructive/10 text-destructive"
          : soon
            ? "bg-ai/15 text-ai-deep"
            : "bg-muted text-muted-foreground",
      )}
    >
      {relativeDayLabel(due, now)}
    </span>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const data = useQuery(api.home.dashboard);
  const toggleTask = useMutation(api.tasks.toggle);
  const organize = useMutation(api.projects.claimRelatedTasks);
  const [organizing, setOrganizing] = useState(false);

  if (data === undefined) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-3 h-5 w-80" />
        <Skeleton className="mt-8 h-56 w-full rounded-2xl" />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  const now = Date.now();
  const firstName = data.userName;
  const hasActions = data.nextActions.length > 0;

  const handleComplete = async (taskId: string, title: string) => {
    try {
      await toggleTask({ taskId: taskId as never, done: true });
      toast.success("Done", {
        description: title,
        action: {
          label: "Undo",
          onClick: () => void toggleTask({ taskId: taskId as never, done: false }),
        },
      });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update the task");
    }
  };

  const handleOrganize = async (projectId: string, projectName: string) => {
    setOrganizing(true);
    try {
      const result = await organize({ projectId: projectId as never });
      toast.success(
        result.claimed
          ? `Organized ${result.claimed} task${result.claimed === 1 ? "" : "s"} into ${projectName}`
          : "Nothing matched — tasks left untouched",
      );
    } catch (err) {
      console.error(err);
      toast.error("Couldn't organize the tasks");
    } finally {
      setOrganizing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8 md:pt-10">
      {/* ---------------- Greeting ---------------- */}
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
      >
        <h1 className="font-display text-3xl tracking-tight md:text-[2.6rem] md:leading-tight">
          {greetingForHour(new Date().getHours())}, {firstName ?? "there"} 👋
        </h1>
        <p className="mt-1.5 text-muted-foreground md:text-lg">
          Here's what needs your attention today.
        </p>
      </motion.header>

      {/* ---------------- Main card ---------------- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease }}
        className="mt-7 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_2px_14px_rgba(0,0,0,0.04)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4 md:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <h2 className="text-base font-semibold tracking-tight md:text-lg">
              What should I do next?
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => navigate("/app/ai")}
          >
            <Sparkles className="size-3.5 text-ai-deep" />
            Ask OCIVO
          </Button>
        </header>

        <div className="divide-y divide-border/50 px-5 md:px-6">
          {hasActions ? (
            data.nextActions.map((item, index) => (
              <div
                key={item.taskId}
                className="group flex items-start gap-4 py-4 transition-colors hover:bg-accent/40 -mx-2 rounded-lg px-2"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    index === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>

                <button
                  type="button"
                  onClick={() => navigate(item.projectId ? `/app/projects/${item.projectId}` : "/app/tasks")}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium leading-snug text-foreground">
                      {item.title}
                    </span>
                    <DueChip due={item.dueDate} now={now} />
                    {item.projectName && (
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        · {item.projectName}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.reason}</p>
                </button>

                <button
                  type="button"
                  aria-label={`Mark "${item.title}" done`}
                  onClick={() => handleComplete(item.taskId, item.title)}
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border/80 text-transparent transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:text-muted-foreground/60"
                >
                  <Check className="size-4" />
                </button>
              </div>
            ))
          ) : (
            <div className="py-8 text-center">
              <p className="font-medium">You're all caught up 🎉</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing needs your attention right now.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => navigate("/app/ai")}
              >
                <Sparkles className="size-3.5" />
                Ask OCIVO for next steps
              </Button>
            </div>
          )}
        </div>
      </motion.section>

      {/* ---------------- Four smaller sections ---------------- */}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {/* 📌 Active projects */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16, ease }}
        >
          <SectionCard
            emoji="📌"
            title="Active projects"
            action={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => navigate("/app/projects")}
              >
                All projects <ChevronRight className="size-3" />
              </Button>
            }
          >
            {data.activeProjects.length ? (
              <ul className="space-y-4">
                {data.activeProjects.map((project) => (
                  <li key={project.id}>
                    <button
                      className="w-full text-left"
                      onClick={() => navigate(`/app/projects/${project.id}`)}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium hover:text-primary">
                          {project.name}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                          {project.progress}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-700"
                          style={{ width: `${Math.max(project.progress, 2)}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {project.doneTasks}/{project.totalTasks} tasks
                        </span>
                        {project.deadline !== undefined && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{relativeDayLabel(project.deadline, now)}</span>
                          </>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<FolderKanban className="size-4" />}
                text="No active projects yet."
                actionLabel="Create with AI"
                onAction={() => navigate("/app/ai")}
              />
            )}
          </SectionCard>
        </motion.div>

        {/* 🎯 Goals */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.22, ease }}
        >
          <SectionCard
            emoji="🎯"
            title="Goals"
            action={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => navigate("/app/goals")}
              >
                All goals <ChevronRight className="size-3" />
              </Button>
            }
          >
            {data.goals.length ? (
              <ul className="space-y-4">
                {data.goals.map((goal) => (
                  <li key={goal.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">{goal.title}</span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {goal.progress !== null ? `${goal.progress}%` : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[color-mix(in_oklab,var(--ai)_75%,var(--primary))] transition-all duration-700"
                        style={{ width: `${Math.max(goal.progress ?? 0, 2)}%` }}
                      />
                    </div>
                    {goal.note && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {goal.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Check className="size-4" />}
                text="No goals set yet."
                actionLabel="Set a goal"
                onAction={() => navigate("/app/goals")}
              />
            )}
          </SectionCard>
        </motion.div>

        {/* 📅 Upcoming */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.28, ease }}
        >
          <SectionCard emoji="📅" title="Upcoming">
            {data.upcoming.length ? (
              <ul className="space-y-1">
                {data.upcoming.map((item) => (
                  <li key={item.key}>
                    <button
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60"
                      onClick={() => navigate(item.route)}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          item.kind === "task"
                            ? "bg-primary"
                            : item.kind === "project"
                              ? "bg-ai"
                              : "bg-muted-foreground/50",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {item.whenLabel}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Plus className="size-4" />}
                text="Nothing scheduled — your week is open."
                actionLabel="Plan it with AI"
                onAction={() => navigate("/app/ai")}
              />
            )}
          </SectionCard>
        </motion.div>

        {/* 💡 AI insights */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.34, ease }}
        >
          <SectionCard emoji="💡" title="AI insights" tone="ai">
            <ul className="space-y-3">
              {data.insights.map((insight) => (
                <li
                  key={insight.id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border bg-background/60 px-3.5 py-3",
                    insight.tone === "warn" ? "border-destructive/20" : "border-ai/20",
                  )}
                >
                  <Lightbulb
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      insight.tone === "warn" ? "text-destructive" : "text-ai-deep",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {insight.text}
                    </p>
                    {insight.action && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 gap-1 px-2.5 text-xs"
                        disabled={organizing}
                        onClick={() =>
                          handleOrganize(
                            insight.action!.projectId,
                            insight.action!.projectIdName,
                          )
                        }
                      >
                        <Wand2 className="size-3.5" />
                        Organize
                      </Button>
                    )}
                  </div>
                  {insight.route && !insight.action && (
                    <button
                      onClick={() => navigate(insight.route!)}
                      className="mt-0.5 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Open"
                    >
                      <ArrowUpRight className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate("/app/ai")}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-ai/40 py-2 text-xs font-medium text-ai-deep transition-colors hover:bg-ai/10"
            >
              <Sparkles className="size-3.5" />
              Ask OCIVO anything about your workspace
            </button>
          </SectionCard>
        </motion.div>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  text,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border/80 px-4 py-5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onAction}>
        <Sparkles className="size-3.5" />
        {actionLabel}
      </Button>
    </div>
  );
}
