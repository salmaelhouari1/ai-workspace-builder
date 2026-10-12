import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { parseTask, relativeDayLabel, utcDayStart, DAY_MS } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import {
  Check,
  CircleDashed,
  Flag,
  ListChecks,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type StatusFilter = "all" | "todo" | "in_progress" | "done";
type Priority = "low" | "medium" | "high";

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "text-destructive",
  medium: "text-ai-deep",
  low: "text-muted-foreground/70",
};

export default function Tasks() {
  const navigate = useNavigate();
  const tasks = useQuery(api.tasks.list);
  const projects = useQuery(api.projects.list);
  const createTask = useMutation(api.tasks.create);
  const toggleTask = useMutation(api.tasks.toggle);
  const updateTask = useMutation(api.tasks.update);
  const deleteTask = useMutation(api.tasks.remove);

  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const preview = useMemo(() => (draft.trim() ? parseTask(draft.trim()) : null), [draft]);

  const submit = async () => {
    if (!draft.trim()) return;
    const parsed = parseTask(draft.trim());
    try {
      await createTask({
        title: parsed.title,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        priority: parsed.priority,
        source: "manual",
      });
      setDraft("");
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

  const filtered = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (projectFilter !== "all" && t.projectId !== projectFilter) return false;
      return true;
    });
  }, [tasks, status, projectFilter]);

  const now = Date.now();
  const today = utcDayStart(now);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-12 pt-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">My Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasks
              ? `${tasks.filter((t) => t.status !== "done").length} open · ${tasks.filter((t) => t.status === "done").length} done`
              : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-ai-deep" />
          Type naturally — we parse the dates
        </div>
      </header>

      {/* Quick add */}
      <div className="mt-6 rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm focus-within:border-primary/40">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Plus className="size-4" />
          </span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder='Remind me to send the proposal next Tuesday at 10'
            className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button size="sm" onClick={submit} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
        {preview && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-11 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">“{preview.title}”</span>
            {preview.dueDate && (
              <Badge variant="outline" className="text-[11px]">
                {relativeDayLabel(preview.dueDate)}
                {preview.dueTime ? `, ${preview.dueTime}` : ""}
              </Badge>
            )}
            {preview.priority === "high" && (
              <Badge variant="outline" className="border-destructive/40 text-[11px] text-destructive">
                high priority
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto pb-0.5">
          <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="todo">To do</TabsTrigger>
              <TabsTrigger value="in_progress">In progress</TabsTrigger>
              <TabsTrigger value="done">Done</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-muted-foreground outline-none focus:border-ring"
        >
          <option value="all">All projects</option>
          {projects?.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card">
        {tasks === undefined ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ListChecks className="size-5" />
            </span>
            <p className="font-medium">Nothing here</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add a task above, or ask OCIVO in the command bar (⌘K): “Create a
              task to call John tomorrow at 10”.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {filtered.map((task) => {
              const done = task.status === "done";
              const overdue =
                !done && task.dueDate !== undefined && task.dueDate < today;
              return (
                <li key={task._id} className="group flex items-center gap-3 px-4 py-3 md:px-5">
                  <button
                    aria-label={done ? "Reopen task" : "Complete task"}
                    onClick={() =>
                      void toggleTask({ taskId: task._id, done: !done }).catch(() =>
                        toast.error("Couldn't update the task"),
                      )
                    }
                    className={cn(
                      "relative flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors before:absolute before:-inset-2.5 before:rounded-full before:content-['']",
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/80 text-transparent hover:border-primary hover:text-primary/40",
                    )}
                  >
                    <Check className="size-3" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm",
                        done ? "text-muted-foreground line-through" : "text-foreground",
                      )}
                    >
                      {task.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {task.projectName && (
                        <button
                          className="hover:text-primary"
                          onClick={() => task.projectId && navigate(`/app/projects/${task.projectId}`)}
                        >
                          {task.projectName}
                        </button>
                      )}
                      {task.status === "in_progress" && (
                        <span className="text-primary">· in progress</span>
                      )}
                      {task.dueDate !== undefined && (
                        <span className={overdue ? "font-medium text-destructive" : undefined}>
                          · {relativeDayLabel(task.dueDate, now)}
                          {task.dueTime ? ` ${task.dueTime}` : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  <Flag
                    className={cn(
                      "size-3.5 shrink-0",
                      task.priority === "high" ? PRIORITY_STYLE.high : "opacity-0 group-hover:opacity-100 max-md:opacity-100",
                      task.priority === "medium" && PRIORITY_STYLE.medium,
                      task.priority === "low" && PRIORITY_STYLE.low,
                    )}
                    fill={task.priority !== "low" ? "currentColor" : "none"}
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel>Move to</DropdownMenuLabel>
                      <DropdownMenuItem
                        disabled={task.status === "todo"}
                        onClick={() => void updateTask({ taskId: task._id, status: "todo" })}
                      >
                        <CircleDashed className="mr-2 size-4" /> To do
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={task.status === "in_progress"}
                        onClick={() => void updateTask({ taskId: task._id, status: "in_progress" })}
                      >
                        <ListChecks className="mr-2 size-4" /> In progress
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={done}
                        onClick={() => void updateTask({ taskId: task._id, status: "done" })}
                      >
                        <Check className="mr-2 size-4" /> Done
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() =>
                          void deleteTask({ taskId: task._id }).then(
                            () => toast.success("Task deleted"),
                            () => toast.error("Couldn't delete the task"),
                          )
                        }
                      >
                        <Trash2 className="mr-2 size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
