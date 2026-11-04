import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/Markdown";
import { ProposalPreview } from "@/components/ProposalPreview";
import { api } from "@/convex/_generated/api";
import type { Proposal } from "@/convex/assistant";
import { cn } from "@/lib/utils";
import { ArrowUp, Loader2, Plus, Sparkles, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

const SUGGESTIONS = [
  "What should I work on today?",
  "Show me my overdue tasks.",
  "Summarize my current projects.",
  "What are my priorities this week?",
  "Create a launch plan for my product.",
  "Plan next week's content — 3 posts and an email newsletter.",
  "Turn these notes into tasks: call the supplier, draft next week's content, follow up with Ana.",
];

export default function Assistant() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const thread = useQuery(api.conversations.latest);
  const chat = useAction(api.assistant.chat);
  const startNew = useMutation(api.conversations.startNew);
  const applyProposal = useMutation(api.proposals.apply);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<Proposal | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [offline, setOffline] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  const messages = thread?.messages ?? [];

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput("");
    setPendingProposal(null);
    try {
      const result = await chat({
        question: q,
        conversationId: thread?.conversation._id,
      });
      setPendingProposal(result.proposal);
      setOffline(result.source === "offline");
    } catch (err) {
      console.error(err);
      toast.error("The assistant is unavailable right now");
      setInput(q);
    } finally {
      setBusy(false);
    }
  };

  // Pre-filled question from the command bar: /app/ai?q=…
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !autoSent.current && !busy) {
      autoSent.current = true;
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy, pendingProposal]);

  const confirmProposal = async (proposal: Proposal) => {
    setConfirming(true);
    try {
      const result = await applyProposal({ proposal } as never);
      toast.success(result.summary ?? "Done");
      setPendingProposal(null);
      if ("route" in result && result.route) navigate(result.route);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't apply the change");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur md:px-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-xl tracking-tight">
            <Sparkles className="size-4 text-ai-deep" />
            AI Assistant
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Reads your workspace — answers with your real data
            {offline && (
              <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground/80">
                <WifiOff className="size-3" /> offline answers
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => {
            setPendingProposal(null);
            void startNew({});
          }}
        >
          <Plus className="size-3.5" />
          New chat
        </Button>
      </header>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
          {messages.length === 0 && !busy && (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </span>
              <h2 className="mt-4 font-display text-2xl tracking-tight">
                Ask anything about your work
              </h2>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                OCIVO answers from your actual tasks, projects, goals and
                content plan — and prepares changes for you to confirm.
              </p>
              <div className="mt-6 flex w-full max-w-lg flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-xl border border-border/70 bg-card px-4 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-5">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message._id} className="flex justify-end">
                  <div className="max-w-[85%] break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={message._id} className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ai/15 text-ai-deep">
                    <Sparkles className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Markdown
                      content={message.content}
                      className="text-[13.5px] text-foreground/90"
                    />
                    {message.references && message.references.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {message.references.map((ref, i) => (
                          <button
                            key={`${ref.route}-${i}`}
                            onClick={() => navigate(ref.route)}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
                          >
                            {ref.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}

            {busy && (
              <div className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ai/15 text-ai-deep">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="flex items-center gap-1.5 rounded-2xl border border-border/70 bg-card px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-bounce rounded-full bg-ai"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {pendingProposal && !busy && (
              <div className="pl-10">
                <ProposalPreview
                  proposal={pendingProposal}
                  busy={confirming}
                  onConfirm={(p) => void confirmProposal(p)}
                  onDismiss={() => setPendingProposal(null)}
                />
              </div>
            )}
          </div>

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border/70 bg-background/85 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border/80 bg-card px-3 py-2 shadow-sm focus-within:border-primary/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Ask OCIVO… (Enter to send, Shift+Enter for a new line)"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
          <Button
            size="icon"
            className={cn("size-8 shrink-0 rounded-xl", busy && "opacity-60")}
            disabled={busy || !input.trim()}
            onClick={() => void send(input)}
            aria-label="Send"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted-foreground">
          OCIVO only changes things after you press Confirm.
        </p>
      </div>
    </div>
  );
}
