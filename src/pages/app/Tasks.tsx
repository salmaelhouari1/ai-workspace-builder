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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { parseTask, relativeDayLabel, utcDayStart, DAY_MS } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  Check,
  CircleDashed,
  Flag,
  ListChecks,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
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

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface DueOption {
  label: string;
  value: number;
  hint?: string;
}

/** Quick due-date choices: Today, Tomorrow, then each weekday by date. */
function dueDateOptions(now: number): DueOption[] {
  const today = utcDayStart(now);
  const options: DueOption[] = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: today + DAY_MS },
  ];
  for (let i = 2; i < 9; i++) {
    const value = today + i * DAY_MS;
    const d = new Date(value);
    options.push({
      label: WEEKDAY_NAMES[d.getUTCDay()],
      value,
      hint: d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    });
  }
  return options;
}

export default function Tasks() {
  const navigate = useNavigate();
  const tasks = useQuery(api.tasks.list);
  const projects = useQuery(api.projects.list);
  const team = useQuery(api.team.list);
  const createTask = useMutation(api.tasks.create);
  const toggleTask = useMutation(api.tasks.toggle);
  const updateTask = useMutation(api.tasks.update);
  const deleteTask = useMutation(api.tasks.remove);
  const addComment = useMutation(api.tasks.addComment);
  const removeComment = useMutation(api.tasks.removeComment);

  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [subtaskDraft, setSubtaskDraft] = useState("");

  const preview = useMemo(
    () => (draft.trim() ? parseTask(draft.trim()) : null),
    [draft],
  );

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
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (projectFilter !== "all" && t.projectId !== projectFilter)
        return false;
      if (
        q &&
        !t.title.toLowerCase().includes(q) &&
        !(t.description ?? "").toLowerCase().includes(q) &&
        !(t.projectName ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [tasks, status, projectFilter, search]);

  // Top-level tasks only in the flat list; subtasks render under their parent.
  const subtasksOf = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const t of filtered) {
      if (!t.parentId) continue;
      const list = map.get(t.parentId) ?? [];
      list.push(t);
      map.set(t.parentId, list);
    }
    return map;
  }, [filtered]);
  const roots = filtered.filter((t) => !t.parentId);

  const [now] = useState(() => Date.now());
  const today = utcDayStart(now);
  const dateOptions = dueDateOptions(now);

  const setDueDate = async (taskId: Id<"tasks">, value: number | undefined) => {
    try {
      await updateTask(
        value === undefined
          ? { taskId, clearDueDate: true }
          : { taskId, dueDate: value },
      );
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update the date");
    }
  };

  const setAssignee = async (
    task: Doc<"tasks">,
    person: { email: string; name?: string },
    active: boolean,
  ) => {
    try {
      await updateTask(
        active
          ? { taskId: task._id, clearAssignee: true }
          : {
              taskId: task._id,
              assigneeEmail: person.email,
              assigneeName: person.name,
            },
      );
      toast.success(
        active
          ? "Task unassigned"
          : `Assigned to ${person.name ?? person.email}`,
      );
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update the assignee");
    }
  };

  const submitNote = async (taskId: Id<"tasks">) => {
    const text = noteDraft.trim();
    if (!text) return;
    try {
      await addComment({ taskId, text });
      setNoteDraft("");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save the note");
    }
  };

  const submitTitle = async (taskId: Id<"tasks">) => {
    const title = titleDraft.trim();
    if (!title) return;
    try {
      await updateTask({ taskId, title });
      toast.success("Task updated");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update the task");
    }
  };

  const addSubtask = async (parent: Id<"tasks">) => {
    const text = subtaskDraft.trim();
    if (!text) return;
    const parsed = parseTask(text);
    try {
      await createTask({
        title: parsed.title,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        priority: parsed.priority,
        parentId: parent,
        source: "manual",
      });
      setSubtaskDraft("");
      toast.success("Subtask added");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't add the subtask");
    }
  };

  const togglePanel = (task: Doc<"tasks">) => {
    setNoteDraft("");
    setSubtaskDraft("");
    setTitleDraft(task.title);
    setOpenId(openId === task._id ? null : task._id);
  };

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
            placeholder="Remind me to send the proposal next Tuesday at 10"
            className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button size="sm" onClick={submit} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
        {preview && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-11 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              “{preview.title}”
            </span>
            {preview.dueDate && (
              <Badge variant="outline" className="text-[11px]">
                {relativeDayLabel(preview.dueDate)}
                {preview.dueTime ? `, ${preview.dueTime}` : ""}
              </Badge>
            )}
            {preview.priority === "high" && (
              <Badge
                variant="outline"
                className="border-destructive/40 text-[11px] text-destructive"
              >
                high priority
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex h-9 min-w-52 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-2.5 focus-within:border-ring">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {search && (
            <button
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="max-w-full overflow-x-auto pb-0.5">
          <Tabs
            value={status}
            onValueChange={(v) => setStatus(v as StatusFilter)}
          >
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
        ) : roots.length === 0 ? (
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
            {roots.map((task) => {
              const done = task.status === "done";
              const overdue =
                !done && task.dueDate !== undefined && task.dueDate < today;
              const subs = subtasksOf.get(task._id) ?? [];
              return (
                <li key={task._id} className="group">
                  <div className="flex items-center gap-3 px-4 py-3 md:px-5">
                    <button
                      aria-label={done ? "Reopen task" : "Complete task"}
                      onClick={() =>
                        void toggleTask({
                          taskId: task._id,
                          done: !done,
                        }).catch(() => toast.error("Couldn't update the task"))
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
                          done
                            ? "text-muted-foreground line-through"
                            : "text-foreground",
                        )}
                      >
                        {task.title}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {task.projectName && (
                          <button
                            className="hover:text-primary"
                            onClick={() =>
                              task.projectId &&
                              navigate(`/app/projects/${task.projectId}`)
                            }
                          >
                            {task.projectName}
                          </button>
                        )}
                        {task.status === "in_progress" && (
                          <span className="text-primary">· in progress</span>
                        )}
                        {task.dueDate !== undefined && (
                          <span
                            className={
                              overdue
                                ? "font-medium text-destructive"
                                : undefined
                            }
                          >
                            · {relativeDayLabel(task.dueDate, now)}
                            {task.dueTime ? ` ${task.dueTime}` : ""}
                          </span>
                        )}
                        {task.assigneeEmail && (
                          <span
                            className="flex items-center gap-1"
                            title={`Assigned to ${task.assigneeEmail}`}
                          >
                            ·
                            <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[8px] font-bold text-primary">
                              {(
                                task.assigneeName ??
                                task.assigneeEmail.split("@")[0]
                              )
                                .trim()
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                            <span className="max-w-[16ch] truncate">
                              {task.assigneeName ??
                                task.assigneeEmail.split("@")[0]}
                            </span>
                          </span>
                        )}
                        {(task.comments?.length ?? 0) > 0 && (
                          <button
                            className="hover:text-primary"
                            onClick={() => togglePanel(task)}
                          >
                            · {task.comments!.length} note
                            {task.comments!.length === 1 ? "" : "s"}
                          </button>
                        )}
                        {subs.length > 0 && (
                          <span>
                            · {subs.filter((s) => s.status === "done").length}/
                            {subs.length} subtasks
                          </span>
                        )}
                      </div>
                    </div>

                    <Flag
                      className={cn(
                        "size-3.5 shrink-0",
                        task.priority === "high"
                          ? PRIORITY_STYLE.high
                          : "opacity-0 group-hover:opacity-100 max-md:opacity-100",
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
                          onClick={() =>
                            void updateTask({
                              taskId: task._id,
                              status: "todo",
                            })
                          }
                        >
                          <CircleDashed className="mr-2 size-4" /> To do
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={task.status === "in_progress"}
                          onClick={() =>
                            void updateTask({
                              taskId: task._id,
                              status: "in_progress",
                            })
                          }
                        >
                          <ListChecks className="mr-2 size-4" /> In progress
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={done}
                          onClick={() =>
                            void updateTask({
                              taskId: task._id,
                              status: "done",
                            })
                          }
                        >
                          <Check className="mr-2 size-4" /> Done
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => togglePanel(task)}>
                          <CalendarClock className="mr-2 size-4" /> Edit task
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
                  </div>

                  {/* Subtasks render indented under their parent */}
                  {subs.length > 0 && (
                    <ul className="border-t border-border/40 bg-muted/15">
                      {subs.map((sub) => {
                        const subDone = sub.status === "done";
                        return (
                          <li
                            key={sub._id}
                            className="flex items-center gap-3 py-2 pr-4 pl-10 md:pr-5 md:pl-14"
                          >
                            <button
                              aria-label={
                                subDone ? "Reopen subtask" : "Complete subtask"
                              }
                              onClick={() =>
                                void toggleTask({
                                  taskId: sub._id,
                                  done: !subDone,
                                }).catch(() =>
                                  toast.error("Couldn't update the subtask"),
                                )
                              }
                              className={cn(
                                "relative flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors before:absolute before:-inset-2 before:rounded-full before:content-['']",
                                subDone
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border/80 text-transparent hover:border-primary hover:text-primary/40",
                              )}
                            >
                              <Check className="size-2.5" />
                            </button>
                            <p
                              className={cn(
                                "min-w-0 flex-1 truncate text-[13px]",
                                subDone
                                  ? "text-muted-foreground line-through"
                                  : "text-foreground/90",
                              )}
                            >
                              {sub.title}
                            </p>
                            {sub.dueDate !== undefined && (
                              <span
                                className={cn(
                                  "shrink-0 text-xs",
                                  !subDone && sub.dueDate < today
                                    ? "font-medium text-destructive"
                                    : "text-muted-foreground",
                                )}
                              >
                                {relativeDayLabel(sub.dueDate, now)}
                              </span>
                            )}
                            <Flag
                              className={cn(
                                "size-3 shrink-0",
                                PRIORITY_STYLE[sub.priority],
                              )}
                              fill={
                                sub.priority !== "low" ? "currentColor" : "none"
                              }
                            />
                            <button
                              aria-label="Delete subtask"
                              className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                              onClick={() =>
                                void deleteTask({ taskId: sub._id }).catch(() =>
                                  toast.error("Couldn't delete the subtask"),
                                )
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Quick edit: due date · person · note */}
                  {openId === task._id && (
                    <div className="space-y-3.5 border-t border-border/50 bg-muted/25 px-4 py-3.5 md:px-5">
                      {/* Title */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Task
                        </p>
                        <div className="mt-1.5 flex items-end gap-2">
                          <Input
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void submitTitle(task._id);
                            }}
                            className="h-8 flex-1 bg-background text-sm"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              !titleDraft.trim() ||
                              titleDraft.trim() === task.title
                            }
                            onClick={() => void submitTitle(task._id)}
                          >
                            Save title
                          </Button>
                        </div>
                      </div>

                      {/* Due date */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Due date
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {dateOptions.map((opt) => {
                            const active = task.dueDate === opt.value;
                            return (
                              <button
                                key={opt.value}
                                onClick={() =>
                                  void setDueDate(task._id, opt.value)
                                }
                                className={cn(
                                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                                  active
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border/80 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                                )}
                              >
                                {opt.label}
                                {opt.hint && (
                                  <span
                                    className={
                                      active
                                        ? "text-primary/70"
                                        : "text-muted-foreground/70"
                                    }
                                  >
                                    {" "}
                                    · {opt.hint}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => void setDueDate(task._id, undefined)}
                            className={cn(
                              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                              task.dueDate === undefined
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/80 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                            )}
                          >
                            No date
                          </button>
                        </div>
                      </div>

                      {/* Priority */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Priority
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {(["high", "medium", "low"] as Priority[]).map(
                            (p) => (
                              <button
                                key={p}
                                onClick={() =>
                                  void updateTask({
                                    taskId: task._id,
                                    priority: p,
                                  }).catch(() =>
                                    toast.error("Couldn't update the priority"),
                                  )
                                }
                                className={cn(
                                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition-colors",
                                  task.priority === p
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border/80 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                                )}
                              >
                                <Flag
                                  className="size-3"
                                  fill={p !== "low" ? "currentColor" : "none"}
                                />
                                {p}
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      {/* Project */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Project
                        </p>
                        <select
                          value={task.projectId ?? "none"}
                          onChange={(e) => {
                            const value = e.target.value;
                            void updateTask(
                              value === "none"
                                ? { taskId: task._id, clearProject: true }
                                : {
                                    taskId: task._id,
                                    projectId: value as Id<"projects">,
                                  },
                            ).catch(() =>
                              toast.error("Couldn't move the task"),
                            );
                          }}
                          className="mt-1.5 h-8 max-w-full rounded-lg border border-input bg-background px-2 text-sm text-muted-foreground outline-none focus:border-ring"
                        >
                          <option value="none">No project</option>
                          {projects?.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Assignee */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Assigned to
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {team === undefined ? (
                            <Skeleton className="h-7 w-40" />
                          ) : team.length <= 1 ? (
                            <button
                              onClick={() => navigate("/app/settings")}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Add people’s emails in Settings →
                            </button>
                          ) : (
                            <>
                              {team.map((person) => {
                                const active =
                                  task.assigneeEmail?.toLowerCase() ===
                                  person.email;
                                return (
                                  <button
                                    key={person.email}
                                    onClick={() =>
                                      void setAssignee(task, person, active)
                                    }
                                    title={person.email}
                                    className={cn(
                                      "flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                                      active
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border/80 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                                        active
                                          ? "bg-primary/20 text-primary"
                                          : "bg-muted text-muted-foreground",
                                      )}
                                    >
                                      {(person.name ?? person.email)
                                        .trim()
                                        .charAt(0)
                                        .toUpperCase()}
                                    </span>
                                    <span className="truncate">
                                      {person.name ??
                                        person.email.split("@")[0]}
                                    </span>
                                  </button>
                                );
                              })}
                              {task.assigneeEmail && (
                                <button
                                  onClick={() =>
                                    void setAssignee(
                                      task,
                                      { email: task.assigneeEmail! },
                                      true,
                                    )
                                  }
                                  className="rounded-lg border border-border/80 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                                >
                                  Unassign
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Subtasks */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Subtasks
                        </p>
                        {subs.length > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {subs.map((sub) => (
                              <li
                                key={sub._id}
                                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5"
                              >
                                <button
                                  aria-label={
                                    sub.status === "done"
                                      ? "Reopen subtask"
                                      : "Complete subtask"
                                  }
                                  onClick={() =>
                                    void toggleTask({
                                      taskId: sub._id,
                                      done: sub.status !== "done",
                                    }).catch(() =>
                                      toast.error(
                                        "Couldn't update the subtask",
                                      ),
                                    )
                                  }
                                  className={cn(
                                    "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                                    sub.status === "done"
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border/80 text-transparent hover:border-primary",
                                  )}
                                >
                                  <Check className="size-2.5" />
                                </button>
                                <span
                                  className={cn(
                                    "min-w-0 flex-1 truncate text-sm",
                                    sub.status === "done" &&
                                      "text-muted-foreground line-through",
                                  )}
                                >
                                  {sub.title}
                                </span>
                                <button
                                  aria-label="Delete subtask"
                                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                                  onClick={() =>
                                    void deleteTask({
                                      taskId: sub._id,
                                    }).catch(() =>
                                      toast.error(
                                        "Couldn't delete the subtask",
                                      ),
                                    )
                                  }
                                >
                                  <X className="size-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-1.5 flex items-end gap-2">
                          <Input
                            value={subtaskDraft}
                            onChange={(e) => setSubtaskDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void addSubtask(task._id);
                            }}
                            placeholder="Add a subtask…"
                            className="h-8 flex-1 bg-background text-sm"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!subtaskDraft.trim()}
                            onClick={() => void addSubtask(task._id)}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Note */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Note{" "}
                          <span className="font-normal">
                            — just in case something didn’t go right
                          </span>
                        </p>
                        {(task.comments?.length ?? 0) > 0 && (
                          <ul className="mt-1.5 space-y-1.5">
                            {task.comments!.map((c) => (
                              <li
                                key={c.id}
                                className="flex items-start gap-2 rounded-lg border border-border/60 bg-card px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-medium text-muted-foreground">
                                    {c.author} ·{" "}
                                    {new Date(c.createdAt).toLocaleString(
                                      undefined,
                                      {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      },
                                    )}
                                  </p>
                                  <p className="mt-0.5 break-words whitespace-pre-wrap text-sm">
                                    {c.text}
                                  </p>
                                </div>
                                <button
                                  aria-label="Delete note"
                                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                                  onClick={() =>
                                    void removeComment({
                                      taskId: task._id,
                                      commentId: c.id,
                                    }).catch(() =>
                                      toast.error("Couldn't delete the note"),
                                    )
                                  }
                                >
                                  <X className="size-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-1.5 flex items-end gap-2">
                          <Textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void submitNote(task._id);
                              }
                            }}
                            rows={2}
                            placeholder="Add a note…"
                            className="min-h-[60px] flex-1 resize-none text-sm"
                          />
                          <Button
                            size="sm"
                            disabled={!noteDraft.trim()}
                            onClick={() => void submitNote(task._id)}
                          >
                            Add note
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
