import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Proposal } from "@/convex/assistant";
import { relativeDayLabel } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import { CalendarDays, Check, FileText, ListChecks, Target, X } from "lucide-react";
import { useState } from "react";

/**
 * Preview → Confirm → Execute (spec §8 / §25).
 *
 * The AI prepares a change; nothing is written until the user confirms.
 * "Edit" lets them uncheck individual items first.
 */
export function ProposalPreview({
  proposal,
  onConfirm,
  onDismiss,
  busy = false,
}: {
  proposal: Proposal;
  onConfirm: (confirmed: Proposal) => void;
  onDismiss?: () => void;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const today = Date.now();

  const tasks =
    proposal.kind === "createTasks" || proposal.kind === "createProject"
      ? proposal.tasks
      : [];

  const title = (() => {
    switch (proposal.kind) {
      case "createTasks":
        return proposal.projectLabel ? `tasks in “${proposal.projectLabel}”` : "new tasks";
      case "createProject":
        return `project “${proposal.name}”`;
      case "updateTask":
        return "task update";
      case "updateProject":
        return "project update";
      case "createGoal":
        return `goal “${proposal.title}”`;
      case "createDocument":
        return `document “${proposal.title}”`;
    }
  })();

  const icon =
    proposal.kind === "createProject" || proposal.kind === "updateProject" ? (
      <ListChecks className="size-4" />
    ) : proposal.kind === "createGoal" ? (
      <Target className="size-4" />
    ) : proposal.kind === "createDocument" ? (
      <FileText className="size-4" />
    ) : (
      <Check className="size-4" />
    );

  const details: string[] = [];
  if (proposal.kind === "createProject" && proposal.deadline !== undefined) {
    details.push(`Deadline: ${relativeDayLabel(proposal.deadline, today)}`);
  }
  if (proposal.kind === "createGoal") {
    if (proposal.target !== undefined) {
      details.push(`Target: ${proposal.target}${proposal.unit ? ` ${proposal.unit}` : ""}`);
    }
    if (proposal.deadline !== undefined) {
      details.push(`By: ${relativeDayLabel(proposal.deadline, today)}`);
    }
  }
  if (proposal.kind === "updateTask") {
    if (proposal.clearDue) details.push("Due date: removed");
    else if (proposal.dueDate !== undefined) {
      details.push(`Due: ${relativeDayLabel(proposal.dueDate, today)}`);
    }
    if (proposal.status) details.push(`Status: ${proposal.status.replace("_", " ")}`);
    if (proposal.note) details.push(proposal.note);
  }
  if (proposal.kind === "updateProject") {
    if (proposal.clearDeadline) details.push("Deadline: removed");
    else if (proposal.deadline !== undefined) {
      details.push(`Deadline: ${relativeDayLabel(proposal.deadline, today)}`);
    }
    if (proposal.status) details.push(`Status: ${proposal.status}`);
    if (proposal.note) details.push(proposal.note);
  }

  const confirm = () => {
    if (
      (proposal.kind === "createTasks" || proposal.kind === "createProject") &&
      excluded.size
    ) {
      const filtered: Proposal =
        proposal.kind === "createTasks"
          ? {
              ...proposal,
              tasks: proposal.tasks.filter((_, i) => !excluded.has(i)),
            }
          : {
              ...proposal,
              tasks: proposal.tasks.filter((_, i) => !excluded.has(i)),
            };
      if (!filtered.tasks.length) return;
      onConfirm(filtered);
      return;
    }
    onConfirm(proposal);
  };

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-ai/30 bg-[color-mix(in_oklab,var(--ai)_6%,var(--card))]">
      <div className="flex items-center gap-2 border-b border-ai/20 px-3.5 py-2.5 text-xs font-semibold text-ai-deep">
        {icon}
        OCIVO prepared {title} — review before it runs
      </div>

      <div className="space-y-2 px-3.5 py-3">
        <p className="text-sm font-medium">I'll create:</p>

        {proposal.kind === "createProject" && (
          <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Project:</span>{" "}
            <span className="font-medium">{proposal.name}</span>
          </div>
        )}
        {proposal.kind === "createGoal" && (
          <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Goal:</span>{" "}
            <span className="font-medium">{proposal.title}</span>
          </div>
        )}
        {proposal.kind === "createDocument" && (
          <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Document:</span>{" "}
            <span className="font-medium">{proposal.title}</span>
          </div>
        )}

        {details.map((d) => (
          <div
            key={d}
            className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm"
          >
            <CalendarDays className="size-3.5 text-muted-foreground" />
            {d}
          </div>
        ))}

        {tasks.length > 0 && (
          <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
            <p className="text-sm">
              <span className="text-muted-foreground">Tasks:</span>{" "}
              <span className="font-medium">{tasks.length}</span>
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {tasks.map((task, index) => (
                <li key={`${task.title}-${index}`} className="flex items-start gap-2 text-sm">
                  {editing && (
                    <Checkbox
                      checked={!excluded.has(index)}
                      onCheckedChange={(checked) => {
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (checked) next.delete(index);
                          else next.add(index);
                          return next;
                        });
                      }}
                      className="mt-0.5"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    {editing && excluded.has(index) ? (
                      <span className="text-muted-foreground line-through">{task.title}</span>
                    ) : (
                      task.title
                    )}
                    {task.dueDate !== undefined && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        · {relativeDayLabel(task.dueDate, today)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {proposal.kind === "createTasks" && !tasks.length && (
          <p className="text-sm text-muted-foreground">No tasks in this proposal.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-ai/20 px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={busy}
            onClick={confirm}
          >
            <Check className="size-3.5" />
            Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn("h-8", editing && "border-primary text-primary")}
            disabled={busy || !tasks.length}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? "Done editing" : "Edit"}
          </Button>
        </div>
        {onDismiss && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground"
            disabled={busy}
            onClick={onDismiss}
          >
            <X className="size-3.5 mr-1" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
