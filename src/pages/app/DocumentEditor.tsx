import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/components/Markdown";
import { ProposalPreview } from "@/components/ProposalPreview";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Proposal } from "@/convex/assistant";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckSquare,
  ListChecks,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

type AiCommand = "summary" | "tasks" | "checklist" | "plan";

const AI_COMMANDS: { key: AiCommand; label: string }[] = [
  { key: "summary", label: "Summarize" },
  { key: "tasks", label: "Extract tasks" },
  { key: "checklist", label: "Checklist" },
  { key: "plan", label: "Action plan" },
];

const TOOLBAR_ITEMS: {
  label: string;
  before: string;
  after?: string;
  block?: boolean;
}[] = [
  { label: "H1", before: "# ", block: true },
  { label: "H2", before: "## ", block: true },
  { label: "B", before: "**", after: "**" },
  { label: "I", before: "*", after: "*" },
  { label: "• list", before: "- ", block: true },
  { label: "☑ task", before: "- [ ] ", block: true },
  { label: "1.", before: "1. ", block: true },
  { label: "“ quote", before: "> ", block: true },
  { label: "</>", before: "```\n", after: "\n```" },
  { label: "✦ callout", before: "> [!ai] ", block: true },
];

const INSTRUCTIONS: Record<AiCommand, string> = {
  summary: "Summarize this document in a few tight bullet points.",
  tasks: "Extract every action item from this document as tasks.",
  checklist: "Turn this document into a checklist.",
  plan: "Create a concrete action plan from this document.",
};

interface AiResult {
  answer: string;
  proposal: Proposal | null;
}

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const doc = useQuery(
    api.documents.get,
    id ? { documentId: id as never } : "skip",
  );
  const projects = useQuery(api.projects.list);
  const updateDoc = useMutation(api.documents.update);
  const deleteDoc = useMutation(api.documents.remove);
  const chat = useAction(api.assistant.chat);
  const applyProposal = useMutation(api.proposals.apply);

  const [view, setView] = useState<"write" | "preview">("write");
  const [aiBusy, setAiBusy] = useState<AiCommand | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [content, setContent] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<number | null>(null);

  // Local mirror so typing stays instant; Convex reconciles in the background.
  // When a different doc loads, re-seed the drafts — the "adjust state during
  // render" pattern, so no effect (and no flicker) needed.
  const docId = doc?._id ?? null;
  const [seededId, setSeededId] = useState<string | null>(null);
  if (docId !== seededId) {
    setSeededId(docId);
    if (doc) {
      setContent(doc.content);
      setTitleDraft(doc.title);
    }
  }

  // Debounced autosave.
  const scheduleSave = (content: string) => {
    if (!id) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void updateDoc({ documentId: id as never, content }).catch((err) => {
        console.error(err);
        toast.error("Couldn't save");
      });
    }, 700);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const insert = (before: string, after = "", block = false) => {
    const area = areaRef.current;
    if (!area || !id) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = content.slice(start, end);
    let next: string;
    let caret: number;

    if (block) {
      const lineStart = content.lastIndexOf("\n", start - 1) + 1;
      next = content.slice(0, lineStart) + before + content.slice(lineStart);
      caret = start + before.length;
    } else {
      next =
        content.slice(0, start) +
        before +
        selected +
        after +
        content.slice(end);
      caret = start + before.length + selected.length + after.length;
    }

    setContent(next);
    scheduleSave(next);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(caret, caret);
    });
  };

  const runAi = async (command: AiCommand) => {
    if (!doc || !id) return;
    setAiBusy(command);
    setAiResult(null);
    try {
      const result = await chat({
        question: INSTRUCTIONS[command],
        mode: "document",
        documentId: id as never,
        instruction: INSTRUCTIONS[command],
      });
      setAiResult({ answer: result.answer, proposal: result.proposal });
    } catch (err) {
      console.error(err);
      toast.error("The assistant is unavailable right now");
    } finally {
      setAiBusy(null);
    }
  };

  const confirmProposal = async (proposal: Proposal) => {
    setConfirming(true);
    try {
      const result = await applyProposal({ proposal } as never);
      toast.success(result.summary ?? "Done");
      setAiResult(null);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't apply the change");
    } finally {
      setConfirming(false);
    }
  };

  if (doc === undefined) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-4 h-96 w-full rounded-2xl" />
      </div>
    );
  }
  if (doc === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16 text-center md:px-8">
        <p className="font-medium">Document not found</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => navigate("/app/documents")}
        >
          Back to documents
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => navigate("/app/documents")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Documents
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {(projects?.length ?? 0) > 0 && (
            <select
              value={doc.projectId ?? "none"}
              onChange={(e) => {
                const value = e.target.value;
                void updateDoc(
                  value === "none"
                    ? { documentId: doc._id, clearProject: true }
                    : {
                        documentId: doc._id,
                        projectId: value as Id<"projects">,
                      },
                )
                  .then(() =>
                    toast.success(
                      value === "none"
                        ? "Unlinked from project"
                        : "Linked to project",
                    ),
                  )
                  .catch(() => toast.error("Couldn't update the project link"));
              }}
              className="h-7 max-w-[11rem] rounded-full border border-input bg-background px-2 text-xs text-muted-foreground outline-none focus:border-ring"
              aria-label="Link to project"
            >
              <option value="none">No project</option>
              {projects?.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {doc.category}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label="Delete document"
            onClick={() =>
              void deleteDoc({ documentId: doc._id }).then(() => {
                toast.success("Document deleted");
                navigate("/app/documents");
              })
            }
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <input
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={() => {
          if (titleDraft !== doc.title) {
            void updateDoc({ documentId: doc._id, title: titleDraft }).catch(
              () => toast.error("Couldn't save the title"),
            );
          }
        }}
        className="mt-4 w-full bg-transparent font-display text-3xl tracking-tight outline-none placeholder:text-muted-foreground/50 md:text-4xl"
        placeholder="Untitled"
      />

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-card px-2 py-1.5">
        {TOOLBAR_ITEMS.map((btn) => (
          <button
            key={btn.label}
            onClick={() => insert(btn.before, btn.after, btn.block)}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {btn.label}
          </button>
        ))}

        <div className="ml-auto">
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as "write" | "preview")}
          >
            <TabsList className="h-8">
              <TabsTrigger value="write" className="text-xs">
                Write
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">
                Preview
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* AI document actions (spec §14) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-ai-deep">
          <Sparkles className="size-3.5" />
          AI
        </span>
        {AI_COMMANDS.map((cmd) => (
          <Button
            key={cmd.key}
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            disabled={aiBusy !== null}
            onClick={() => void runAi(cmd.key)}
          >
            {aiBusy === cmd.key ? (
              <Loader2 className="size-3 animate-spin" />
            ) : cmd.key === "tasks" ? (
              <ListChecks className="size-3" />
            ) : cmd.key === "checklist" ? (
              <CheckSquare className="size-3" />
            ) : null}
            {cmd.label}
          </Button>
        ))}
      </div>

      {/* AI result */}
      {aiResult && (
        <div className="mt-4 rounded-2xl border border-ai/30 bg-[color-mix(in_oklab,var(--ai)_5%,var(--card))] p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ai-deep">
              <Sparkles className="size-3.5" />
              OCIVO
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => setAiResult(null)}
            >
              Close
            </Button>
          </div>
          <Markdown
            content={aiResult.answer}
            className="mt-2 text-foreground/90"
          />
          {aiResult.proposal && (
            <ProposalPreview
              proposal={aiResult.proposal}
              busy={confirming}
              onConfirm={(p) => void confirmProposal(p)}
              onDismiss={() => setAiResult(null)}
            />
          )}
        </div>
      )}

      {/* Editor / preview */}
      <div className="mt-4">
        {view === "write" ? (
          <textarea
            ref={areaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              scheduleSave(e.target.value);
            }}
            placeholder="Start writing… Markdown works: # heading, **bold**, - list, - [ ] task, > quote"
            className={cn(
              "min-h-[55vh] w-full resize-y rounded-2xl border border-border/70 bg-card p-5",
              "text-sm leading-relaxed outline-none focus:border-primary/40",
              "placeholder:text-muted-foreground/50",
            )}
            spellCheck
          />
        ) : (
          <div className="min-h-[55vh] rounded-2xl border border-border/70 bg-card p-6">
            {content.trim() ? (
              <Markdown content={content} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing to preview yet.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="mt-2 text-right text-xs text-muted-foreground">
        Saved automatically ·{" "}
        {new Date(doc.updatedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}
