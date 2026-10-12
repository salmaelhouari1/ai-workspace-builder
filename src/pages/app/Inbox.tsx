import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { InboxEntry } from "@/lib/inbox";
import { relativeDayLabel } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import {
  Archive,
  Check,
  Inbox as InboxIcon,
  Link2,
  Loader2,
  Lightbulb,
  ListChecks,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

const KIND_META = {
  task: { label: "Task", icon: ListChecks, style: "bg-primary/12 text-primary" },
  note: { label: "Note", icon: StickyNote, style: "bg-muted text-muted-foreground" },
  link: { label: "Link", icon: Link2, style: "bg-moss/10 text-moss" },
  idea: { label: "Idea", icon: Lightbulb, style: "bg-ai/15 text-ai-deep" },
} as const;

interface ReviewState {
  itemId: string;
  raw: string;
  entries: (InboxEntry & { include: boolean; title: string })[];
  source: "ai" | "offline";
}

export default function InboxPage() {
  const items = useQuery(api.inbox.list);
  const addRaw = useMutation(api.inbox.add);
  const processInbox = useMutation(api.inbox.process);
  const dismissInbox = useMutation(api.inbox.dismiss);
  const parseInbox = useAction(api.assistant.parseInbox);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [tab, setTab] = useState<"pending" | "saved">("pending");

  const startReview = async (raw: string, existingItemId?: string) => {
    setBusy(true);
    try {
      const itemId = existingItemId ?? (await addRaw({ raw }));
      const parsed = await parseInbox({ text: raw });
      setReview({
        itemId,
        raw,
        entries: parsed.items.map((entry) => ({
          ...entry,
          include: entry.include ?? true,
          title: entry.title,
        })),
        source: parsed.source,
      });
      if (!existingItemId) setText("");
      setTab("pending");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't read that note");
    } finally {
      setBusy(false);
    }
  };

  const saveReview = async () => {
    if (!review) return;
    const selected = review.entries.filter((e) => e.include);
    if (!selected.length) {
      toast("Nothing selected");
      return;
    }
    try {
      const result = await processInbox({
        itemId: review.itemId as never,
        entries: review.entries.map((e) => ({
          kind: e.kind,
          title: e.title,
          detail: e.detail,
          dueDate: e.dueDate,
          url: e.url,
          include: e.include,
        })),
      });
      toast.success(
        `Saved ${result.createdTasks} task${result.createdTasks === 1 ? "" : "s"} and ${result.createdNotes} note${result.createdNotes === 1 ? "" : "s"}`,
      );
      setReview(null);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save the entries");
    }
  };

  const pending = items?.filter((i) => i.status === "pending") ?? [];
  const saved = items?.filter((i) => i.status === "saved") ?? [];
  const showPending = tab === "pending";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-12 pt-8 md:px-8">
      <header>
        <h1 className="font-display text-3xl tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dump notes, links, meeting minutes — OCIVO sorts them into tasks and
          notes. You review before anything is saved.
        </p>
      </header>

      {/* Composer */}
      <div className="mt-6 rounded-2xl border border-border/70 bg-card p-3 shadow-sm focus-within:border-primary/40">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={
            "Need to contact Sarah about the website, send the proposal Friday,\nand remember that she wants a dark green design."
          }
          className="w-full resize-none bg-transparent px-1 py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-1 pt-2.5">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-ai-deep" />
            {review ? "Finish your current review below" : "Nothing is saved until you confirm"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!text.trim() || busy}
              onClick={() =>
                void addRaw({ raw: text.trim() }).then(() => {
                  setText("");
                  setTab("pending");
                  toast.success("Added to inbox");
                })
              }
            >
              Just save
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!text.trim() || busy}
              onClick={() => void startReview(text.trim())}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Let OCIVO sort it
            </Button>
          </div>
        </div>
      </div>

      {/* Review panel */}
      {review && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-ai/35 bg-[color-mix(in_oklab,var(--ai)_5%,var(--card))]">
          <div className="flex items-center justify-between gap-2 border-b border-ai/20 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Review before saving</p>
              <p className="truncate text-xs text-muted-foreground">
                {review.source === "ai"
                  ? "OCIVO found this in your note"
                  : "Sorted offline — check it over"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              onClick={() => setReview(null)}
              aria-label="Close review"
            >
              <X className="size-4" />
            </Button>
          </div>

          <ul className="divide-y divide-border/50">
            {review.entries.map((entry, index) => {
              const meta = KIND_META[entry.kind];
              const Icon = meta.icon;
              return (
                <li key={`${entry.title}-${index}`} className="flex items-start gap-3 px-4 py-3">
                  <Checkbox
                    checked={entry.include}
                    onCheckedChange={(checked) =>
                      setReview((prev) =>
                        prev
                          ? {
                              ...prev,
                              entries: prev.entries.map((e, i) =>
                                i === index ? { ...e, include: checked === true } : e,
                              ),
                            }
                          : prev,
                      )
                    }
                    className="mt-1.5"
                  />
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                      meta.style,
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Input
                      value={entry.title}
                      onChange={(e) =>
                        setReview((prev) =>
                          prev
                            ? {
                                ...prev,
                                entries: prev.entries.map((x, i) =>
                                  i === index ? { ...x, title: e.target.value } : x,
                                ),
                              }
                            : prev,
                        )
                      }
                      className="h-7 border-transparent bg-transparent px-1 text-sm font-medium shadow-none hover:border-input focus-visible:border-input"
                    />
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
                      <Badge className={cn("border-0 text-[10px] font-semibold uppercase tracking-wide", meta.style)}>
                        {meta.label}
                      </Badge>
                      {entry.dueDate !== undefined && (
                        <span className="flex items-center gap-1">
                          <Check className="size-3" />
                          {relativeDayLabel(entry.dueDate)}
                        </span>
                      )}
                      {entry.url && (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate underline decoration-dotted"
                        >
                          {entry.url}
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-2 border-t border-ai/20 px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {review.entries.filter((e) => e.include).length} of {review.entries.length} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void dismissInbox({ itemId: review.itemId as never }).then(() => setReview(null))
                }
              >
                Discard
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => void saveReview()}>
                <Check className="size-3.5" />
                Save selected
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lists */}
      <div className="mt-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "saved")}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-1.5">
              Needs review
              {pending.length > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {pending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="saved">Sorted</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-3 space-y-3">
          {items === undefined ? (
            <>
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </>
          ) : showPending ? (
            pending.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <InboxIcon className="size-5" />
                </span>
                <p className="font-medium">Your inbox is clear</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Paste anything above — meeting notes, a random idea, a link —
                  and let OCIVO turn it into structure.
                </p>
              </div>
            ) : (
              pending.map((item) => (
                <div
                  key={item._id}
                  className="rounded-2xl border border-border/70 bg-card p-4"
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.raw}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-muted-foreground"
                        onClick={() =>
                          void dismissInbox({ itemId: item._id }).then(() =>
                            toast.success("Dismissed"),
                          )
                        }
                      >
                        <Archive className="mr-1.5 size-3.5" />
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={busy}
                        onClick={() => void startReview(item.raw, item._id)}
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        Review
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : saved.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              Nothing sorted yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/70 bg-card">
              {saved.map((item) => (
                <li key={item._id} className="px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm">{item.raw}</p>
                  {item.detail && (
                    <p className="mt-1.5 text-xs text-muted-foreground">{item.detail}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
