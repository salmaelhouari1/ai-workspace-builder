import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import {
  INTELLIGENCE_METRICS,
  INTELLIGENCE_PERIODS,
  INTELLIGENCE_SOURCES,
  type IntelligencePeriodId,
  type MetricDefinition,
} from "@/lib/intelligence";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarRange,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDashed,
  Database,
  Instagram,
  Lightbulb,
  LockKeyhole,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";

const ease = [0.22, 1, 0.36, 1] as const;

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

function MetricCard({ metric }: { metric: MetricDefinition }) {
  const Icon = metric.icon;
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-4 py-4">
      <div className="flex items-center gap-2 text-[11.5px] font-medium text-muted-foreground">
        <Icon className="size-3.5 text-muted-foreground" />
        {metric.label}
      </div>
      <p className="mt-3 font-display text-3xl leading-none tracking-tight text-muted-foreground/70">
        —
      </p>
      <p className="mt-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
        No data yet
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
        {metric.description}
      </p>
    </div>
  );
}

function WaitingForData({
  icon: Icon = CircleDashed,
  title,
  body,
  action,
  chartHeight = "h-52",
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
  chartHeight?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border/80 px-5 py-8 text-center",
        chartHeight,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 h-px bg-border/40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-3/4 h-px bg-border/40"
      />
      <span className="relative flex size-10 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="relative mt-3 text-sm font-medium">{title}</p>
      <p className="relative mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action && <div className="relative mt-3">{action}</div>}
    </div>
  );
}

export default function Intelligence() {
  const navigate = useNavigate();
  const workspace = useQuery(api.workspaces.getForMe);
  const [period, setPeriod] = useState<IntelligencePeriodId>("30d");
  const [connectOpen, setConnectOpen] = useState(false);

  const contextItems = workspace
    ? [
        { label: "Main goal", value: workspace.mainGoal },
        { label: "Audience", value: workspace.audienceDescription },
        { label: "Marketing goals", value: workspace.marketingGoals },
        { label: "Priorities", value: workspace.marketingPriorities },
      ].flatMap((item) => {
        const value = item.value?.trim();
        return value ? [{ label: item.label, value }] : [];
      })
    : [];

  if (workspace === undefined) {
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

  if (workspace === null) return null;

  const selectedPeriod = INTELLIGENCE_PERIODS.find((p) => p.id === period);

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
              <span className="size-1.5 rounded-full bg-muted-foreground/50" />
              Not connected
            </Badge>
          </div>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight md:text-[2.35rem] md:leading-tight">
            Marketing intelligence
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground md:text-[15px]">
            Real performance from your channels, read alongside your business
            context. OCIVO shows what the data supports — and what it doesn't.
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground/80">
            {workspace.name} · Last sync: never
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border border-border/80 bg-card/60 p-0.5"
            aria-label="Analysis period"
          >
            {INTELLIGENCE_PERIODS.map((option) => (
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
                {option.shortLabel}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" disabled>
            <RefreshCw className="size-3.5" />
            Sync
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setConnectOpen(true)}
          >
            <PlugZap className="size-3.5" />
            Connect Instagram
          </Button>
        </div>
      </motion.header>

      {/* Honest connection gate */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease }}
        className="relative mt-5 overflow-hidden rounded-2xl border border-ai/30 bg-[color-mix(in_oklab,var(--ai)_6%,var(--card))] p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full border border-ai/25"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-6 size-28 rounded-full border border-ai/20"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ai/25 text-ai-deep">
            <Database className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              No performance source connected yet
            </h2>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
              This dashboard stays empty until a real account is connected.
              OCIVO does not estimate reach, engagement or growth, and it never
              fills gaps with sample metrics.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5 border-ai/40 bg-background/60"
            onClick={() => setConnectOpen(true)}
          >
            See what's required
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
      </motion.section>

      <Tabs defaultValue="overview" className="mt-5">
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {INTELLIGENCE_METRICS.map((metric) => (
              <MetricCard key={metric.key} metric={metric} />
            ))}
          </div>

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Panel
                title="Performance over time"
                description={`${selectedPeriod?.label ?? "Last 30 days"} · no source connected`}
                icon={<ChartNoAxesCombined className="size-4" />}
              >
                <WaitingForData
                  icon={ChartNoAxesCombined}
                  title="A real trend needs real history"
                  body="Once Instagram is connected, this chart will show reach, views and follower movement for the selected period. There is no backfilled or simulated line."
                />
              </Panel>

              <div className="grid gap-5 sm:grid-cols-2">
                <Panel
                  title="Top performing content"
                  icon={<Sparkles className="size-4" />}
                >
                  <WaitingForData
                    icon={Sparkles}
                    title="No content measured"
                    body="Published posts and reels will appear here after OCIVO retrieves their insights."
                    chartHeight="h-44"
                  />
                </Panel>

                <Panel
                  title="What needs attention"
                  icon={<Lightbulb className="size-4" />}
                  tone="ai"
                >
                  <WaitingForData
                    icon={Lightbulb}
                    title="No recommendations yet"
                    body="OCIVO only recommends from evidence. Connect a source to build the first real analysis."
                    chartHeight="h-44"
                  />
                </Panel>
              </div>
            </div>

            <div className="space-y-5">
              {/* Business-level intelligence */}
              <Panel
                title="Business context"
                description="The lens for every metric"
                icon={<Target className="size-4" />}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    Performance only means something against your objectives,
                    audience and priorities.
                  </p>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {contextItems.length}/4 set
                  </Badge>
                </div>

                {contextItems.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-border/80 px-4 py-4">
                    <p className="text-[12.5px] font-medium">
                      Your business context is still blank
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                      Add a goal or audience so OCIVO can judge performance
                      against something real.
                    </p>
                  </div>
                ) : (
                  <dl className="mt-4 space-y-3">
                    {contextItems.slice(0, 3).map((item) => (
                      <div key={item.label}>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                          {item.label}
                        </dt>
                        <dd className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-foreground/85">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

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

              {/* Provider-agnostic source list */}
              <Panel
                title="Connected sources"
                description="One model, more channels over time"
                icon={<PlugZap className="size-4" />}
              >
                <ul className="space-y-2">
                  {INTELLIGENCE_SOURCES.map((source) => {
                    const Icon = source.icon;
                    return (
                      <li
                        key={source.id}
                        className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5"
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium">
                            {source.label}
                          </p>
                          <p className="truncate text-[10.5px] text-muted-foreground">
                            {source.description}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-medium",
                            source.availability === "available"
                              ? "bg-muted text-muted-foreground"
                              : "bg-background/60 text-muted-foreground/60",
                          )}
                        >
                          {source.availability === "available"
                            ? "Not connected"
                            : "Planned"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground/80">
                  LinkedIn and TikTok can plug into the same overview, reports
                  and recommendations without rebuilding this page.
                </p>
              </Panel>

              {/* AI boundary */}
              <Panel
                title="You stay in control"
                icon={<ShieldCheck className="size-4 text-primary" />}
              >
                <ul className="space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/60" />
                    OCIVO can analyze, suggest and prepare actions.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/60" />
                    Nothing is published or changed without your confirmation.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/60" />
                    Recommendations carry their evidence, not just an opinion.
                  </li>
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 h-7 gap-1 px-2 text-[11px]"
                  onClick={() => navigate("/app/ai")}
                >
                  Ask OCIVO
                  <ArrowUpRight className="size-3" />
                </Button>
              </Panel>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Content ---------------- */}
        <TabsContent value="content" className="mt-4">
          <div className="grid items-start gap-5 lg:grid-cols-3">
            <Panel
              title="Content performance"
              description="Real posts, real engagement"
              icon={<ChartNoAxesCombined className="size-4" />}
              className="lg:col-span-2"
            >
              <WaitingForData
                icon={Instagram}
                title="Instagram content will appear here"
                body="OCIVO will rank recent media by reach, views, saves and interactions once a professional account is connected."
              />
            </Panel>

            <div className="space-y-5">
              <Panel
                title="Planner connection"
                description="Plan here, measure there"
                icon={<CalendarRange className="size-4" />}
              >
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Published Instagram media can be linked to a Marketing
                  Planner entry only when the match is clear — or when you
                  confirm it. OCIVO will not silently assume two things are the
                  same post.
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
                title="Why matching is cautious"
                icon={<CircleDashed className="size-4" />}
              >
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  The Instagram API does not return OCIVO planner IDs. Matching
                  is therefore a deliberate step, not an automatic truth.
                </p>
              </Panel>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Audience ---------------- */}
        <TabsContent value="audience" className="mt-4">
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Panel
              title="Audience growth"
              description="Since the source is connected"
              icon={<ChartNoAxesCombined className="size-4" />}
            >
              <WaitingForData
                icon={ChartNoAxesCombined}
                title="Growth history starts at connection"
                body="Instagram does not provide unlimited follower history. OCIVO will show the real series it can collect, labelled from its first sync."
              />
            </Panel>

            <Panel
              title="Audience details"
              description="Only what Meta actually provides"
              icon={<Target className="size-4" />}
            >
              <div className="space-y-3">
                {[
                  "Follower changes and available demographics will be shown when Meta supplies them.",
                  "Metrics withheld because of account size or API limits stay visibly unavailable.",
                  "OCIVO never replaces a missing number with an estimate.",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex gap-2.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5"
                  >
                    <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </TabsContent>

        {/* ---------------- Reports ---------------- */}
        <TabsContent value="reports" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                title: "Weekly review",
                body: "What changed, what the data supports and what to try next.",
              },
              {
                title: "Monthly report",
                body: "A longer view, compared with the previous period.",
              },
              {
                title: "Content deep dive",
                body: "Which formats, topics and posts earned attention.",
              },
            ].map((report) => (
              <div
                key={report.title}
                className="rounded-2xl border border-border/70 bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold">{report.title}</h2>
                  <LockKeyhole className="size-3.5 shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                  {report.body}
                </p>
                <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
                  Needs connected data
                </p>
              </div>
            ))}
          </div>

          <Panel
            title="Report history"
            description="Every report keeps the data snapshot it came from"
            icon={<Sparkles className="size-4" />}
            className="mt-5"
            tone="ai"
          >
            <WaitingForData
              icon={Sparkles}
              title="No reports yet"
              body="Reports are generated from a saved, dated metrics snapshot. That keeps every observation auditable instead of turning into an untraceable summary."
              chartHeight="h-44"
            />
          </Panel>
        </TabsContent>
      </Tabs>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <Badge variant="secondary" className="mb-1 w-fit text-[10px]">
              Instagram · read-only
            </Badge>
            <DialogTitle>Connect a professional account</DialogTitle>
            <DialogDescription>
              OCIVO uses Meta's official Instagram API. It requests insight
              access only — no publishing, messaging or comment permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            {[
              "An Instagram Business or Creator account",
              "Read-only profile, media and audience insights",
              "A secure, revocable connection you can disconnect at any time",
              "No automatic posting or changes to your account",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {item}
                </p>
              </div>
            ))}
          </div>

          <Alert className="bg-background/60">
            <AlertTitle>Secure connection is not configured</AlertTitle>
            <AlertDescription>
              This workspace does not have Instagram app access configured yet.
              No account has been linked and no data is being fetched.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectOpen(false)}>
              Close
            </Button>
            <Button disabled title="Available after Meta app access is configured">
              <PlugZap className="size-3.5" />
              Connect with Instagram
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

