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
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { localDayStart, relativeDayLabel } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import {
  Check,
  FolderKanban,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

interface GoalDraft {
  id?: string;
  title: string;
  target: string;
  current: string;
  unit: string;
  deadline: string;
  projectIds: string[];
}

const EMPTY: GoalDraft = {
  title: "",
  target: "",
  current: "",
  unit: "",
  deadline: "",
  projectIds: [],
};

export default function Goals() {
  const navigate = useNavigate();
  const goals = useQuery(api.goals.list);
  const linkable = useQuery(api.goals.linkableProjects);
  const createGoal = useMutation(api.goals.create);
  const updateGoal = useMutation(api.goals.update);
  const deleteGoal = useMutation(api.goals.remove);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GoalDraft>(EMPTY);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setDraft(EMPTY);
    setOpen(true);
  };

  const openEdit = (goal: NonNullable<typeof goals>[number]) => {
    setDraft({
      id: goal._id,
      title: goal.title,
      target: goal.target !== undefined ? String(goal.target) : "",
      current: goal.current !== undefined ? String(goal.current) : "",
      unit: goal.unit ?? "",
      deadline: goal.deadline
        ? new Date(goal.deadline).toISOString().slice(0, 10)
        : "",
      projectIds: goal.projectIds ?? [],
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      const deadline = draft.deadline
        ? localDayStart(new Date(`${draft.deadline}T00:00:00`))
        : undefined;
      const payload = {
        title: draft.title.trim(),
        target: draft.target ? Number(draft.target) : undefined,
        current: draft.current ? Number(draft.current) : undefined,
        unit: draft.unit.trim() || undefined,
        deadline,
        projectIds: draft.projectIds as Id<"projects">[],
      };
      if (draft.id) {
        await updateGoal({ goalId: draft.id as never, ...payload });
        toast.success("Goal updated");
      } else {
        await createGoal(payload);
        toast.success("Goal created");
      }
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save the goal");
    } finally {
      setSaving(false);
    }
  };

  const [now] = useState(() => Date.now());

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-12 pt-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Goals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What you're aiming for — and whether you're on pace.
          </p>
        </div>
        <Button className="gap-2" onClick={openNew}>
          <Plus className="size-4" />
          New goal
        </Button>
      </header>

      {goals === undefined ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : goals.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Target className="size-5" />
          </span>
          <p className="font-medium">No goals yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Example: “Reach €10,000 revenue by December” — OCIVO will track your
            pace and tell you when you're falling behind.
          </p>
          <Button className="gap-2" onClick={openNew}>
            <Plus className="size-4" />
            New goal
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {goals.map((goal) => (
            <div
              key={goal._id}
              className={cn(
                "rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
                goal.status === "done" ? "opacity-70" : "border-border/70",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => openEdit(goal)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{goal.title}</h2>
                    {goal.status === "done" && (
                      <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                        achieved
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {goal.progress !== null && (
                      <span className="font-semibold tabular-nums text-foreground">
                        {goal.progress}%
                      </span>
                    )}
                    {goal.current !== undefined &&
                      goal.target !== undefined && (
                        <span className="tabular-nums">
                          {goal.current}
                          {goal.unit === "%"
                            ? "%"
                            : goal.unit
                              ? ` ${goal.unit}`
                              : ""}{" "}
                          / {goal.target}
                          {goal.unit === "%"
                            ? "%"
                            : goal.unit
                              ? ` ${goal.unit}`
                              : ""}
                        </span>
                      )}
                    {goal.deadline !== undefined && (
                      <span>by {relativeDayLabel(goal.deadline, now)}</span>
                    )}
                    {goal.progressSource === "projects" && (
                      <span className="text-xs">from linked projects</span>
                    )}
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => openEdit(goal)}
                  >
                    Update
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label="Delete goal"
                    onClick={() =>
                      void deleteGoal({ goalId: goal._id }).then(() =>
                        toast.success("Goal deleted"),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.max(goal.progress ?? 0, 2)}%` }}
                />
              </div>

              {goal.linkedProjects.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {goal.linkedProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/app/projects/${p.id}`)}
                      title={`${p.doneTasks}/${p.totalTasks} tasks done`}
                      className="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <FolderKanban className="size-3" />
                      <span className="max-w-[18ch] truncate">{p.name}</span>
                      <span className="tabular-nums">{p.progress}%</span>
                    </button>
                  ))}
                </div>
              )}

              {goal.note && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-ai/25 bg-ai/10 px-3.5 py-2.5 text-sm text-foreground/90">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-ai-deep" />
                  {goal.note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="size-4 text-primary" />
              {draft.id ? "Update goal" : "New goal"}
            </DialogTitle>
            <DialogDescription>
              Numbers help OCIVO track your pace automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="goal-title">Goal</Label>
              <Input
                id="goal-title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Reach €10,000 revenue by December"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && void submit()}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="goal-current">Current</Label>
                <Input
                  id="goal-current"
                  type="number"
                  inputMode="decimal"
                  value={draft.current}
                  onChange={(e) =>
                    setDraft({ ...draft, current: e.target.value })
                  }
                  placeholder="6400"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="goal-target">Target</Label>
                <Input
                  id="goal-target"
                  type="number"
                  inputMode="decimal"
                  value={draft.target}
                  onChange={(e) =>
                    setDraft({ ...draft, target: e.target.value })
                  }
                  placeholder="10000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="goal-unit">Unit</Label>
                <Input
                  id="goal-unit"
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  placeholder="€"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="goal-deadline">Deadline (optional)</Label>
              <Input
                id="goal-deadline"
                type="date"
                value={draft.deadline}
                onChange={(e) =>
                  setDraft({ ...draft, deadline: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>
                Linked projects{" "}
                <span className="font-normal text-muted-foreground">
                  — progress follows their tasks
                </span>
              </Label>
              {linkable === undefined ? (
                <Skeleton className="h-8" />
              ) : linkable.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No projects yet — create one in Projects first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {linkable.map((p) => {
                    const active = draft.projectIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            projectIds: active
                              ? draft.projectIds.filter((x) => x !== p.id)
                              : [...draft.projectIds, p.id],
                          })
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/80 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                        )}
                      >
                        {active && <Check className="size-3" />}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="items-center gap-2 sm:justify-between">
            {draft.id ? (
              <Button
                variant="ghost"
                className="text-primary"
                onClick={() =>
                  void updateGoal({
                    goalId: draft.id as never,
                    status: "done",
                  }).then(() => {
                    toast.success("Goal marked as achieved 🎉");
                    setOpen(false);
                  })
                }
              >
                <Check className="mr-1.5 size-4" />
                Mark achieved
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!draft.title.trim() || saving}>
                {saving ? "Saving…" : "Save goal"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
