import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { DAY_MS, relativeDayLabel, utcDayStart } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Plus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type ViewMode = "plan" | "done";

/** Row shape returned by api.tasks.list — a task doc + resolved project name. */
type TaskRow = Doc<"tasks"> & { projectName?: string };

/** First instant (UTC) of the month containing ts — matches dueDate storage. */
function monthStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function nextMonthStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** Cheap "how many months away is this from now" for labels/hints. */
function monthIndex(ts: number): number {
  const d = new Date(ts);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export default function CalendarPage() {
  const tasks = useQuery(api.tasks.list);
  const createTask = useMutation(api.tasks.create);
  const toggleTask = useMutation(api.tasks.toggle);

  // Anchor = day 1 of the displayed month (UTC day-start, like dueDate).
  const [anchor, setAnchor] = useState(() => monthStart(Date.now()));
  const [view, setView] = useState<ViewMode>("plan");
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  // Captured once at mount — satisfies render purity; valid for the session.
  const [now] = useState(() => Date.now());
  const today = utcDayStart(now);
  const start = anchor;
  const end = nextMonthStart(anchor);
  const offset = monthIndex(anchor) - monthIndex(now);
  const monthLabel = new Date(anchor).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // Bucket tasks: plan view by due date, review view by completion date.
  const { byDay, doneByDay, openCount, dueDoneCount, doneCount } =
    useMemo(() => {
      const byDay = new Map<number, TaskRow[]>();
      const doneByDay = new Map<number, TaskRow[]>();
      let open = 0;
      let dueDone = 0;
      let done = 0;
      for (const t of tasks ?? []) {
        if (t.dueDate !== undefined && t.dueDate >= start && t.dueDate < end) {
          const arr = byDay.get(t.dueDate) ?? [];
          arr.push(t);
          byDay.set(t.dueDate, arr);
          if (t.status === "done") dueDone++;
          else open++;
        }
        const completedInMonth =
          t.completedAt !== undefined &&
          t.completedAt >= start &&
          t.completedAt < end;
        // Legacy safety: done but never stamped → attribute to its due date.
        const completedByDue =
          t.status === "done" &&
          t.completedAt === undefined &&
          t.dueDate !== undefined &&
          t.dueDate >= start &&
          t.dueDate < end;
        if (completedInMonth || completedByDue) {
          const day =
            completedInMonth && t.completedAt !== undefined
              ? utcDayStart(t.completedAt)
              : (t.dueDate ?? start);
          const arr = doneByDay.get(day) ?? [];
          arr.push(t);
          doneByDay.set(day, arr);
          done++;
        }
      }
      return {
        byDay,
        doneByDay,
        openCount: open,
        dueDoneCount: dueDone,
        doneCount: done,
      };
    }, [tasks, start, end]);

  // Monday-first grid, UTC-consistent with the rest of the app.
  const leading = (new Date(start).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(end - DAY_MS).getUTCDate();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const cells = useMemo(
    () => Array.from({ length: totalCells }, (_, i) => start + i * DAY_MS),
    [start, totalCells],
  );

  const stepMonth = (delta: number) => {
    const d = new Date(anchor);
    setAnchor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
    setSelected(null);
  };

  const goToday = () => {
    setAnchor(monthStart(now));
    setSelected(null);
  };

  const savePdf = () => {
    const prev = document.title;
    document.title = `OCIVO calendar — ${monthLabel}`;
    window.print();
    document.title = prev;
  };

  const submit = async () => {
    const title = draft.trim();
    if (!title || selected === null) return;
    try {
      await createTask({
        title,
        dueDate: selected,
        priority: "medium",
        source: "manual",
      });
      setDraft("");
      const future = selected > today;
      toast.success(
        future
          ? `Drafted for ${relativeDayLabel(selected, now)}`
          : "Task added",
        {
          description: title,
        },
      );
    } catch (err) {
      console.error(err);
      toast.error("Couldn't add the task");
    }
  };

  const dayTasks = selected !== null ? (byDay.get(selected) ?? []) : [];
  const dayDone = selected !== null ? (doneByDay.get(selected) ?? []) : [];

  const subtitle =
    tasks === undefined
      ? "Loading…"
      : view === "plan"
        ? `${openCount} open · ${dueDoneCount} done · ${
            offset === -1
              ? "last month"
              : offset === 1
                ? "next month"
                : "this month"
          }`
        : `${doneCount} completed ${
            offset === -1
              ? "last month"
              : offset === 0
                ? "this month"
                : `in ${monthLabel}`
          }`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight">Calendar</h1>
            {offset > 0 && (
              <span className="rounded-full bg-accent/50 px-2 py-0.5 text-[11px] font-medium text-ai-deep">
                Planning ahead
              </span>
            )}
            {offset === -1 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Last month
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="no-print flex items-center gap-2">
          <Tabs
            value={view}
            onValueChange={(v) => {
              setView(v as ViewMode);
              setSelected(null);
            }}
          >
            <TabsList className="h-9">
              <TabsTrigger value="plan">Plan</TabsTrigger>
              <TabsTrigger value="done">Done</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={savePdf}
          >
            <FileDown className="size-3.5" />
            Save as PDF
          </Button>
        </div>
      </header>

      {/* Month nav */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 no-print"
            aria-label="Previous month"
            onClick={() => stepMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="font-display text-2xl tracking-tight">{monthLabel}</h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 no-print"
            aria-label="Next month"
            onClick={() => stepMonth(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="no-print ml-1"
          onClick={goToday}
        >
          Today
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {view === "plan" ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary/70" /> open
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="size-3 text-moss" /> done
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="grid size-4 place-items-center rounded-full bg-moss/20 text-[9px] font-bold text-moss">
                n
              </span>
              completed that day
            </span>
          )}
        </div>
      </div>

      {view === "plan" && selected === null && (
        <p className="no-print mt-2 text-xs text-muted-foreground">
          Click any day to draft tasks for it — hit › to plan next month, or
          switch to <span className="font-medium text-foreground">Done</span> to
          review what got finished.
        </p>
      )}

      {/* Grid */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/40">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:text-[11px]"
            >
              <span className="md:hidden">{w.charAt(0)}</span>
              <span className="hidden md:inline">{w}</span>
            </div>
          ))}
        </div>

        {tasks === undefined ? (
          <div className="grid grid-cols-7 gap-px bg-border/50">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton
                key={i}
                className="min-h-[74px] rounded-none md:min-h-[110px]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-border/50">
            {cells.map((cell) => {
              const outOfMonth = cell < start || cell >= end;
              const dayTasks_ =
                view === "plan"
                  ? (byDay.get(cell) ?? [])
                  : (doneByDay.get(cell) ?? []);
              const count = dayTasks_.length;
              const isToday = cell === today;
              const isSelected = cell === selected;
              const clickable = !outOfMonth;
              return (
                <button
                  key={cell}
                  type="button"
                  disabled={!clickable}
                  aria-label={new Date(cell).toDateString()}
                  onClick={() => {
                    if (clickable) setSelected(isSelected ? null : cell);
                  }}
                  className={cn(
                    "group relative flex min-h-[74px] flex-col gap-1 p-1.5 text-left transition-colors md:min-h-[110px] md:p-2",
                    outOfMonth
                      ? "cursor-default bg-muted/30"
                      : "hover:bg-accent/40",
                    isSelected &&
                      "bg-primary/5 ring-1 ring-inset ring-primary/40",
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-1">
                    <span
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : outOfMonth
                            ? "text-muted-foreground/40"
                            : "text-muted-foreground",
                      )}
                    >
                      {new Date(cell).getUTCDate()}
                    </span>
                    {count > 0 && (
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold tabular-nums",
                          view === "done"
                            ? "bg-moss/25 text-moss"
                            : "bg-primary/12 text-primary",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </div>

                  {count > 0 && (
                    <div className="hidden w-full flex-col gap-1 md:flex">
                      {dayTasks_.slice(0, 3).map((t) => {
                        const done = view === "done" || t.status === "done";
                        return (
                          <span
                            key={t._id}
                            className={cn(
                              "flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight",
                              done
                                ? "bg-muted text-muted-foreground"
                                : "bg-primary/8 text-foreground",
                            )}
                          >
                            {done ? (
                              <Check className="size-3 shrink-0 text-moss" />
                            ) : (
                              <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
                            )}
                            <span
                              className={cn("truncate", done && "line-through")}
                            >
                              {t.title}
                            </span>
                          </span>
                        );
                      })}
                      {dayTasks_.length > 3 && (
                        <span className="px-1 text-[10px] text-muted-foreground">
                          +{dayTasks_.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {view === "done" && tasks !== undefined && doneCount === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed px-6 py-8 text-center">
          <p className="font-medium">Nothing marked done in {monthLabel} yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Flip tasks to done on the Tasks page and they'll show up here as
            your month review.
          </p>
        </div>
      )}

      {/* Day panel — draft / review a single day */}
      {selected !== null && (
        <section className="no-print mt-4 rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">
                {new Date(selected).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </h3>
              <p className="text-xs text-muted-foreground">
                {view === "done"
                  ? `${dayDone.length} completed`
                  : relativeDayLabel(selected, now)}
                {view === "plan" && selected > today
                  ? " — draft tasks here before they arrive"
                  : ""}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label="Close day panel"
              onClick={() => setSelected(null)}
            >
              <X className="size-4" />
            </Button>
          </div>

          {view === "plan" && (
            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  offset > 0
                    ? `Draft a task in ${monthLabel}…`
                    : "What needs doing?"
                }
                className="h-9 flex-1"
              />
              <Button size="sm" className="gap-1" disabled={!draft.trim()}>
                <Plus className="size-3.5" />
                Add
              </Button>
            </form>
          )}

          {view === "plan" &&
            (dayTasks.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Nothing planned for this day yet.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border/50">
                {dayTasks.map((task) => {
                  const done = task.status === "done";
                  return (
                    <li key={task._id} className="flex items-center gap-3 py-2">
                      <button
                        aria-label={done ? "Reopen task" : "Complete task"}
                        onClick={() =>
                          void toggleTask({
                            taskId: task._id,
                            done: !done,
                          }).catch(() =>
                            toast.error("Couldn't update the task"),
                          )
                        }
                        className={cn(
                          "relative flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors before:absolute before:-inset-2 before:rounded-full before:content-['']",
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
                          done && "text-muted-foreground line-through",
                        )}
                      >
                        {task.title}
                      </span>
                      {task.dueTime && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {task.dueTime}
                        </span>
                      )}
                      {task.projectName && (
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                          {task.projectName}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ))}

          {view === "done" &&
            (dayDone.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Nothing was completed on this day.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {dayDone.map((task) => (
                  <li
                    key={task._id}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="size-3.5 shrink-0 text-moss" />
                    <span className="truncate line-through">{task.title}</span>
                  </li>
                ))}
              </ul>
            ))}
        </section>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        “Save as PDF” opens your browser’s print dialog — choose{" "}
        <em>Save as PDF</em>.
      </p>
    </div>
  );
}
