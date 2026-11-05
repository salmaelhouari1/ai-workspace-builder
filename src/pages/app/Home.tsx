import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { marketingPlatformLabel } from "@/lib/marketing";
import {
  DAY_MS,
  localDayStart,
  parseTask,
  relativeDayLabel,
  utcDayStart,
} from "@/lib/nlp";
import { typeDisplay } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  Flag,
  FolderKanban,
  FolderPlus,
  Lightbulb,
  ListChecks,
  Megaphone,
  NotebookPen,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useRef, useState } from "react";
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

const PRIORITY_STYLE: Record<string, string> = {
  high: "text-destructive",
  medium: "text-ai-deep",
  low: "text-muted-foreground/60",
};

function formatPostWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Panel({
  title,
  icon,
  action,
  children,
  className,
  tone = "default",
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "ai";
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        tone === "ai"
          ? "border-ai/30 bg-[color-mix(in_oklab,var(--ai)_5%,var(--card))]"
          : "border-border/70",
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-border/50 px-5 py-3.5">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            tone === "ai"
              ? "bg-ai/20 text-ai-deep"
              : "bg-primary/8 text-foreground/80",
          )}
        >
          {icon}
        </span>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

function DueChip({ due, now }: { due?: number | null; now: number }) {
  if (due === undefined || due === null) {
    return (
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
        No date
      </span>
    );
  }
  const today = utcDayStart(now);
  const diff = Math.round((due - today) / DAY_MS);
  const overdue = diff < 0;
  const soon = diff >= 0 && diff <= 1;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
        overdue
          ? "bg-destructive/10 text-destructive"
          : soon
            ? "bg-ai/20 text-ai-deep"
            : "bg-muted text-muted-foreground",
      )}
    >
      {relativeDayLabel(due, now)}
    </span>
  );
}

const QUICK_ACTIONS = [
  {
    key: "post",
    label: "Create a post",
    hint: "Plan content",
    icon: Megaphone,
  },
  { key: "task", label: "Create a task", hint: "Capture work", icon: ListChecks },
  {
    key: "project",
    label: "Create a project",
    hint: "Group work",
    icon: FolderPlus,
  },
  { key: "note", label: "Add a note", hint: "Save a thought", icon: NotebookPen },
] as const;

type QuickAction = (typeof QUICK_ACTIONS)[number]["key"];

export default function Home() {
  const navigate = useNavigate();
  const data = useQuery(api.home.dashboard);
  const toggleTask = useMutation(api.tasks.toggle);
  const createTask = useMutation(api.tasks.create);
  const createProject = useMutation(api.projects.create);
  const createNote = useMutation(api.documents.create);
  const organize = useMutation(api.projects.claimRelatedTasks);

  const [now] = useState(() => Date.now());
  const [dialog, setDialog] = useState<QuickAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [capture, setCapture] = useState("");

  const [taskDraft, setTaskDraft] = useState({
    title: "",
    due: "",
    priority: "medium" as "low" | "medium" | "high",
  });
  const [projectDraft, setProjectDraft] = useState({
    name: "",
    deadline: "",
  });
  const [noteDraft, setNoteDraft] = useState({ title: "", content: "" });
  const captureRef = useRef<HTMLInputElement>(null);

  if (data === undefined) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="mt-3 h-5 w-80" />
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const firstName = data.userName ?? "there";
  const stats = [
    {
      label: "Open tasks",
      value: data.counts.openTasks,
      icon: ListChecks,
      route: "/app/tasks",
    },
    {
      label: "Posts scheduled",
      value: data.counts.scheduledPosts,
      icon: CalendarDays,
      route: "/app/marketing",
    },
    {
      label: "Active projects",
      value: data.counts.projects,
      icon: FolderKanban,
      route: "/app/projects",
    },
    {
      label: "Pending captures",
      value: data.counts.pendingInbox,
      icon: CircleDot,
      route: "/app/inbox",
    },
  ];

  const handleComplete = async (taskId: string, title: string) => {
    try {
      await toggleTask({ taskId: taskId as Id<"tasks">, done: true });
      toast.success("Done", {
        description: title,
        action: {
          label: "Undo",
          onClick: () =>
            void toggleTask({ taskId: taskId as Id<"tasks">, done: false }),
        },
      });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update the task");
    }
  };

  const quickCapture = async () => {
    const text = capture.trim();
    if (!text) return;
    const parsed = parseTask(text);
    try {
      await createTask({
        title: parsed.title,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        priority: parsed.priority,
        source: "manual",
      });
      setCapture("");
      toast.success("Task added", {
        description: parsed.dueDate
          ? `${parsed.title} · due ${relativeDayLabel(parsed.dueDate).toLowerCase()}`
          : parsed.title,
      });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't add the task");
    }
  };

  const openQuickAction = (key: QuickAction) => {
    if (key === "post") {
      navigate("/app/marketing?new=post");
      return;
    }
    setDialog(key);
  };

  const submitTask = async () => {
    const title = taskDraft.title.trim();
    if (!title) return;
    setSaving(true);
    try {
      await createTask({
        title,
        dueDate: taskDraft.due
          ? localDayStart(new Date(`${taskDraft.due}T00:00:00`))
          : undefined,
        priority: taskDraft.priority,
        source: "manual",
      });
      toast.success("Task created", { description: title });
      setTaskDraft({ title: "", due: "", priority: "medium" });
      setDialog(null);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create the task");
    } finally {
      setSaving(false);
    }
  };

  const submitProject = async () => {
    const name = projectDraft.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      const projectId = await createProject({
        name,
        deadline: projectDraft.deadline
          ? localDayStart(new Date(`${projectDraft.deadline}T00:00:00`))
          : undefined,
      });
      toast.success("Project created", { description: name });
      setProjectDraft({ name: "", deadline: "" });
      setDialog(null);
      navigate(`/app/projects/${projectId}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create the project");
    } finally {
      setSaving(false);
    }
  };

  const submitNote = async () => {
    const title = noteDraft.title.trim();
    if (!title) return;
    setSaving(true);
    try {
      const documentId = await createNote({
        title,
        content: noteDraft.content.trim(),
        category: "Notes",
      });
      toast.success("Note saved", { description: title });
      setNoteDraft({ title: "", content: "" });
      setDialog(null);
      navigate(`/app/documents/${documentId}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save the note");
    } finally {
      setSaving(false);
    }
  };

  const handleOrganize = async (projectId: string, projectName: string) => {
    setOrganizing(true);
    try {
      const result = await organize({ projectId: projectId as Id<"projects"> });
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
    <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-6 md:px-8 md:pt-9">
      {/* ---------------- Header ---------------- */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {typeDisplay(data.businessType)} · {data.workspaceName}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-tight md:text-[2.35rem] md:leading-tight">
              {greetingForHour(new Date().getHours())}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground md:text-[15px]">
              Here's what's moving in your workspace today.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => openQuickAction("post")}>
              <Plus className="size-4" />
              New post
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setDialog(null);
                captureRef.current?.focus();
              }}
            >
              <ListChecks className="size-4" />
              Quick task
            </Button>
          </div>
        </div>
      </motion.header>

      {/* ---------------- Quick actions ---------------- */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              type="button"
              onClick={() => openQuickAction(action.key)}
              className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left transition-colors hover:border-primary/35 hover:bg-card"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-foreground/75 transition-colors group-hover:bg-primary/12">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {action.label}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {action.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ---------------- Summary ---------------- */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => navigate(stat.route)}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3.5 py-2.5 text-left transition-colors hover:border-primary/30"
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-display text-xl leading-none tabular-nums">
                {stat.value}
              </span>
              <span className="truncate text-[11.5px] text-muted-foreground">
                {stat.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---------------- Main grid ---------------- */}
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Upcoming posts */}
          <Panel
            title="Upcoming posts"
            icon={<CalendarDays className="size-4" />}
            action={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => navigate("/app/marketing")}
              >
                Open planner <ChevronRight className="size-3" />
              </Button>
            }
          >
            {data.upcomingPosts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 px-4 py-6 text-center">
                <p className="text-sm font-medium">Nothing scheduled yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Plan your next post and it will appear here.
                </p>
                <Button
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={() => navigate("/app/marketing?new=post")}
                >
                  <Plus className="size-3.5" />
                  Create a post
                </Button>
              </div>
            ) : (
              <ul className="space-y-1">
                {data.upcomingPosts.map((post) => (
                  <li key={post.id}>
                    <button
                      type="button"
                      onClick={() => navigate("/app/marketing")}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/50"
                    >
                      <span className="flex w-[104px] shrink-0 flex-col rounded-lg bg-muted/70 px-2 py-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {post.platform}
                        </span>
                        <span className="text-[11px] font-medium">
                          {formatPostWhen(post.scheduledAt ?? now)}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-medium">
                            {post.title}
                          </span>
                          {post.hasMedia && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-secondary"
                              title="Has media attached"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                          <span>{post.contentType}</span>
                          <span aria-hidden>·</span>
                          <span className="capitalize">
                            {marketingPlatformLabel(post.platform)}
                          </span>
                          {post.campaignName && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate">
                                {post.campaignName}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium capitalize text-primary">
                        {post.status === "readyToPublish"
                          ? "Ready"
                          : post.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Pending tasks */}
          <Panel
            title="Pending tasks"
            icon={<ListChecks className="size-4" />}
            action={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => navigate("/app/tasks")}
              >
                All tasks <ChevronRight className="size-3" />
              </Button>
            }
          >
            <div className="-mx-1 mb-3 flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2 py-1.5">
              <Plus className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={captureRef}
                value={capture}
                onChange={(e) => setCapture(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void quickCapture();
                }}
                placeholder="Capture a task — “email Ana tomorrow at 10”"
                aria-label="Quick capture a task"
                className="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-muted-foreground/60"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2 text-xs"
                disabled={!capture.trim()}
                onClick={() => void quickCapture()}
              >
                Add
              </Button>
            </div>

            {data.openTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 px-4 py-6 text-center">
                <p className="text-sm font-medium">No open tasks 🎉</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Everything on your plate is done.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {data.openTasks.map((task) => (
                  <li
                    key={task.id}
                    className="group flex items-center gap-3 py-2.5"
                  >
                    <button
                      type="button"
                      aria-label={`Mark "${task.title}" done`}
                      onClick={() => handleComplete(task.id, task.title)}
                      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-transparent transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      <Check className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/app/tasks")}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium leading-snug">
                          {task.title}
                        </span>
                        <DueChip due={task.dueDate} now={now} />
                      </span>
                      {(task.projectName || task.dueTime) && (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {task.projectName}
                          {task.projectName && task.dueTime ? " · " : ""}
                          {task.dueTime}
                        </span>
                      )}
                    </button>
                    <Flag
                      className={cn(
                        "size-3.5 shrink-0",
                        PRIORITY_STYLE[task.priority],
                      )}
                      fill={task.priority !== "low" ? "currentColor" : "none"}
                      aria-label={`${task.priority} priority`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Active projects */}
          <Panel
            title="Active projects"
            icon={<FolderKanban className="size-4" />}
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
            {data.activeProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 px-4 py-6 text-center">
                <p className="text-sm font-medium">No active projects</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start one to group related tasks and content.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 gap-1.5"
                  onClick={() => setDialog("project")}
                >
                  <FolderPlus className="size-3.5" />
                  Create a project
                </Button>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.activeProjects.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/app/projects/${project.id}`)}
                      className="w-full rounded-xl border border-border/60 px-3.5 py-3 text-left transition-colors hover:border-primary/35"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">
                          {project.name}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                          {project.progress}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-700"
                          style={{ width: `${Math.max(project.progress, 2)}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
            )}
          </Panel>
        </div>

        {/* ---------------- Right column ---------------- */}
        <div className="space-y-5">
          <Panel
            title="AI recommendations"
            icon={<Sparkles className="size-4" />}
            tone="ai"
            action={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-ai-deep"
                onClick={() => navigate("/app/ai")}
              >
                Ask OCIVO <ArrowUpRight className="size-3" />
              </Button>
            }
          >
            <ul className="space-y-2">
              {data.insights.map((insight) => (
                <li
                  key={insight.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border bg-background/60 px-3 py-2.5",
                    insight.tone === "warn"
                      ? "border-destructive/20"
                      : "border-ai/20",
                  )}
                >
                  <Lightbulb
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0",
                      insight.tone === "warn"
                        ? "text-destructive"
                        : "text-ai-deep",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] leading-relaxed text-foreground/90">
                      {insight.text}
                    </p>
                    {insight.action ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 gap-1 px-2 text-[11px]"
                        disabled={organizing}
                        onClick={() =>
                          handleOrganize(
                            insight.action!.projectId,
                            insight.action!.projectIdName,
                          )
                        }
                      >
                        <Wand2 className="size-3" />
                        Organize
                      </Button>
                    ) : insight.route ? (
                      <button
                        type="button"
                        onClick={() => navigate(insight.route!)}
                        className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-ai-deep hover:underline"
                      >
                        Take a look
                        <ArrowRight className="size-3" />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground/80">
              Based on your tasks, projects and content plan — never invented
              numbers.
            </p>
          </Panel>

          <Panel
            title="Recent activity"
            icon={<CircleDot className="size-4" />}
          >
            {data.recentActivity.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/80 px-3 py-5 text-center text-[12.5px] text-muted-foreground">
                Changes you and OCIVO make will appear here.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.recentActivity.map((event) => (
                  <li key={event.id} className="flex gap-2.5">
                    <span
                      className={cn(
                        "mt-1 flex size-5 shrink-0 items-center justify-center rounded-md",
                        event.actor === "ai"
                          ? "bg-ai/20 text-ai-deep"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {event.actor === "ai" ? (
                        <Sparkles className="size-3" />
                      ) : (
                        <Check className="size-3" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug">
                        {event.detail}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        {event.actor === "ai" ? "OCIVO" : "You"} ·{" "}
                        {timeAgo(event.createdAt)}
                        {event.route && (
                          <button
                            type="button"
                            onClick={() => navigate(event.route!)}
                            className="inline-flex items-center gap-0.5 font-medium text-foreground/70 hover:text-foreground"
                          >
                            Open <ArrowUpRight className="size-2.5" />
                          </button>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* ---------------- Quick action dialogs ---------------- */}
      <Dialog
        open={dialog === "task"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a task</DialogTitle>
            <DialogDescription>
              Add it now — you can assign a project and details later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="quick-task-title">Title</Label>
              <Input
                id="quick-task-title"
                value={taskDraft.title}
                onChange={(e) =>
                  setTaskDraft({ ...taskDraft, title: e.target.value })
                }
                placeholder="Follow up with Ana"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="quick-task-due">Due date</Label>
                <Input
                  id="quick-task-due"
                  type="date"
                  value={taskDraft.due}
                  onChange={(e) =>
                    setTaskDraft({ ...taskDraft, due: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Priority</Label>
                <Select
                  value={taskDraft.priority}
                  onValueChange={(v) =>
                    setTaskDraft({
                      ...taskDraft,
                      priority: v as "low" | "medium" | "high",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitTask()}
              disabled={saving || !taskDraft.title.trim()}
            >
              {saving ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "project"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a project</DialogTitle>
            <DialogDescription>
              Projects group the tasks and content that belong together.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="quick-project-name">Name</Label>
              <Input
                id="quick-project-name"
                value={projectDraft.name}
                onChange={(e) =>
                  setProjectDraft({ ...projectDraft, name: e.target.value })
                }
                placeholder="Website relaunch"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quick-project-deadline">Deadline</Label>
              <Input
                id="quick-project-deadline"
                type="date"
                value={projectDraft.deadline}
                onChange={(e) =>
                  setProjectDraft({ ...projectDraft, deadline: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitProject()}
              disabled={saving || !projectDraft.name.trim()}
            >
              {saving ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "note"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a note</DialogTitle>
            <DialogDescription>
              Notes live in Documents &amp; Notes, ready to build on.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="quick-note-title">Title</Label>
              <Input
                id="quick-note-title"
                value={noteDraft.title}
                onChange={(e) =>
                  setNoteDraft({ ...noteDraft, title: e.target.value })
                }
                placeholder="Positioning thoughts"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quick-note-content">Note</Label>
              <Textarea
                id="quick-note-content"
                rows={5}
                value={noteDraft.content}
                onChange={(e) =>
                  setNoteDraft({ ...noteDraft, content: e.target.value })
                }
                placeholder="Write the thought down before it disappears…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitNote()}
              disabled={saving || !noteDraft.title.trim()}
            >
              {saving ? "Saving…" : "Save note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
