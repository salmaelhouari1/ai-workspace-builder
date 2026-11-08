/**
 * Deterministic intelligence calculations.
 *
 * This module is deliberately pure: no Convex, no network, no model calls.
 * The same snapshot powers the dashboard, reports, recommendations and tests.
 * Missing values stay `null`; nothing here turns missing data into zero.
 */

export type NullableNumber = number | null;

export const PERIOD_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const;

export type PeriodKey = keyof typeof PERIOD_DAYS;

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export interface PeriodMetrics {
  followers: NullableNumber;
  reach: NullableNumber;
  views: NullableNumber;
  interactions: NullableNumber;
  accountsEngaged: NullableNumber;
  profileVisits: NullableNumber;
  follows: NullableNumber;
  unfollows: NullableNumber;
  followerChange: NullableNumber;
  mediaCount: NullableNumber;
}

export const EMPTY_PERIOD_METRICS: PeriodMetrics = {
  followers: null,
  reach: null,
  views: null,
  interactions: null,
  accountsEngaged: null,
  profileVisits: null,
  follows: null,
  unfollows: null,
  followerChange: null,
  mediaCount: null,
};

export interface MetricChange {
  absolute: NullableNumber;
  percent: NullableNumber;
}

export interface DailyMetric {
  date: string;
  followers: NullableNumber;
  reach: NullableNumber;
  views: NullableNumber;
  interactions: NullableNumber;
}

export interface MediaMetric {
  id: string;
  mediaId: string;
  mediaType: string;
  mediaProductType: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  timestamp: number;
  likeCount: NullableNumber;
  commentsCount: NullableNumber;
  reach: NullableNumber;
  views: NullableNumber;
  saves: NullableNumber;
  shares: NullableNumber;
  profileVisits: NullableNumber;
  follows: NullableNumber;
  interactions: NullableNumber;
  marketingEntryId?: string | null;
  marketingEntryTitle?: string | null;
}

export interface FormatSummary {
  key: string;
  label: string;
  count: number;
  reach: NullableNumber;
  views: NullableNumber;
  interactions: NullableNumber;
  avgReach: NullableNumber;
  avgInteractions: NullableNumber;
  engagementRate: NullableNumber;
}

export interface BusinessSnapshot {
  name: string;
  businessType: string;
  mainGoal: string | null;
  audience: string | null;
  marketingGoals: string | null;
  marketingPriorities: string | null;
  industry?: string | null;
  productsServices?: string | null;
  customerNeeds?: string | null;
  brandVoice?: string | null;
  preferredPlatforms?: string[];
  goals: Array<{ title: string; current: string | null; target: string | null }>;
}

export interface AnalyticsSnapshot {
  workspace: BusinessSnapshot;
  connection: {
    username: string | null;
    accountType: string | null;
    lastSyncedAt: number | null;
    dataFreshnessAt: number | null;
  };
  period: {
    key: PeriodKey;
    label: string;
    start: number;
    end: number;
    metrics: PeriodMetrics;
    previous: PeriodMetrics;
    changes: Record<keyof PeriodMetrics, MetricChange>;
  };
  daily: DailyMetric[];
  media: {
    top: MediaMetric[];
    lowest: MediaMetric[];
    formats: FormatSummary[];
    recent: MediaMetric[];
    total: number;
    unlinked: number;
  };
  audience: {
    country: Array<{ label: string; value: number }>;
    age: Array<{ label: string; value: number }>;
    gender: Array<{ label: string; value: number }>;
  };
  dataGaps: string[];
  generatedAt: string;
}

export interface RecommendationSeed {
  fingerprint: string;
  title: string;
  explanation: string;
  evidence: Array<{ label: string; value: string }>;
  confidence: "low" | "medium" | "high";
  suggestedAction: string;
  potentialBenefit: string;
}

export const METRIC_LABELS: Record<keyof PeriodMetrics, string> = {
  followers: "Followers",
  reach: "Reach",
  views: "Views",
  interactions: "Interactions",
  accountsEngaged: "Accounts engaged",
  profileVisits: "Profile visits",
  follows: "Follows",
  unfollows: "Unfollows",
  followerChange: "Follower change",
  mediaCount: "Measured media",
};

/** New value minus old value; null when either side is unavailable. */
export function absoluteChange(
  current: NullableNumber,
  previous: NullableNumber,
): NullableNumber {
  if (current === null || previous === null) return null;
  return current - previous;
}

/**
 * Percent change, null when the baseline is missing or zero. Returning null
 * (rather than 0 or Infinity) keeps "no comparable data" distinct from flat.
 */
export function percentChange(
  current: NullableNumber,
  previous: NullableNumber,
): NullableNumber {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function buildMetricChanges(
  current: PeriodMetrics,
  previous: PeriodMetrics,
): Record<keyof PeriodMetrics, MetricChange> {
  const keys = Object.keys(METRIC_LABELS) as Array<keyof PeriodMetrics>;
  return Object.fromEntries(
    keys.map((key) => [
      key,
      {
        absolute: absoluteChange(current[key], previous[key]),
        percent: percentChange(current[key], previous[key]),
      },
    ]),
  ) as Record<keyof PeriodMetrics, MetricChange>;
}

/** Engagement as a share of reach. Null when reach is missing or zero. */
export function engagementRate(
  interactions: NullableNumber,
  reach: NullableNumber,
): NullableNumber {
  if (interactions === null || reach === null || reach === 0) return null;
  return (interactions / reach) * 100;
}

/** Human label for an Instagram media product/type pair. */
export function contentFormatLabel(
  productType: string | null | undefined,
  mediaType: string | null | undefined,
): string {
  const key = (productType || mediaType || "").toUpperCase();
  if (key === "REELS") return "Reels";
  if (key === "CAROUSEL_ALBUM") return "Carousels";
  if (key === "STORY") return "Stories";
  if (key === "FEED") return "Feed posts";
  if (key === "VIDEO") return "Videos";
  if (key === "IMAGE") return "Image posts";
  return "Other content";
}

/** Group media into content-format summaries without inventing values. */
export function summarizeFormats(media: MediaMetric[]): FormatSummary[] {
  const groups = new Map<string, MediaMetric[]>();
  for (const item of media) {
    const label = contentFormatLabel(item.mediaProductType, item.mediaType);
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }

  return [...groups.entries()]
    .map(([label, items]) => {
      const reachValues = items
        .map((item) => item.reach)
        .filter((value): value is number => value !== null);
      const viewValues = items
        .map((item) => item.views)
        .filter((value): value is number => value !== null);
      const interactionValues = items
        .map((item) => item.interactions)
        .filter((value): value is number => value !== null);
      const totalReach = sum(reachValues);
      const totalViews = sum(viewValues);
      const totalInteractions = sum(interactionValues);

      return {
        key: label.toLowerCase().replace(/\s+/g, "-"),
        label,
        count: items.length,
        reach: totalReach,
        views: totalViews,
        interactions: totalInteractions,
        avgReach:
          reachValues.length > 0
            ? Math.round(totalReach! / reachValues.length)
            : null,
        avgInteractions:
          interactionValues.length > 0
            ? Math.round(totalInteractions! / interactionValues.length)
            : null,
        engagementRate: engagementRate(totalInteractions, totalReach),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function sum(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

/** Ranking uses only measured values; unmeasured media is excluded. */
function mediaScore(item: MediaMetric): number | null {
  if (item.interactions !== null) return item.interactions;
  if (item.views !== null) return item.views;
  if (item.reach !== null) return item.reach;
  return null;
}

export function rankMedia(media: MediaMetric[], direction: "top" | "low") {
  return media
    .filter((item) => mediaScore(item) !== null)
    .sort((a, b) => {
      const left = mediaScore(a)!;
      const right = mediaScore(b)!;
      return direction === "top" ? right - left : left - right;
    });
}

export function topMedia(media: MediaMetric[], count = 5): MediaMetric[] {
  return rankMedia(media, "top").slice(0, count);
}

export function lowestMedia(media: MediaMetric[], count = 5): MediaMetric[] {
  return rankMedia(media, "low").slice(0, count);
}

function signed(value: number, suffix = ""): string {
  return `${value > 0 ? "+" : ""}${formatMetric(value)}${suffix}`;
}

export function formatMetric(value: NullableNumber): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatChangePercent(value: NullableNumber): string {
  if (value === null) return "No comparable data";
  return `${signed(value)}%`;
}

export function formatDateTime(value: number | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildDataGaps(input: {
  connection: boolean;
  hasReach: boolean;
  hasViews: boolean;
  hasInteractions: boolean;
  hasFollowers: boolean;
  mediaCount: number;
  hasAudience: boolean;
}): string[] {
  const gaps: string[] = [];
  if (!input.connection) gaps.push("No Instagram account is connected.");
  if (!input.hasReach) gaps.push("Reach is unavailable for this period.");
  if (!input.hasViews) gaps.push("Views are unavailable for this period.");
  if (!input.hasInteractions)
    gaps.push("Interaction metrics are unavailable for this period.");
  if (!input.hasFollowers)
    gaps.push("Follower history is unavailable or the account is under 100 followers.");
  if (input.mediaCount === 0)
    gaps.push("No published media was found for this period.");
  if (!input.hasAudience)
    gaps.push("Audience demographics are unavailable for this account or timeframe.");
  return gaps;
}

/**
 * Deterministic recommendations. Every one is derived from a measured change
 * or a measured format comparison; nothing is generated when evidence is thin.
 */
export function buildRecommendationSeeds(snapshot: {
  period: AnalyticsSnapshot["period"];
  media: Pick<AnalyticsSnapshot["media"], "formats" | "total" | "unlinked">;
  businessGoal?: string | null;
}): RecommendationSeed[] {
  const seeds: RecommendationSeed[] = [];
  const { metrics, previous, changes } = snapshot.period;
  const formats = snapshot.media.formats.filter(
    (format) => format.avgReach !== null && format.count > 0,
  );
  const enoughMedia = snapshot.media.total >= 2;

  const goal = snapshot.businessGoal?.trim();
  const goalClause = goal ? ` Keep the business goal "${goal}" in view.` : "";

  // 1. A clearly dominant format (needs at least two measured formats and
  // two posts in the leading format, so one lucky post is not enough).
  const sortedFormats = [...formats].sort(
    (a, b) => (b.avgReach ?? 0) - (a.avgReach ?? 0),
  );
  const leader = sortedFormats[0];
  const runnerUp = sortedFormats[1];
  if (
    leader &&
    leader.count >= 2 &&
    leader.avgReach !== null &&
    (runnerUp?.avgReach === null || runnerUp === undefined)
  ) {
    seeds.push({
      fingerprint: `format-only-${leader.key}`,
      title: `Test more ${leader.label.toLowerCase()}`,
      explanation: `${leader.label} are the only measured format in this period. That is a useful starting signal, not proof that another format would perform worse.`,
      evidence: [
        { label: `${leader.label} measured`, value: `${leader.count} posts` },
        { label: "Average reach", value: formatMetric(leader.avgReach) },
        {
          label: "Average interactions",
          value: formatMetric(leader.avgInteractions),
        },
      ],
      confidence: leader.count >= 3 ? "medium" : "low",
      suggestedAction: `Plan one deliberate ${leader.label.toLowerCase()} experiment for the next period and keep the format consistent enough to compare.${goalClause}`,
      potentialBenefit:
        "Hypothesis: a second measured format could reveal whether this result is format-specific or simply your current audience. This is not a guaranteed reach increase.",
    });
  } else if (
    leader &&
    runnerUp &&
    leader.count >= 2 &&
    runnerUp.count >= 1 &&
    leader.avgReach !== null &&
    runnerUp.avgReach !== null &&
    leader.avgReach > runnerUp.avgReach * 1.2
  ) {
    const lift = Math.round(
      ((leader.avgReach - runnerUp.avgReach) / runnerUp.avgReach) * 100,
    );
    seeds.push({
      fingerprint: `format-leader-${leader.key}-${runnerUp.key}`,
      title: `Make more room for ${leader.label.toLowerCase()}`,
      explanation: `${leader.label} averaged ${lift}% more reach per post than ${runnerUp.label.toLowerCase()} in this period. The gap is worth testing, but it does not prove the format caused the result.`,
      evidence: [
        {
          label: `${leader.label} average reach`,
          value: formatMetric(leader.avgReach),
        },
        {
          label: `${runnerUp.label} average reach`,
          value: formatMetric(runnerUp.avgReach),
        },
        { label: "Posts compared", value: `${leader.count} vs ${runnerUp.count}` },
      ],
      confidence: leader.count >= 3 && runnerUp.count >= 2 ? "medium" : "low",
      suggestedAction: `Keep the next content mix stable enough to compare, but shift one planned item toward ${leader.label.toLowerCase()}.${goalClause}`,
      potentialBenefit:
        "Hypothesis: a modest format shift could capture more reach with the same effort. It may not repeat, especially if the sample is small.",
    });
  }

  // 2. Measured reach decline.
  if (
    changes.reach.percent !== null &&
    changes.reach.percent <= -10 &&
    metrics.reach !== null &&
    previous.reach !== null
  ) {
    seeds.push({
      fingerprint: `reach-decline-${snapshot.period.key}`,
      title: "Refresh the reach plan",
      explanation: `Reach fell ${Math.abs(Math.round(changes.reach.percent))}% versus the previous period. The data shows the change, not its cause.`,
      evidence: [
        { label: "Current reach", value: formatMetric(metrics.reach) },
        { label: "Previous reach", value: formatMetric(previous.reach) },
        {
          label: "Change",
          value: formatChangePercent(changes.reach.percent),
        },
      ],
      confidence: enoughMedia ? "medium" : "low",
      suggestedAction:
        "Review the hooks and topics of the weakest posts, then plan one test with a different opening angle before changing the whole calendar." +
        goalClause,
      potentialBenefit:
        "Hypothesis: a clearer hook may recover some reach. Reach is influenced by many factors outside this data, so no specific increase is promised.",
    });
  }

  // 3. Engagement-rate decline, computed only where both values exist.
  const currentRate = engagementRate(metrics.interactions, metrics.reach);
  const previousRate = engagementRate(previous.interactions, previous.reach);
  const rateChange = percentChange(currentRate, previousRate);
  if (rateChange !== null && rateChange <= -10 && currentRate !== null) {
    seeds.push({
      fingerprint: `engagement-decline-${snapshot.period.key}`,
      title: "Strengthen the value in each post",
      explanation: `Interactions per account reached fell ${Math.abs(Math.round(rateChange))}%. This is a signal to review content quality, not proof that engagement is failing across the business.`,
      evidence: [
        {
          label: "Current engagement rate",
          value: `${currentRate.toFixed(1)}%`,
        },
        {
          label: "Previous engagement rate",
          value: `${previousRate?.toFixed(1)}%`,
        },
        { label: "Interaction change", value: formatChangePercent(rateChange) },
      ],
      confidence: enoughMedia ? "medium" : "low",
      suggestedAction:
        "Compare the best and weakest captions from the period, then test one clearer save-worthy or share-worthy angle." +
        goalClause,
      potentialBenefit:
        "Hypothesis: stronger relevance could improve engagement per viewer. The data cannot show whether hooks, topic, timing or audience mix caused the change.",
    });
  }

  // 4. Only one format measured with enough posts to make the gap meaningful.
  if (snapshot.media.total >= 3 && formats.length === 1 && !leader) {
    seeds.push({
      fingerprint: `format-variety-${snapshot.period.key}`,
      title: "Give the audience a second format to respond to",
      explanation:
        "The period contains several posts but no measured format comparison, so OCIVO cannot say which format performs better.",
      evidence: [
        { label: "Published media", value: String(snapshot.media.total) },
        { label: "Measured formats", value: "0" },
      ],
      confidence: "low",
      suggestedAction:
        "Keep one format stable and test one alternative with a clear hypothesis.",
      potentialBenefit:
        "Hypothesis: a controlled comparison could produce a more useful signal next period. It may also show no meaningful difference.",
    });
  }

  // 5. Unlinked content is an attribution gap, not a performance result.
  if (snapshot.media.unlinked > 0) {
    seeds.push({
      fingerprint: `unlinked-content-${snapshot.period.key}`,
      title: "Connect published content to the plan",
      explanation: `${snapshot.media.unlinked} published item${snapshot.media.unlinked === 1 ? " is" : "s are"} not linked to a Marketing Planner entry. OCIVO can measure them, but cannot yet show which plan produced them.`,
      evidence: [
        { label: "Unlinked media", value: String(snapshot.media.unlinked) },
        { label: "Total measured media", value: String(snapshot.media.total) },
      ],
      confidence: "high",
      suggestedAction:
        "Open the Content tab and link the published items you recognise to their planner entries.",
      potentialBenefit:
        "Hypothesis: cleaner attribution will make future recommendations more specific. It will not change the underlying performance.",
    });
  }

  // 6. Followers unavailable is not a reason to invent growth advice.
  if (
    metrics.followers === null &&
    snapshot.media.total > 0 &&
    seeds.length < 2
  ) {
    seeds.push({
      fingerprint: `follower-data-gap-${snapshot.period.key}`,
      title: "Build enough follower history for growth analysis",
      explanation:
        "Follower counts are unavailable for this account or period. OCIVO will not infer growth from reach or engagement.",
      evidence: [
        { label: "Follower metric", value: "Unavailable" },
        { label: "Measured media", value: String(snapshot.media.total) },
      ],
      confidence: "high",
      suggestedAction:
        "Keep the connection active so OCIVO can collect follower snapshots. Accounts under 100 followers may not receive this metric from Meta.",
      potentialBenefit:
        "Hypothesis: a longer real history will make growth recommendations possible. No growth outcome is implied.",
    });
  }

  return seeds.slice(0, 4);
}

function markdownMetric(label: string, value: NullableNumber): string {
  return `- **${label}:** ${formatMetric(value)}`;
}

function reportPeriodLine(snapshot: AnalyticsSnapshot): string {
  return `${new Date(snapshot.period.start).toISOString().slice(0, 10)} → ${new Date(snapshot.period.end).toISOString().slice(0, 10)}`;
}

/**
 * A complete report that works without an AI gateway. The AI version can add
 * interpretation, but this is always the factual fallback.
 */
export function buildDeterministicReport(
  snapshot: AnalyticsSnapshot,
  type: "weekly" | "monthly" | "content" | "audience" | "improvement",
): string {
  const { metrics, previous, changes } = snapshot.period;
  const formats = snapshot.media.formats;
  const top = snapshot.media.top;
  const insights = buildRecommendationSeeds({
    period: snapshot.period,
    media: snapshot.media,
    businessGoal: snapshot.workspace.mainGoal,
  });

  const title =
    type === "weekly"
      ? "Weekly marketing report"
      : type === "monthly"
        ? "Monthly marketing report"
        : type === "content"
          ? "Content performance report"
          : type === "audience"
            ? "Audience growth report"
            : "Marketing improvement report";

  const lines: string[] = [
    `# ${title}`,
    "",
    `**Reporting period:** ${reportPeriodLine(snapshot)}`,
    `**Business:** ${snapshot.workspace.name}`,
    `**Data freshness:** ${formatDateTime(snapshot.connection.dataFreshnessAt)}`,
    `**Account:** ${snapshot.connection.username ? `@${snapshot.connection.username}` : "Instagram professional account"}`,
    "",
    "## Key metrics",
    "",
    markdownMetric("Reach", metrics.reach),
    markdownMetric("Views", metrics.views),
    markdownMetric("Interactions", metrics.interactions),
    markdownMetric("Accounts engaged", metrics.accountsEngaged),
    markdownMetric("Followers", metrics.followers),
    markdownMetric("Follower change", metrics.followerChange),
    markdownMetric("Measured media", metrics.mediaCount),
    "",
    "## Performance changes",
    "",
  ];

  const comparable = (
    Object.keys(METRIC_LABELS) as Array<keyof PeriodMetrics>
  ).filter((key) => changes[key].percent !== null);
  if (comparable.length) {
    for (const key of comparable) {
      lines.push(
        `- **${METRIC_LABELS[key]}:** ${formatChangePercent(changes[key].percent)} (${formatMetric(previous[key])} → ${formatMetric(metrics[key])})`,
      );
    }
  } else {
    lines.push(
      "No previous period is available yet, so OCIVO is not showing period-over-period changes.",
    );
  }

  if (type === "content" || type === "weekly" || type === "monthly") {
    lines.push("", "## Content performance", "");
    if (formats.length) {
      for (const format of formats) {
        lines.push(
          `- **${format.label}:** ${format.count} post${format.count === 1 ? "" : "s"}; average reach ${formatMetric(format.avgReach)}; average interactions ${formatMetric(format.avgInteractions)}${format.engagementRate !== null ? `; engagement/reach ${format.engagementRate.toFixed(1)}%` : ""}.`,
        );
      }
    } else {
      lines.push("No measured content was available for this period.");
    }

    if (top.length) {
      lines.push("", "### Best-performing content", "");
      for (const item of top.slice(0, 5)) {
        lines.push(
          `- **${item.caption?.trim().slice(0, 110) || "Untitled post"}** — reach ${formatMetric(item.reach)}, views ${formatMetric(item.views)}, interactions ${formatMetric(item.interactions)}${item.permalink ? ` ([view](${item.permalink}))` : ""}.`,
        );
      }
    }
  }

  if (type === "audience" || type === "weekly" || type === "monthly") {
    lines.push("", "## Audience", "");
    lines.push(markdownMetric("Current followers", metrics.followers));
    lines.push(markdownMetric("Follows", metrics.follows));
    lines.push(markdownMetric("Unfollows", metrics.unfollows));
    lines.push(markdownMetric("Net follower change", metrics.followerChange));
    const demographicSets = [
      ["Top countries", snapshot.audience.country],
      ["Age ranges", snapshot.audience.age],
      ["Gender", snapshot.audience.gender],
    ] as const;
    let hasDemographics = false;
    for (const [label, values] of demographicSets) {
      if (values.length) {
        hasDemographics = true;
        lines.push(
          `- **${label}:** ${values
            .slice(0, 5)
            .map((item) => `${item.label} (${formatMetric(item.value)})`)
            .join(", ")}.`,
        );
      }
    }
    if (!hasDemographics) {
      lines.push(
        "Audience demographics are unavailable for this account or timeframe. Meta withholds some metrics for smaller accounts.",
      );
    }
  }

  lines.push(
    "",
    "## Important observations",
    "",
    `- ${metrics.reach !== null ? `The period reached ${formatMetric(metrics.reach)} accounts.` : "Reach was unavailable, so no reach conclusion is drawn."}`,
    `- ${metrics.interactions !== null ? `The account recorded ${formatMetric(metrics.interactions)} interactions.` : "Interactions were unavailable."}`,
    `- ${snapshot.media.total > 0 ? `${snapshot.media.total} published media item${snapshot.media.total === 1 ? " was" : "s were"} measured.` : "No published media was measured in this period."}`,
  );

  lines.push("", "## Potential opportunities", "");
  if (insights.length) {
    for (const item of insights) {
      lines.push(
        `- **${item.title}.** ${item.explanation} Evidence: ${item.evidence.map((e) => `${e.label} ${e.value}`).join("; ")}.`,
      );
    }
  } else {
    lines.push(
      "No evidence-backed opportunity reached the threshold for this period. OCIVO would rather wait for more data than manufacture advice.",
    );
  }

  lines.push("", "## Recommended next actions", "");
  if (insights.length) {
    for (const item of insights) {
      lines.push(
        `- ${item.suggestedAction} *${item.potentialBenefit}*`,
      );
    }
  } else {
    lines.push(
      "Keep collecting data, link published posts to the planner, and review again after the next period.",
    );
  }

  lines.push("", "## Missing or unavailable information", "");
  if (snapshot.dataGaps.length) {
    for (const gap of snapshot.dataGaps) lines.push(`- ${gap}`);
  } else {
    lines.push(
      "No required metric was missing for this report. This does not mean the data explains causation.",
    );
  }

  lines.push(
    "",
    "## Limitations",
    "",
    "- Instagram insights are estimated and can be delayed by up to 48 hours.",
    "- Period reach is a unique-account metric; daily reach values are never summed into it.",
    "- Engagement does not prove sales, conversions or business growth.",
    "- Some metrics are withheld for accounts under 100 followers or media with insufficient activity.",
    "- This report describes correlation and measured changes, not causation.",
    "",
    `_Generated deterministically by OCIVO on ${new Date(snapshot.generatedAt).toISOString()}._`,
  );

  return lines.join("\n");
}

export interface EvidenceStatement {
  text: string;
  evidence: string;
}

export interface AIReportAnalysis {
  observations: EvidenceStatement[];
  interpretation: EvidenceStatement[];
  opportunities: EvidenceStatement[];
  recommendations: EvidenceStatement[];
  limitations: EvidenceStatement[];
}

function evidenceList(items: EvidenceStatement[]): string[] {
  return items.map(
    (item) => `- ${item.text.trim()}  \n  _Evidence: ${item.evidence.trim()}_`,
  );
}

/**
 * AI-written sections wrapped in deterministic metrics and context. The model
 * receives only the snapshot and never supplies the key metric values.
 */
export function buildAIReport(
  snapshot: AnalyticsSnapshot,
  type: "weekly" | "monthly" | "content" | "audience" | "improvement",
  analysis: AIReportAnalysis,
): string {
  const { metrics, previous, changes } = snapshot.period;
  const lines: string[] = [
    `# ${reportTitle(type)}`,
    "",
    `**Reporting period:** ${reportPeriodLine(snapshot)}`,
    `**Business:** ${snapshot.workspace.name}`,
    `**Data freshness:** ${formatDateTime(snapshot.connection.dataFreshnessAt)}`,
    `**Account:** ${snapshot.connection.username ? `@${snapshot.connection.username}` : "Instagram professional account"}`,
    "",
    "## Key metrics (deterministic)",
    "",
    markdownMetric("Reach", metrics.reach),
    markdownMetric("Views", metrics.views),
    markdownMetric("Interactions", metrics.interactions),
    markdownMetric("Accounts engaged", metrics.accountsEngaged),
    markdownMetric("Followers", metrics.followers),
    markdownMetric("Follower change", metrics.followerChange),
    markdownMetric("Measured media", metrics.mediaCount),
    "",
    "## Performance changes",
    "",
  ];
  const comparable = (
    Object.keys(METRIC_LABELS) as Array<keyof PeriodMetrics>
  ).filter((key) => changes[key].percent !== null);
  if (comparable.length) {
    for (const key of comparable) {
      lines.push(
        `- **${METRIC_LABELS[key]}:** ${formatChangePercent(changes[key].percent)} (${formatMetric(previous[key])} → ${formatMetric(metrics[key])})`,
      );
    }
  } else {
    lines.push(
      "No previous comparable period is available. Changes are intentionally omitted.",
    );
  }

  if (type === "content" || type === "weekly" || type === "monthly") {
    lines.push("", "## Best-performing content", "");
    if (snapshot.media.top.length) {
      for (const item of snapshot.media.top.slice(0, 5)) {
        lines.push(
          `- **${item.caption?.trim().slice(0, 110) || "Untitled post"}** — reach ${formatMetric(item.reach)}, views ${formatMetric(item.views)}, interactions ${formatMetric(item.interactions)}${item.permalink ? ` ([view](${item.permalink}))` : ""}.`,
        );
      }
    } else {
      lines.push("No measured content was available for this period.");
    }
  }

  const sections: Array<[string, EvidenceStatement[]]> = [
    ["Observations (what the data proves)", analysis.observations],
    ["Interpretation (what it may suggest)", analysis.interpretation],
    ["Opportunities", analysis.opportunities],
    ["Recommendations", analysis.recommendations],
    ["Limitations", analysis.limitations],
  ];
  for (const [heading, items] of sections) {
    lines.push("", `## ${heading}`, "");
    if (items.length) lines.push(...evidenceList(items));
    else lines.push("No evidence-backed statement was generated for this section.");
  }

  lines.push("", "## Missing or unavailable information", "");
  if (snapshot.dataGaps.length) {
    for (const gap of snapshot.dataGaps) lines.push(`- ${gap}`);
  } else {
    lines.push("No required metric was missing for this report.");
  }
  lines.push(
    "",
    "_AI interpretation is constrained to the normalized snapshot above. Keys metrics are calculated by OCIVO, not by the model. Correlation is not causation._",
  );
  return lines.join("\n");
}

export interface PlannerCandidate {
  id: string;
  title: string;
  platform: string;
  status: string;
  scheduledAt: number | null;
  body?: string | null;
}

/**
 * Optional, explainable link suggestions. This never creates a link; the user
 * must confirm it in the UI.
 */
export function suggestPlannerEntries(
  media: Pick<MediaMetric, "caption" | "timestamp">,
  entries: PlannerCandidate[],
): Array<PlannerCandidate & { score: number; reason: string }> {
  const words = new Set(
    (media.caption ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 40),
  );

  return entries
    .map((entry) => {
      if (entry.platform !== "instagram") {
        return { ...entry, score: 0, reason: "Not an Instagram planner entry" };
      }
      const candidateWords = `${entry.title} ${entry.body ?? ""}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 3);
      const overlap = candidateWords.filter((word) => words.has(word)).length;
      const captionScore = words.size
        ? Math.min(0.65, overlap / Math.max(words.size, 1))
        : 0;
      const dayDistance =
        entry.scheduledAt === null
          ? null
          : Math.abs(entry.scheduledAt - media.timestamp) / 86_400_000;
      const dateScore =
        dayDistance === null
          ? 0
          : dayDistance <= 1
            ? 0.3
            : dayDistance <= 3
              ? 0.15
              : 0;
      const score = Math.min(0.95, captionScore + dateScore);
      const reasons: string[] = [];
      if (overlap > 0)
        reasons.push(`${overlap} shared word${overlap === 1 ? "" : "s"}`);
      if (dateScore > 0 && dayDistance !== null)
        reasons.push(
          dayDistance <= 1 ? "same publish day" : "publish dates are close",
        );
      return {
        ...entry,
        score,
        reason: reasons.length
          ? reasons.join(" · ")
          : "No strong caption or date match",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function reportTitle(
  type: "weekly" | "monthly" | "content" | "audience" | "improvement",
): string {
  return type === "weekly"
    ? "Weekly marketing report"
    : type === "monthly"
      ? "Monthly marketing report"
      : type === "content"
        ? "Content performance report"
        : type === "audience"
          ? "Audience growth report"
          : "Marketing improvement report";
}
