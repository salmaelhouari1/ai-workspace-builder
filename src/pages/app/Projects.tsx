import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { relativeDayLabel, localDayStart } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import { FolderKanban, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  done: "Done",
};

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  active: "bg-primary/12 text-primary",
  paused: "bg-ai/15 text-ai-deep",
  done: "bg-muted text-muted-foreground",
};

export default function Projects() {
  const navigate = useNavigate();
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);
  const [searchParams, setSearchParams] = useSearchParams();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  // ?new=<name> from the command bar
  useEffect(() => {
    const prefill = searchParams.get("new");
    if (prefill) {
      setName(prefill);
      setOpen(true);
      const params = new URLSearchParams(searchParams);
      params.delete("new");
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const deadlineTs = deadline ? localDayStart(new Date(`${deadline}T00:00:00`)) : undefined;
      const id = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        deadline: deadlineTs,
      });
      toast.success("Project created", { description: name.trim() });
      setOpen(false);
      setName("");
      setDescription("");
      setDeadline("");
      navigate(`/app/projects/${id}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create the project");
    } finally {
      setSaving(false);
    }
  };

  const now = Date.now();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects
              ? `${projects.length} project${projects.length === 1 ? "" : "s"} · built for your ${projects.length ? "business" : "workspace"}`
              : "Loading…"}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          New project
        </Button>
      </header>

      {projects === undefined ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FolderKanban className="size-5" />
          </span>
          <p className="font-medium">No projects yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create one, or open the command bar (⌘K) and type “Create a project
            for my website redesign”.
          </p>
          <Button className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            New project
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <button
              key={project._id}
              onClick={() => navigate(`/app/projects/${project._id}`)}
              className="group rounded-2xl border border-border/70 bg-card p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold leading-snug group-hover:text-primary">
                  {project.name}
                </h2>
                <Badge className={cn("shrink-0 border-0 font-medium", STATUS_STYLE[project.status])}>
                  {STATUS_LABEL[project.status]}
                </Badge>
              </div>
              {project.description && (
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                  {project.description}
                </p>
              )}

              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.max(project.progress, 2)}%` }}
                />
              </div>

              <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {project.doneTasks}/{project.totalTasks} tasks · {project.progress}%
                </span>
                {project.deadline !== undefined && (
                  <span className={cn(relativeDayLabel(project.deadline, now).includes("late") && "text-destructive")}>
                    {relativeDayLabel(project.deadline, now)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-ai-deep" />
              New project
            </DialogTitle>
            <DialogDescription>
              Keep it simple — OCIVO will help you fill it with tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product launch"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && void submit()}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-desc">Description (optional)</Label>
              <Textarea
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What does done look like?"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-deadline">Deadline (optional)</Label>
              <Input
                id="project-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim() || saving}>
              {saving ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
