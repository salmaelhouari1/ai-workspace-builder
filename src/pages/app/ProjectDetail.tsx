import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { parseTask, relativeDayLabel, utcDayStart, DAY_MS } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ListChecks,
  Plus,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

type TaskStatus = "todo" | "in_progress" | "done";

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const project = useQuery(api.projects.get, id ? { projectId: id as never } : "skip");
  const createTask = useMutation(api.tasks.create);
  const toggleTask = useMutation(api.tasks.toggle);
  const updateTask = useMutation(api.tasks.update);
  const updateProject = useMutation(api.projects.update);

  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"list" | "board">("list");

  const preview = useMemo(() => (draft.trim() ? parseTask(draft.trim()) : null), [draft]);

  if (project === undefined) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-5 w-96" />
        <Skeleton className="mt-6 h-12 w-full" />
        <Skeleton className="mt-3 h-12 w-full" />
      </div>
    );
  }
  if (project === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16 text-center md:px-8">
        <p className="font-medium">Project not found</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/app/projects")}>
          Back to projects
        </Button>
      </div>
    );
  }

  const now = Date.now();
  const today = utcDayStart(now);

  const addTask = async () => {
    if (!draft.trim()) return;
    const parsed = parseTask(draft.trim());
    try {
      await createTask({
        title: parsed.title,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        priority: parsed.priority,
        projectId: project._id,
        source: "manual",
      });
      setDraft("");
      toast.success("Task added to " + project.name);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't add the task");
    }
  };

  const advance = (taskId: TaskStatus extends never ? never : string, current: TaskStatus) => {
    const next: TaskStatus =
      current === "todo" ? "in_progress" : current === "in_progress" ? "done" : "todo";
    void updateTask({ taskId: taskId as never, status: next });
  };

  const tasksByStatus = (status: TaskStatus) => project.tasks.filter((t) => t.status === status);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 md:px-8">
      <button
        onClick={() => navigate("/app/projects")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Projects
      </button>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-3xl tracking-tight">{project.name}</h1>
            <select
              value={project.status}
              onChange={(e) =>
                void updateProject({
                  projectId: project._id,
                  status: e.target.value as "planned" | "active" | "paused" | "done",
                })
              }
              className="h-7 rounded-full border border-primary/25 bg-primary/10 px-2.5 text-xs font-medium text-primary outline-none"
            >
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="done">Done</option>
            </select>
          </div>
          {project.description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {project.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ListChecks className="size-4" />
              {project.doneTasks}/{project.totalTasks} tasks
            </span>
            {project.deadline !== undefined && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {relativeDayLabel(project.deadline, now)}
              </span>
            )}
            <span className="font-medium text-foreground">{project.progress}%</span>
          </div>
          <div className="mt-3 h-1.5 max-w-sm overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${Math.max(project.progress, 2)}%` }}
            />
          </div>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as "list" | "board")}>
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {/* Quick add */}
      <div className="mt-6 flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 focus-within:border-primary/40">
        <Plus className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void addTask()}
          placeholder={`Add a task to ${project.name} — try "tomorrow at 9"`}
          className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button size="sm" variant="outline" className="h-7" onClick={addTask} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {preview?.dueDate && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Due {relativeDayLabel(preview.dueDate).toLowerCase()}
          {preview.dueTime ? ` at ${preview.dueTime}` : ""}
        </p>
      )}

      {/* Views */}
      {view === "list" ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-card">
          {project.tasks.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-medium">No tasks yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the first one, or ask OCIVO: “Create a launch plan”.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {project.tasks.map((task) => {
                const done = task.status === "done";
                const overdue = !done && task.dueDate !== undefined && task.dueDate < today;
                return (
                  <li key={task._id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                    <button
                      aria-label={done ? "Reopen" : "Complete"}
                      onClick={() => void toggleTask({ taskId: task._id, done: !done })}
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/80 text-transparent hover:border-primary hover:text-primary/40",
                      )}
                    >
                      <Check className="size-3" />
                    </button>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        done ? "text-muted-foreground line-through" : "",
                      )}
                    >
                      {task.title}
                    </span>
                    {task.status === "in_progress" && (
                      <Badge className="border-0 bg-primary/12 text-primary">in progress</Badge>
                    )}
                    {task.dueDate !== undefined && (
                      <span
                        className={cn(
                          "text-xs",
                          overdue ? "font-medium text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {relativeDayLabel(task.dueDate, now)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const items = tasksByStatus(column.key);
            return (
              <div
                key={column.key}
                className="rounded-2xl border border-border/70 bg-muted/40 p-3"
              >
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {column.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((task) => (
                    <div
                      key={task._id}
                      className="group rounded-xl border border-border/70 bg-card p-3 text-sm shadow-sm"
                    >
                      <p className={cn(task.status === "done" && "text-muted-foreground line-through")}>
                        {task.title}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {task.dueDate !== undefined ? relativeDayLabel(task.dueDate, now) : "No date"}
                        </span>
                        <button
                          onClick={() => advance(task._id, task.status)}
                          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                          aria-label="Move forward"
                        >
                          <ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!items.length && (
                    <p className="px-1 py-3 text-xs text-muted-foreground">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex items-center gap-2 rounded-xl border border-dashed border-ai/40 bg-ai/5 px-4 py-3 text-sm text-muted-foreground">
        <Sparkles className="size-4 shrink-0 text-ai-deep" />
        <span>
          Ask OCIVO to plan this project: “Create a launch plan for {project.name}”.
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 shrink-0"
          onClick={() => navigate(`/app/ai`)}
        >
          Open
        </Button>
      </div>
    </div>
  );
}
