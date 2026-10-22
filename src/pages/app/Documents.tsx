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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FileText, FolderKanban, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function Documents() {
  const navigate = useNavigate();
  const docs = useQuery(api.documents.list);
  const projects = useQuery(api.projects.list);
  const createDoc = useMutation(api.documents.create);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Notes");
  const [projectId, setProjectId] = useState("none");

  const grouped = useMemo(() => {
    if (!docs) return null;
    const map = new Map<string, typeof docs>();
    for (const doc of docs) {
      const key = doc.category || "Notes";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [docs]);

  const submit = async () => {
    if (!title.trim()) return;
    try {
      const id = await createDoc({
        title: title.trim(),
        category: category.trim() || "Notes",
        content: `# ${title.trim()}\n\n`,
        projectId:
          projectId !== "none" ? (projectId as Id<"projects">) : undefined,
      });
      setOpen(false);
      setTitle("");
      setProjectId("none");
      navigate(`/app/documents/${id}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create the document");
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Simple pages for everything you know — no blocks to learn.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          New document
        </Button>
      </header>

      {grouped === null ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileText className="size-5" />
          </span>
          <p className="font-medium">No documents yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            OCIVO already wrote your business overview — add more pages as you
            learn.
          </p>
          <Button className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            New document
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {grouped.map(([cat, list]) => (
            <section key={cat}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {cat}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((doc) => (
                  <button
                    key={doc._id}
                    onClick={() => navigate(`/app/documents/${doc._id}`)}
                    className="group rounded-2xl border border-border/70 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="size-3.5" />
                      </span>
                      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold group-hover:text-primary">
                        {doc.title}
                      </h3>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {doc.content
                        .replace(/^#+\s.*$/gm, "")
                        .replace(/[*_>`#[\]()-]/g, "")
                        .trim()
                        .slice(0, 180) || "Empty page"}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          {doc.category}
                        </Badge>
                        {doc.projectName && (
                          <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <FolderKanban className="size-3 shrink-0" />
                            <span className="truncate">{doc.projectName}</span>
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(doc.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-ai-deep" />
              New document
            </DialogTitle>
            <DialogDescription>Give it a title — that's it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Client onboarding"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && void submit()}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-category">Section</Label>
              <Input
                id="doc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Notes"
              />
            </div>
            {(projects?.length ?? 0) > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="doc-project">Project (optional)</Label>
                <select
                  id="doc-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-muted-foreground outline-none focus:border-ring"
                >
                  <option value="none">No project</option>
                  {projects?.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!title.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
