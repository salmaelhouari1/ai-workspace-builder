import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/components/Markdown";
import { InstagramConnection } from "@/components/InstagramConnection";
import { LinkMediaDialog } from "@/components/intelligence/LinkMediaDialog";
import {
  RecommendationCard,
  type RecommendationView,
} from "@/components/intelligence/RecommendationCard";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  engagementRate,
  formatChangePercent,
  formatDateTime,
  formatMetric,
  percentChange,
  type FormatSummary,
  type MediaMetric,
  type MetricChange,
  type PeriodKey,
} from "@/lib/analytics";
import {
  INTELLIGENCE_SOURCES,
} from "@/lib/intelligence";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  CalendarRange,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Eye,
  Heart,
  Instagram,
  Lightbulb,
  Linkedin,
  LockKeyhole,
  Music2,
  PlugZap,
  RefreshCw,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ease = [0.22, 1, 0.36, 1] as const;

const PERIODS: Array<{ id: PeriodKey; label: string }> = [
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
];

type ReportRow = {
  _id: string;
  title: string;
  reportType: "weekly" | "monthly" | "content" | "audience" | "improvement";
  periodStart: number;
  periodEnd: number;
  dataFreshnessAt: number;
  snapshotHash: string;
  content: string;
  source: "ai" | "deterministic";
  createdAt: number;
};

type ReportType = ReportRow["reportType"];

const REPORT_TYPES: Array<{
  type: ReportType;
  title: string;
  description: string;
  period: "7d" | "30d" | "content";
}> = [
  {
    type: "weekly",
    title: "Weekly review",
    description: "What changed, what the evidence supports and what to test next.",
    period: "7d",
  },
  {
    type: "monthly",
    title: "Monthly report",
    description: "A longer view with period-over-period context and content patterns.",
    period: "30d",
  },
  {
    type: "content",
    title: "Content report",
    description: "Formats, best and weakest posts, reach and interaction evidence.",
    period: "content",
  },
  {
    type: "audience",
    title: "Audience report",
    description: "Follower history, follows and unfollows, and available demographics.",
    period: "content",
  },
  {
    type: "improvement",
    title: "Improvement plan",
    description: "Evidence-backed opportunities and practical next experiments.",
    period: "content",
  },
];

function Panel({
  title,
  description,
  icon,
  action,
  children,
  className,
  tone = "default",
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "ai";
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        tone === "ai"
          ? "border-ai/30 bg-[color-mix(in_oklab,var(--ai)_5%,var(--card))]"
          : "border-border/70",
        className,
      )}
    >
      <header className="flex items-start gap-2.5 border-b border-border/50 px-5 py-3.5">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
            tone === "ai"
              ? "bg-ai/20 text-ai-deep"
              : "bg-primary/8 text-foreground/80",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  change,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  change?: MetricChange;
  description: string;
  icon: LucideIcon;
}) {
  const percent = change?.percent ?? null;
  return (
    <div
      className="rounded-2xl border border-border/70 bg-card px-4 py-3.5"
      title={description}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2.5 font-display text-[1.75rem] leading-none tracking-tight">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1 text-[10.5px]">
        {percent === null ? (
          <span className="text-muted-foreground/70">No comparison</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              percent >= 0 ? "text-primary" : "text-destructive",
            )}
          >
            {percent >= 0 ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {formatChangePercent(percent)}
          </span>
        )}
        {percent !== null && (
          <span className="text-muted-foreground/70">vs previous period</span>
        )}
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
        {description}
      </p>
    </div>
  );
}

function ChartEmpty({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
}) {
  return (
    <div className="relative flex h-[210px] flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border/80 px-5 text-center">
      <div aria-hidden className="absolute inset-x-0 top-1/4 h-px bg-border/40" />
      <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border/40" />
      <div aria-hidden className="absolute inset-x-0 top-3/4 h-px bg-border/40" />
      <Icon className="relative size-5 text-muted-foreground" />
      <p className="relative mt-2 text-sm font-medium">{title}</p>
      <p className="relative mt-1 max-w-sm text-[11.5px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function TrendChart({
  data,
  label,
  color,
  gradientId,
}: {
  data: Array<{ date: string; value: number | null }>;
  label: string;
  color: string;
  gradientId: string;
}) {
  const measured = data.filter((point) => point.value !== null);
  if (!measured.length) {
    return (
      <ChartEmpty
        icon={ChartNoAxesCombined}
        title={`${label} is not available`}
        body="This chart stays empty until the API returns measured values for the selected period. Missing data is never drawn as zero."
      />
    );
  }
  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 11,
              color: "var(--foreground)",
            }}
            formatter={(value) => [formatMetric(Number(value)), label]}
            labelFormatter={(value) => String(value)}
          />
          <Area
            type="monotone"
            dataKey="value"
            name={label}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            connectNulls={false}
            dot={false}
            isAnimationActive
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatMediaDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MediaRow({
  item,
  onLink,
  onUnlink,
  linked,
}: {
  item: MediaMetric;
  onLink?: (item: MediaMetric) => void;
  onUnlink?: (linkId: string) => void;
  linked?: { id: string };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/35 px-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <Instagram className="size-4" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[12px] font-medium">
            {item.caption?.trim() || "Untitled Instagram post"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span>{formatMediaDate(item.timestamp)}</span>
            <span>·</span>
            <span>{item.mediaProductType ?? item.mediaType}</span>
            {item.permalink && (
              <>
                <span>·</span>
                <a
                  href={item.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-border underline-offset-2 hover:text-foreground"
                >
                  open post
                </a>
              </>
            )}
          </p>
          {item.marketingEntryTitle && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/8 px-2 py-0.5 text-[9.5px] font-medium text-primary">
              <CheckCircle2 className="size-2.5" />
              {item.marketingEntryTitle}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center sm:w-[250px]">
        {[
          ["Reach", item.reach],
          ["Views", item.views],
          ["Saves", item.saves],
          ["Inter.", item.interactions],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70">
              {label}
            </p>
            <p className="mt-0.5 text-[11px] font-medium">
              {formatMetric(value as number | null)}
            </p>
          </div>
        ))}
      </div>
      {onLink && (
        <div className="flex shrink-0 gap-1.5">
          {linked ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10.5px] text-muted-foreground"
              onClick={() => onUnlink?.(linked.id)}
            >
              Unlink
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10.5px]"
              onClick={() => onLink(item)}
            >
              Link
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FormatBars({ formats }: { formats: FormatSummary[] }) {
  const max = Math.max(
    ...formats.map((format) => format.avgReach ?? 0),
    1,
  );
  if (!formats.length) {
    return (
      <p className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-[12px] text-muted-foreground">
        No measured content formats in this period.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {formats.map((format) => (
        <div key={format.key}>
          <div className="flex items-center justify-between gap-3 text-[11.5px]">
            <span className="font-medium">{format.label}</span>
            <span className="text-muted-foreground">
              avg reach {formatMetric(format.avgReach)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--chart-2)]"
              style={{
                width: `${Math.max(
                  format.avgReach === null ? 0 : (format.avgReach / max) * 100,
                  2,
                )}%`,
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {format.count} post{format.count === 1 ? "" : "s"} · avg interactions{" "}
            {formatMetric(format.avgInteractions)} · engagement/reach{" "}
            {format.engagementRate === null
              ? "Unavailable"
              : `${format.engagementRate.toFixed(1)}%`}
          </p>
        </div>
      ))}
    </div>
  );
}

function InsightCard({
  insight,
}: {
  insight: {
    title: string;
    body: string;
    evidence: string;
    kind: string;
  };
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3.5 py-3">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-ai-deep" />
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium leading-snug">{insight.body}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            {insight.evidence}
          </p>
          <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60">
            {insight.kind}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Intelligence() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const data = useQuery(api.analytics.dashboard, { period });
  const generateReport = useAction(api.reports.generate);
  const refreshRecommendations = useMutation(api.recommendations.refresh);
  const unlinkMedia = useMutation(api.analytics.unlinkMedia);
  const [generating, setGenerating] = useState<ReportType | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportRow | null>(null);
  const [linkTarget, setLinkTarget] = useState<MediaMetric | null>(null);
  const [tab, setTab] = useState("overview");
  const [refreshPending, setRefreshPending] = useState(false);
  const [unlinkPending, setUnlinkPending] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full" />
        <Skeleton className="mt-6 h-28 rounded-2xl" />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-40 rounded-2xl" />
          ))}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (data === null) return null;

  const snapshot = data.snapshot;
  const connection = data.connection;
  const isHistorical =
    connection !== null &&
    connection.status !== "connected" &&
    snapshot !== null &&
    (snapshot.period.metrics.reach !== null ||
      snapshot.period.metrics.followers !== null ||
      snapshot.media.total > 0);

  const ask = (question: string) =>
    navigate(`/app/ai?q=${encodeURIComponent(question)}`);

  const runReport = async (type: ReportType) => {
    if (generating) return;
    const card = REPORT_TYPES.find((item) => item.type === type);
    const reportPeriod: PeriodKey =
      card?.period === "7d" ? "7d" : card?.period === "30d" ? "30d" : period;
    setGenerating(type);
    try {
      const result = await generateReport({
        period: reportPeriod,
        reportType: type,
      });
      toast.success(
        result.cached ? "Cached report reopened" : "Report generated",
        {
          description:
            result.source === "ai"
              ? "OCIVO used the calculated snapshot and kept the evidence with the report."
              : "The AI gateway was unavailable, so a deterministic report was generated from the same real metrics.",
        },
      );
    } catch (error) {
      toast.error("Could not generate the report", {
        description:
          error instanceof Error
            ? error.message.replace(/^.*Error:\s*/, "")
            : "Sync real data first, then try again.",
      });
    } finally {
      setGenerating(null);
    }
  };

  const refreshRecs = async () => {
    if (refreshPending) return;
    setRefreshPending(true);
    try {
      const result = await refreshRecommendations({ period });
      toast.success("Recommendations refreshed", {
        description: `${result.total} evidence-backed recommendation${result.total === 1 ? "" : "s"} reviewed.`,
      });
    } catch (error) {
      toast.error("Could not refresh recommendations", {
        description:
          error instanceof Error
            ? error.message.replace(/^.*Error:\s*/, "")
            : "Try again shortly.",
      });
    } finally {
      setRefreshPending(false);
    }
  };

  const unlink = async (linkId: string) => {
    if (unlinkPending) return;
    setUnlinkPending(linkId);
    try {
      await unlinkMedia({ linkId: linkId as Id<"analyticsContentLinks"> });
      toast.success("Content unlinked");
    } catch {
      toast.error("Could not unlink that content");
    } finally {
      setUnlinkPending(null);
    }
  };

  const changes = snapshot?.period.changes;
  const metrics = snapshot?.period.metrics;
  const previous = snapshot?.period.previous;
  const currentRate = metrics
    ? engagementRate(metrics.interactions, metrics.reach)
    : null;
  const previousRate = previous
    ? engagementRate(previous.interactions, previous.reach)
    : null;
  const rateChange = percentChange(currentRate, previousRate);
  const linkByMedia = new Map<string, { id: string }>();
  for (const link of data.linkedEntries ?? []) {
    linkByMedia.set(link.mediaId as string, { id: link.id as string });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-6 md:px-8 md:pt-9">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Intelligence
            </p>
            <Badge variant="outline" className="gap-1 text-[10.5px]">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  connection?.status === "connected"
                    ? "bg-primary"
                    : connection?.status === "needsReauth"
                      ? "bg-ai-deep"
                      : "bg-muted-foreground/50",
                )}
              />
              {connection?.status === "connected"
                ? "Live source"
                : connection?.status === "needsReauth"
                  ? "Reconnect needed"
                  : isHistorical
                    ? "Historical data"
                    : "Not connected"}
            </Badge>
            {connection?.status === "connected" && (
              <span className="text-[10.5px] text-muted-foreground">
                Last sync {formatDateTime(connection.lastSyncedAt)}
              </span>
            )}
          </div>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight md:text-[2.35rem] md:leading-tight">
            Marketing intelligence
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground md:text-[15px]">
            Real performance from your channels, read against your business
            context. OCIVO separates measured facts from hypotheses and never
            fills a gap with a sample number.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border border-border/80 bg-card/60 p-0.5"
            aria-label="Analysis period"
          >
            {PERIODS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={period === option.id}
                onClick={() => setPeriod(option.id)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  period === option.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              ask(
                "Review my latest Instagram analytics. What does the data actually support, what is a hypothesis, and what should I do next?",
              )
            }
          >
            <Sparkles className="size-3.5" />
            Ask OCIVO
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground"
            onClick={() => navigate("/app/settings#integrations")}
          >
            <PlugZap className="size-3.5" />
            Manage
          </Button>
        </div>
      </motion.header>

      {!connection && (
        <div className="mt-5 space-y-5">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05, ease }}
            className="relative overflow-hidden rounded-2xl border border-ai/30 bg-[color-mix(in_oklab,var(--ai)_6%,var(--card))] p-5 md:p-7"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full border border-ai/25"
            />
            <div className="relative max-w-2xl">
              <span className="flex size-10 items-center justify-center rounded-xl bg-ai/25 text-ai-deep">
                <Database className="size-4" />
              </span>
              <h2 className="mt-3 font-display text-2xl tracking-tight">
                Connect a real source first
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                The Intelligence workspace stays empty until an Instagram
                professional account is connected. OCIVO does not estimate
                reach, engagement or growth, and it never presents sample
                analytics as business data.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {[
                  ["1", "Connect", "Official, read-only Instagram access."],
                  ["2", "Collect", "Real account, media and audience insights."],
                  ["3", "Understand", "Evidence-backed analysis and next actions."],
                ].map(([step, title, body]) => (
                  <div
                    key={step}
                    className="rounded-xl border border-border/60 bg-background/35 px-3 py-2.5"
                  >
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ai-deep">
                      {step} · {title}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          <InstagramConnection />

          <Panel
            title="Built for more than Instagram"
            description="One normalized engine, more channels over time"
            icon={<PlugZap className="size-4" />}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {INTELLIGENCE_SOURCES.map((source) => {
                const Icon =
                  source.id === "linkedin"
                    ? Linkedin
                    : source.id === "tiktok"
                      ? Music2
                      : Instagram;
                return (
                  <div
                    key={source.id}
                    className="rounded-xl border border-border/60 bg-background/35 px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[12px] font-medium">
                        <Icon className="size-3.5 text-muted-foreground" />
                        {source.label}
                      </span>
                      <span className="text-[9.5px] text-muted-foreground">
                        {source.availability === "available"
                          ? "Available"
                          : "Planned"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                      {source.description}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground/80">
              LinkedIn and TikTok only need a provider adapter returning the same
              normalized metrics. Reports, recommendations and the planner
              connection stay shared.
            </p>
          </Panel>
        </div>
      )}

      {connection && snapshot && (
        <>
          {connection.status !== "connected" && (
            <Alert className="mt-5 bg-ai/10">
              <AlertCircle className="size-4" />
              <AlertTitle className="text-[12.5px]">
                {isHistorical
                  ? "Showing stored historical data"
                  : "Instagram needs attention"}
              </AlertTitle>
              <AlertDescription className="text-[11.5px]">
                {connection.statusMessage ??
                  "Reconnect Instagram to resume collection. Existing analytics remain available until you delete them."}
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={tab} onValueChange={setTab} className="mt-5">
            <div className="max-w-full overflow-x-auto pb-0.5">
              <TabsList className="w-max">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="audience">Audience</TabsTrigger>
                <TabsTrigger value="reports">Reports</TabsTrigger>
              </TabsList>
            </div>

            {/* ---------------- Overview ---------------- */}
            <TabsContent value="overview" className="mt-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <KpiCard
                  label="Followers"
                  value={formatMetric(metrics?.followers ?? null)}
                  change={changes?.followers}
                  description="Current total reported by Instagram. Historical values are collected from the first sync onward."
                  icon={Users}
                />
                <KpiCard
                  label="Reach"
                  value={formatMetric(metrics?.reach ?? null)}
                  change={changes?.reach}
                  description="Unique accounts reached in the selected range. Daily unique reach is never summed."
                  icon={ChartNoAxesCombined}
                />
                <KpiCard
                  label="Views"
                  value={formatMetric(metrics?.views ?? null)}
                  change={changes?.views}
                  description="Times content was played or displayed in the selected range."
                  icon={Eye}
                />
                <KpiCard
                  label="Interactions"
                  value={formatMetric(metrics?.interactions ?? null)}
                  change={changes?.interactions}
                  description="Measured likes, comments, saves, shares and replies where available."
                  icon={Heart}
                />
                <KpiCard
                  label="Engagement rate"
                  value={
                    currentRate === null ? "Unavailable" : `${currentRate.toFixed(1)}%`
                  }
                  change={{ absolute: null, percent: rateChange }}
                  description="Interactions divided by reach. Unavailable when either metric is missing."
                  icon={Target}
                />
                <KpiCard
                  label="Content activity"
                  value={formatMetric(metrics?.mediaCount ?? null)}
                  change={changes?.mediaCount}
                  description="Published items measured in the selected period."
                  icon={CalendarRange}
                />
              </div>

              <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <Panel
                    title="Performance over time"
                    description={`${snapshot.period.label} · daily measured values, never filled in`}
                    icon={<ChartNoAxesCombined className="size-4" />}
                    action={
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                        <Clock3 className="size-3" />
                        {formatDateTime(snapshot.connection.dataFreshnessAt)}
                      </span>
                    }
                  >
                    <div className="grid gap-5 lg:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-[11px] font-medium">Reach</p>
                        <TrendChart
                          data={snapshot.daily
                            .filter(
                              (day) =>
                                Date.parse(day.date) >= snapshot.period.start &&
                                Date.parse(day.date) <=
                                  snapshot.period.end + 86_400_000,
                            )
                            .map((day) => ({
                              date: day.date.slice(5),
                              value: day.reach,
                            }))}
                          label="Reach"
                          color="var(--chart-2)"
                          gradientId="reach-fill"
                        />
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-medium">
                          Followers
                        </p>
                        <TrendChart
                          data={snapshot.daily
                            .filter(
                              (day) =>
                                Date.parse(day.date) >= snapshot.period.start &&
                                Date.parse(day.date) <=
                                  snapshot.period.end + 86_400_000,
                            )
                            .map((day) => ({
                              date: day.date.slice(5),
                              value: day.followers,
                            }))}
                          label="Followers"
                          color="var(--chart-3)"
                          gradientId="follower-fill"
                        />
                      </div>
                    </div>
                    {snapshot.dataGaps.length > 0 && (
                      <div className="mt-3 rounded-xl border border-border/60 bg-background/35 px-3.5 py-2.5">
                        <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                          Unavailable in this dataset
                        </p>
                        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                          {snapshot.dataGaps.join(" ")}
                        </p>
                      </div>
                    )}
                  </Panel>

                  <Panel
                    title="Content performance"
                    description="Ranked only among items with measured metrics"
                    icon={<Sparkles className="size-4" />}
                    action={
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-[10.5px]"
                        onClick={() => setTab("content")}
                      >
                        Content tab
                        <ChevronRight className="size-3" />
                      </Button>
                    }
                  >
                    {snapshot.media.top.length ? (
                      <div className="space-y-2">
                        {snapshot.media.top.slice(0, 3).map((item) => (
                          <MediaRow key={item.id} item={item} />
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-[12px] text-muted-foreground">
                        No published content with measured performance in this
                        period.
                      </p>
                    )}
                  </Panel>

                  <Panel
                    title="Recommendations"
                    description="Evidence-backed experiments, not promises"
                    icon={<Lightbulb className="size-4" />}
                    action={
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-[10.5px]"
                        disabled={refreshPending}
                        onClick={() => void refreshRecs()}
                      >
                        <RefreshCw
                          className={cn(
                            "size-3",
                            refreshPending && "animate-spin",
                          )}
                        />
                        Refresh
                      </Button>
                    }
                    tone="ai"
                  >
                    {data.recommendations.length ? (
                      <div className="space-y-2.5">
                        {data.recommendations
                          .filter((item) => item.status !== "dismissed")
                          .slice(0, 3)
                          .map((item) => (
                            <RecommendationCard
                              key={item._id}
                              recommendation={item as RecommendationView}
                            />
                          ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-ai/35 bg-background/30 px-4 py-8 text-center">
                        <Lightbulb className="mx-auto size-5 text-ai-deep" />
                        <p className="mt-2 text-[12.5px] font-medium">
                          No evidence threshold reached yet
                        </p>
                        <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-muted-foreground">
                          OCIVO will not manufacture recommendations from thin
                          data. Sync another period or generate a report to build
                          the evidence base.
                        </p>
                      </div>
                    )}
                  </Panel>
                </div>

                <div className="space-y-5">
                  <InstagramConnection compact />

                  <Panel
                    title="Business context"
                    description="The lens for every metric"
                    icon={<Target className="size-4" />}
                  >
                    <dl className="space-y-3">
                      {[
                        ["Main goal", snapshot.workspace.mainGoal],
                        ["Audience", snapshot.workspace.audience],
                        ["Marketing goals", snapshot.workspace.marketingGoals],
                        ["Priorities", snapshot.workspace.marketingPriorities],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                            {label}
                          </dt>
                          <dd className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-foreground/85">
                            {value || "Not set"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4 h-7 gap-1 px-2 text-[11px]"
                      onClick={() => navigate("/app/business-profile")}
                    >
                      Open business profile
                      <ChevronRight className="size-3" />
                    </Button>
                  </Panel>

                  <Panel
                    title="Recent insights"
                    description="Saved with the report that produced them"
                    icon={<Lightbulb className="size-4" />}
                  >
                    {data.insights.length ? (
                      <div className="space-y-2">
                        {data.insights.slice(0, 4).map((insight) => (
                          <InsightCard key={insight._id} insight={insight} />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/80 px-4 py-6 text-center">
                        <p className="text-[12px] font-medium">
                          No structured insights yet
                        </p>
                        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                          Generate a report to create observations,
                          interpretation and limitations from the current
                          snapshot.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 h-7 px-2 text-[10.5px]"
                          onClick={() => void runReport("weekly")}
                        >
                          Generate weekly report
                        </Button>
                      </div>
                    )}
                  </Panel>

                  <Panel
                    title="You stay in control"
                    icon={<CheckCircle2 className="size-4 text-primary" />}
                  >
                    <ul className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                      <li className="flex gap-2">
                        <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/60" />
                        OCIVO analyzes, suggests and prepares actions.
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/60" />
                        Nothing is published, messaged or changed externally.
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/60" />
                        Every action needs your explicit click or confirmation.
                      </li>
                    </ul>
                  </Panel>
                </div>
              </div>
            </TabsContent>

            {/* ---------------- Content ---------------- */}
            <TabsContent value="content" className="mt-4">
              <div className="grid items-start gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <Panel
                    title="Published content"
                    description={`${snapshot.media.recent.length} recent items measured · ${snapshot.media.unlinked} unlinked`}
                    icon={<Instagram className="size-4" />}
                  >
                    {snapshot.media.recent.length ? (
                      <div className="space-y-2">
                        {snapshot.media.recent.map((item) => (
                          <MediaRow
                            key={item.id}
                            item={item}
                            linked={linkByMedia.get(item.id)}
                            onLink={setLinkTarget}
                            onUnlink={(linkId) => {
                              if (!unlinkPending) void unlink(linkId);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border/80 px-4 py-10 text-center text-[12px] text-muted-foreground">
                        No published media was returned by Instagram yet. Run a
                        sync and check back.
                      </p>
                    )}
                  </Panel>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Panel
                      title="Best performing"
                      description="Measured reach, views or interactions"
                      icon={<ArrowUpRight className="size-4" />}
                    >
                      {snapshot.media.top.length ? (
                        <div className="space-y-2">
                          {snapshot.media.top.map((item) => (
                            <MediaRow key={item.id} item={item} />
                          ))}
                        </div>
                      ) : (
                        <p className="py-8 text-center text-[11.5px] text-muted-foreground">
                          Not enough measured content.
                        </p>
                      )}
                    </Panel>
                    <Panel
                      title="Lowest performing"
                      description="Same measurement, lowest first"
                      icon={<ArrowDownRight className="size-4" />}
                    >
                      {snapshot.media.lowest.length ? (
                        <div className="space-y-2">
                          {snapshot.media.lowest.map((item) => (
                            <MediaRow key={item.id} item={item} />
                          ))}
                        </div>
                      ) : (
                        <p className="py-8 text-center text-[11.5px] text-muted-foreground">
                          Not enough measured content.
                        </p>
                      )}
                    </Panel>
                  </div>
                </div>

                <div className="space-y-5">
                  <Panel
                    title="Format comparison"
                    description="Average reach per measured post"
                    icon={<ChartNoAxesCombined className="size-4" />}
                  >
                    <FormatBars formats={snapshot.media.formats} />
                  </Panel>

                  <Panel
                    title="Why links stay manual"
                    icon={<LockKeyhole className="size-4" />}
                  >
                    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                      Instagram does not return OCIVO planner IDs. A suggestion
                      uses caption similarity and publish date, but no match is
                      confirmed until you choose it. This keeps attribution
                      honest.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4 h-7 gap-1 px-2 text-[11px]"
                      onClick={() => navigate("/app/marketing")}
                    >
                      Open Marketing Planner
                      <ChevronRight className="size-3" />
                    </Button>
                  </Panel>

                  <Panel
                    title="Content data gaps"
                    icon={<AlertCircle className="size-4" />}
                  >
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {snapshot.dataGaps.length
                        ? snapshot.dataGaps.join(" ")
                        : "No required content metric was missing in this dataset."}
                    </p>
                    <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground/75">
                      Album insights are unavailable, story insights expire after
                      24 hours, and media insights can be delayed up to 48 hours.
                    </p>
                  </Panel>
                </div>
              </div>
            </TabsContent>

            {/* ---------------- Audience ---------------- */}
            <TabsContent value="audience" className="mt-4">
              <div className="grid items-start gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <Panel
                    title="Follower growth"
                    description="Real snapshots collected since connection"
                    icon={<Users className="size-4" />}
                  >
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ["Current", metrics?.followers ?? null],
                        ["Net change", metrics?.followerChange ?? null],
                        ["Follows", metrics?.follows ?? null],
                        ["Unfollows", metrics?.unfollows ?? null],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-xl border border-border/60 bg-background/35 px-3 py-2.5"
                        >
                          <p className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
                            {label}
                          </p>
                          <p className="mt-1 font-display text-xl">
                            {formatMetric(value as number | null)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <TrendChart
                        data={snapshot.daily
                          .filter(
                            (day) =>
                              Date.parse(day.date) >= snapshot.period.start &&
                              Date.parse(day.date) <=
                                snapshot.period.end + 86_400_000,
                          )
                          .map((day) => ({
                            date: day.date.slice(5),
                            value: day.followers,
                          }))}
                        label="Followers"
                        color="var(--chart-3)"
                        gradientId="audience-followers"
                      />
                    </div>
                    <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                      Meta withholds follower metrics for accounts under 100
                      followers. OCIVO does not estimate the missing values.
                    </p>
                  </Panel>

                  <div className="grid gap-5 sm:grid-cols-3">
                    {[
                      ["Top countries", snapshot.audience.country],
                      ["Age ranges", snapshot.audience.age],
                      ["Gender", snapshot.audience.gender],
                    ].map(([label, values]) => {
                      const rows = values as Array<{
                        label: string;
                        value: number;
                      }>;
                      return (
                        <Panel
                          key={String(label)}
                          title={String(label)}
                          icon={<Target className="size-4" />}
                        >
                          {rows.length ? (
                            <div className="space-y-2">
                              {rows.slice(0, 6).map((row) => (
                                <div
                                  key={row.label}
                                  className="flex items-center justify-between gap-2 text-[11px]"
                                >
                                  <span className="truncate text-muted-foreground">
                                    {row.label}
                                  </span>
                                  <span className="font-medium">
                                    {formatMetric(row.value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                              Unavailable for this account or timeframe. Meta only
                              returns demographics for eligible audiences.
                            </p>
                          )}
                        </Panel>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-5">
                  <Panel
                    title="Audience activity"
                    description="Only when Meta supplies it"
                    icon={<Clock3 className="size-4" />}
                  >
                    <div className="rounded-xl border border-dashed border-border/80 px-4 py-6 text-center">
                      <p className="text-[12px] font-medium">
                        Online-follower activity is not in this dataset
                      </p>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                        OCIVO does not estimate it. If the API returns it for this
                        account, it will be labeled with its real timeframe.
                      </p>
                    </div>
                  </Panel>

                  <Panel
                    title="Growth interpretation"
                    description="Facts before narrative"
                    icon={<Lightbulb className="size-4" />}
                    tone="ai"
                  >
                    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                      {metrics?.followerChange === null
                        ? "Follower change is unavailable because the account has no comparable follower history in this range. OCIVO will not infer growth from reach or engagement."
                        : metrics?.followerChange !== undefined &&
                            metrics.followerChange > 0
                          ? "The account gained followers in this period. The data does not show which post or channel caused each follow."
                          : "The account lost followers in this period. The data does not establish why; treat any explanation as a hypothesis."}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4 h-7 gap-1 px-2 text-[11px]"
                      onClick={() =>
                        ask(
                          "How is my audience growing, and what does the data not tell me?",
                        )
                      }
                    >
                      Ask about audience
                      <ArrowUpRight className="size-3" />
                    </Button>
                  </Panel>

                  <Panel
                    title="What Meta withholds"
                    icon={<LockKeyhole className="size-4" />}
                  >
                    <ul className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                      <li>• Demographics only reflect viewers with available data.</li>
                      <li>• Top 45 performers only, not the full audience.</li>
                      <li>• Some metrics need at least 100 followers.</li>
                      <li>• Insights can arrive up to 48 hours late.</li>
                    </ul>
                  </Panel>
                </div>
              </div>
            </TabsContent>

            {/* ---------------- Reports ---------------- */}
            <TabsContent value="reports" className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {REPORT_TYPES.map((report) => (
                  <div
                    key={report.type}
                    className="flex flex-col rounded-2xl border border-border/70 bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[12.5px] font-semibold">
                        {report.title}
                      </h2>
                      <Sparkles className="size-3.5 shrink-0 text-ai-deep" />
                    </div>
                    <p className="mt-2 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                      {report.description}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 h-7 w-full gap-1 px-2 text-[10.5px]"
                      disabled={generating !== null}
                      onClick={() => void runReport(report.type)}
                    >
                      {generating === report.type ? (
                        <RefreshCw className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3" />
                      )}
                      {generating === report.type ? "Generating…" : "Generate"}
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
                <Panel
                  title="Report history"
                  description="Each report keeps its exact snapshot"
                  icon={<Database className="size-4" />}
                  className="lg:col-span-2"
                >
                  {data.reports.length ? (
                    <div className="space-y-2">
                      {data.reports.map((report) => (
                        <button
                          key={report._id}
                          type="button"
                          onClick={() => setSelectedReport(report as ReportRow)}
                          className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-background/35 px-3.5 py-3 text-left transition-colors hover:border-primary/35 hover:bg-accent/30"
                        >
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <ChartNoAxesCombined className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[12px] font-medium">
                                {report.title}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[9px] capitalize"
                              >
                                {report.source === "ai"
                                  ? "AI analysis"
                                  : "Deterministic"}
                              </Badge>
                            </span>
                            <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                              {new Date(report.periodStart).toLocaleDateString()} –{" "}
                              {new Date(report.periodEnd).toLocaleDateString()} ·
                              generated {formatDateTime(report.createdAt)}
                            </span>
                          </span>
                          <ChevronRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/80 px-4 py-10 text-center">
                      <Sparkles className="mx-auto size-5 text-ai-deep" />
                      <p className="mt-2 text-[12.5px] font-medium">
                        No reports generated yet
                      </p>
                      <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-muted-foreground">
                        Reports are stored with a normalized snapshot and hash, so
                        every observation can be traced back to the data that
                        existed when it was written.
                      </p>
                    </div>
                  )}
                </Panel>

                <div className="space-y-5">
                  <Panel
                    title="Data freshness"
                    description="What the next report will use"
                    icon={<Clock3 className="size-4" />}
                  >
                    <dl className="space-y-3 text-[11.5px]">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Last sync</dt>
                        <dd className="text-right font-medium">
                          {formatDateTime(connection.lastSyncedAt)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Period</dt>
                        <dd className="text-right font-medium">
                          {snapshot.period.label}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Sync status</dt>
                        <dd className="text-right font-medium capitalize">
                          {connection.lastSyncStatus ?? "Not run"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Measured media</dt>
                        <dd className="text-right font-medium">
                          {snapshot.media.total}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
                      Meta can delay insights by up to 48 hours. A report never
                      pretends the latest hour is complete.
                    </p>
                  </Panel>

                  <Panel
                    title="Synchronization history"
                    icon={<RefreshCw className="size-4" />}
                  >
                    {data.syncRuns.length ? (
                      <div className="space-y-2">
                        {data.syncRuns.map((run) => (
                          <div
                            key={run.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/35 px-2.5 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-[10.5px] font-medium capitalize">
                                {run.trigger} sync
                              </p>
                              <p className="text-[9.5px] text-muted-foreground">
                                {formatDateTime(run.startedAt)}
                                {run.metricsStored !== null
                                  ? ` · ${run.metricsStored} records`
                                  : ""}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "shrink-0 text-[9px] capitalize",
                                run.status === "success"
                                  ? "border-primary/25 bg-primary/8 text-primary"
                                  : run.status === "running"
                                    ? "border-ai/40 bg-ai/15 text-ai-deep"
                                    : "border-destructive/30 text-destructive",
                              )}
                            >
                              {run.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-center text-[11px] text-muted-foreground">
                        No synchronization has run yet.
                      </p>
                    )}
                    {connection.lastSyncError && (
                      <p className="mt-2 text-[10.5px] leading-relaxed text-destructive">
                        {connection.lastSyncError}
                      </p>
                    )}
                  </Panel>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {connection && !snapshot && (
        <div className="mt-5">
          <InstagramConnection />
        </div>
      )}

      <Dialog
        open={selectedReport !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedReport(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {selectedReport?.title}
              <Badge variant="outline" className="text-[10px]">
                {selectedReport?.source === "ai"
                  ? "AI analysis"
                  : "Deterministic fallback"}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {selectedReport
                ? `${new Date(selectedReport.periodStart).toLocaleDateString()} – ${new Date(selectedReport.periodEnd).toLocaleDateString()} · data as of ${formatDateTime(selectedReport.dataFreshnessAt)} · snapshot ${selectedReport.snapshotHash.slice(0, 12)}…`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedReport && (
            <Markdown
              content={selectedReport.content}
              className="text-[12.5px] text-foreground/90"
            />
          )}
        </DialogContent>
      </Dialog>

      <LinkMediaDialog
        media={linkTarget}
        onOpenChange={(open) => {
          if (!open) setLinkTarget(null);
        }}
      />
    </div>
  );
}
