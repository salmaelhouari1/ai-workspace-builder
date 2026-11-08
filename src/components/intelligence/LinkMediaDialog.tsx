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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MediaMetric } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { CalendarDays, Link2, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

export function LinkMediaDialog({
  media,
  onOpenChange,
}: {
  media: MediaMetric | null;
  onOpenChange: (open: boolean) => void;
}) {
  const suggestions = useQuery(
    api.analytics.linkSuggestions,
    media
      ? { mediaId: media.id as Id<"analyticsMedia"> }
      : "skip",
  );
  const linkMedia = useMutation(api.analytics.linkMedia);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const link = async (entryId: string) => {
    if (!media || linkingId) return;
    setLinkingId(entryId);
    try {
      await linkMedia({
        mediaId: media.id as Id<"analyticsMedia">,
        marketingEntryId: entryId as Id<"marketingEntries">,
      });
      toast.success("Content linked", {
        description:
          "The planner entry and measured Instagram post now share one record.",
      });
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not link that content", {
        description:
          error instanceof Error
            ? error.message.replace(/^.*Error:\s*/, "")
            : "Try again shortly.",
      });
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={media !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link published content</DialogTitle>
          <DialogDescription>
            Choose the Marketing Planner entry this Instagram post came from.
            Suggestions use caption words and publish dates; nothing is linked
            until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/70 bg-muted/40 px-3.5 py-3">
          <p className="line-clamp-2 text-[12px] font-medium">
            {media?.caption?.trim() || "Untitled Instagram post"}
          </p>
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            {media
              ? new Date(media.timestamp).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : ""}
            {media?.mediaProductType
              ? ` · ${media.mediaProductType.toLowerCase()}`
              : ""}
          </p>
        </div>

        <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
          {suggestions === undefined ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Finding planner entries…
            </div>
          ) : suggestions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 px-4 py-7 text-center">
              <Search className="mx-auto size-4 text-muted-foreground" />
              <p className="mt-2 text-[12.5px] font-medium">
                No unlinked Instagram planner entries
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Mark a planner item as published, or create one from the
                Marketing Planner, then return here.
              </p>
            </div>
          ) : (
            suggestions.map((entry) => (
              <button
                key={entry.id}
                type="button"
                disabled={linkingId !== null}
                onClick={() => void link(entry.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 text-left transition-colors hover:border-primary/35 hover:bg-accent/30 disabled:opacity-60",
                  entry.score > 0.25 && "border-primary/25",
                )}
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {linkingId === entry.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Link2 className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium">
                      {entry.title}
                    </span>
                    {entry.score > 0.25 && (
                      <Badge variant="secondary" className="text-[9px]">
                        Suggested
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                    {entry.reason}
                    {entry.scheduledAt
                      ? ` · planned ${new Date(entry.scheduledAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                      : ""}
                  </span>
                </span>
                <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
