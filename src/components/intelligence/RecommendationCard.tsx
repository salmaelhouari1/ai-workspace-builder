import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  CalendarPlus,
  Lightbulb,
  ListTodo,
  Megaphone,
  MessageCircle,
  X,
} from "lucide-react";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export interface RecommendationView {
  _id: string;
  title: string;
  explanation: string;
  evidence: Array<{ label: string; value: string }>;
  confidence: "low" | "medium" | "high";
  suggestedAction: string;
  potentialBenefit: string;
  status: "new" | "saved" | "dismissed" | "actioned";
  actionRoute?: string | null;
  periodKey: string;
}

const confidenceStyle = {
  high: "border-primary/25 bg-primary/8 text-primary",
  medium: "border-ai/40 bg-ai/15 text-ai-deep",
  low: "border-border bg-muted/60 text-muted-foreground",
} as const;

export function RecommendationCard({
  recommendation,
}: {
  recommendation: RecommendationView;
}) {
  const navigate = useNavigate();
  const act = useMutation(api.recommendations.act);
  const setStatus = useMutation(api.recommendations.setStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const done = recommendation.status === "actioned";
  const dismissed = recommendation.status === "dismissed";

  const runAction = async (
    action: "createTask" | "addToPlanner" | "createCampaign",
  ) => {
    if (busy) return;
    setBusy(action);
    try {
      const result = await act({
        recommendationId: recommendation._id as never,
        action,
      });
      toast.success("Added to your workspace", {
        description:
          action === "createTask"
            ? "A task was created in the existing task system."
            : action === "addToPlanner"
              ? "The recommendation is now an idea in the Marketing Planner."
              : "A campaign and starter idea were created in the Marketing Planner.",
      });
      if ("route" in result && result.route) navigate(result.route);
    } catch (error) {
      toast.error("Could not apply the recommendation", {
        description:
          error instanceof Error
            ? error.message.replace(/^.*Error:\s*/, "")
            : "Try again shortly.",
      });
    } finally {
      setBusy(null);
    }
  };

  const updateStatus = async (status: "new" | "saved" | "dismissed") => {
    if (busy) return;
    setBusy(status);
    try {
      await setStatus({
        recommendationId: recommendation._id as never,
        status,
      });
    } catch (error) {
      toast.error("Could not update the recommendation", {
        description:
          error instanceof Error
            ? error.message.replace(/^.*Error:\s*/, "")
            : "Try again shortly.",
      });
    } finally {
      setBusy(null);
    }
  };

  const ask = () => {
    const question = `Explain this recommendation and the evidence behind it: "${recommendation.title}". ${recommendation.explanation}`;
    navigate(`/app/ai?q=${encodeURIComponent(question)}`);
  };

  return (
    <article
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-4 transition-opacity",
        (done || dismissed) && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-ai/20 text-ai-deep">
          <Lightbulb className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-[13px] font-semibold leading-snug">
              {recommendation.title}
            </h3>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn("text-[9.5px] capitalize", confidenceStyle[recommendation.confidence])}
              >
                {recommendation.confidence} confidence
              </Badge>
              {done && (
                <Badge variant="secondary" className="text-[9.5px]">
                  Actioned
                </Badge>
              )}
              {dismissed && (
                <Badge variant="secondary" className="text-[9.5px]">
                  Dismissed
                </Badge>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {recommendation.explanation}
          </p>

          <div className="mt-3 rounded-xl border border-border/60 bg-background/35 px-3 py-2.5">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Evidence
            </p>
            <ul className="mt-1.5 space-y-1">
              {recommendation.evidence.map((item, index) => (
                <li
                  key={`${item.label}-${index}`}
                  className="flex justify-between gap-3 text-[11px]"
                >
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-right font-medium">{item.value}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-3 text-[11.5px] leading-relaxed">
            <span className="font-medium text-foreground">Suggested action:</span>{" "}
            <span className="text-muted-foreground">
              {recommendation.suggestedAction}
            </span>
          </p>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground/80">
            <span className="font-medium uppercase tracking-[0.08em]">
              Hypothesis:
            </span>{" "}
            {recommendation.potentialBenefit}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {done && recommendation.actionRoute ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[10.5px]"
                onClick={() => navigate(recommendation.actionRoute!)}
              >
                Open in workspace
                <ArrowUpRight className="size-3" />
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  className="h-7 gap-1 px-2 text-[10.5px]"
                  disabled={busy !== null}
                  onClick={() => void runAction("createTask")}
                >
                  <ListTodo className="size-3" />
                  Create task
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-[10.5px]"
                  disabled={busy !== null}
                  onClick={() => void runAction("addToPlanner")}
                >
                  <CalendarPlus className="size-3" />
                  Add to planner
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-[10.5px]"
                  disabled={busy !== null}
                  onClick={() => void runAction("createCampaign")}
                >
                  <Megaphone className="size-3" />
                  Create campaign
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[10.5px] text-muted-foreground"
              onClick={ask}
            >
              <MessageCircle className="size-3" />
              Ask OCIVO
            </Button>
            {!done && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-[10.5px] text-muted-foreground"
                  disabled={busy !== null}
                  onClick={() =>
                    void updateStatus(
                      recommendation.status === "saved" ? "new" : "saved",
                    )
                  }
                >
                  {recommendation.status === "saved" ? (
                    <BookmarkCheck className="size-3" />
                  ) : (
                    <Bookmark className="size-3" />
                  )}
                  {recommendation.status === "saved" ? "Saved" : "Save"}
                </Button>
                {recommendation.status === "dismissed" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-[10.5px] text-muted-foreground"
                    disabled={busy !== null}
                    onClick={() => void updateStatus("new")}
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-[10.5px] text-muted-foreground"
                    disabled={busy !== null}
                    onClick={() => void updateStatus("dismissed")}
                  >
                    <X className="size-3" />
                    Dismiss
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
