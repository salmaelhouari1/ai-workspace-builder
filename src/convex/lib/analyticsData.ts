import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  buildDataGaps,
  buildMetricChanges,
  contentFormatLabel,
  formatMetric,
  lowestMedia,
  PERIOD_DAYS,
  PERIOD_LABELS,
  summarizeFormats,
  topMedia,
  type AnalyticsSnapshot,
  type DailyMetric,
  type MediaMetric,
  type PeriodKey,
  type PeriodMetrics,
} from "../../lib/analytics";

type DbCtx = QueryCtx | MutationCtx;

const PROVIDER = "instagram";

export async function getLatestConnection(
  ctx: DbCtx,
  workspaceId: Id<"workspaces">,
) {
  const rows = await ctx.db
    .query("integrationConnections")
    .withIndex("by_workspace_provider", (q) =>
      q.eq("workspaceId", workspaceId).eq("provider", PROVIDER),
    )
    .collect();
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows[0] ?? null;
}

function nullable(value: number | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function followerChangeFromDaily(daily: DailyMetric[]): number | null {
  const measured = daily.filter((row) => row.followers !== null);
  if (measured.length < 2) return null;
  return measured[measured.length - 1].followers! - measured[0].followers!;
}

/**
 * Build the one normalized snapshot used by the UI, reports, recommendations
 * and assistant context. Unique period reach/views always come from the
 * stored range metric, never from summing daily values.
 */
export async function buildAnalyticsSnapshot(
  ctx: DbCtx,
  workspaceId: Id<"workspaces">,
  periodKey: PeriodKey,
): Promise<AnalyticsSnapshot | null> {
  const [workspace, connection] = await Promise.all([
    ctx.db.get(workspaceId),
    getLatestConnection(ctx, workspaceId),
  ]);
  if (!workspace || !connection) return null;

  const [currentPeriod, previousPeriod, rawDaily, rawMedia, links, goals, audience] =
    await Promise.all([
      ctx.db
        .query("analyticsPeriods")
        .withIndex("by_connection_period", (q) =>
          q
            .eq("connectionId", connection._id)
            .eq("periodKey", periodKey)
            .eq("window", "current"),
        )
        .first(),
      ctx.db
        .query("analyticsPeriods")
        .withIndex("by_connection_period", (q) =>
          q
            .eq("connectionId", connection._id)
            .eq("periodKey", periodKey)
            .eq("window", "previous"),
        )
        .first(),
      ctx.db
        .query("analyticsAccountDaily")
        .withIndex("by_connection_date", (q) =>
          q.eq("connectionId", connection._id),
        )
        .order("asc")
        .take(200),
      ctx.db
        .query("analyticsMedia")
        .withIndex("by_workspace_timestamp", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .take(180),
      ctx.db
        .query("analyticsContentLinks")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
      ctx.db
        .query("goals")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
      ctx.db
        .query("analyticsAudience")
        .withIndex("by_connection", (q) =>
          q.eq("connectionId", connection._id),
        )
        .collect(),
    ]);

  const now = Date.now();
  const start =
    currentPeriod?.periodStart ?? now - PERIOD_DAYS[periodKey] * 86_400_000;
  const end = currentPeriod?.periodEnd ?? now;

  const daily: DailyMetric[] = rawDaily
    .filter((row) => row.connectionId === connection._id)
    .map((row) => ({
      date: row.date,
      followers: nullable(row.followers),
      reach: nullable(row.reach),
      views: nullable(row.views),
      interactions: nullable(row.interactions),
    }));

  const currentMetrics: PeriodMetrics = {
    followers: nullable(currentPeriod?.followersEnd),
    reach: nullable(currentPeriod?.reach),
    views: nullable(currentPeriod?.views),
    interactions: nullable(currentPeriod?.interactions),
    accountsEngaged: nullable(currentPeriod?.accountsEngaged),
    profileVisits: nullable(currentPeriod?.profileVisits),
    follows: nullable(currentPeriod?.follows),
    unfollows: nullable(currentPeriod?.unfollows),
    followerChange: nullable(currentPeriod?.followerChange),
    mediaCount: nullable(currentPeriod?.mediaCount),
  };
  const previousMetrics: PeriodMetrics = {
    followers: nullable(previousPeriod?.followersEnd),
    reach: nullable(previousPeriod?.reach),
    views: nullable(previousPeriod?.views),
    interactions: nullable(previousPeriod?.interactions),
    accountsEngaged: nullable(previousPeriod?.accountsEngaged),
    profileVisits: nullable(previousPeriod?.profileVisits),
    follows: nullable(previousPeriod?.follows),
    unfollows: nullable(previousPeriod?.unfollows),
    followerChange: nullable(previousPeriod?.followerChange),
    mediaCount: nullable(previousPeriod?.mediaCount),
  };

  const latestFollower = [...daily]
    .reverse()
    .find((row) => row.followers !== null)?.followers;
  if (currentMetrics.followers === null && latestFollower !== undefined) {
    currentMetrics.followers = latestFollower;
  }
  if (currentMetrics.followerChange === null) {
    currentMetrics.followerChange = followerChangeFromDaily(
      daily.filter((row) => {
        const timestamp = Date.parse(row.date);
        return timestamp >= start && timestamp <= end + 86_400_000;
      }),
    );
  }

  const linkByMedia = new Map(
    links
      .filter((link) => link.connectionId === connection._id)
      .map((link) => [link.mediaId as string, link]),
  );
  const plannerEntries = await ctx.db
    .query("marketingEntries")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  const entryById = new Map(plannerEntries.map((entry) => [entry._id, entry]));

  const media: MediaMetric[] = rawMedia
    .filter((item) => item.connectionId === connection._id)
    .map((item) => {
      const link = linkByMedia.get(item._id as string);
      const entry = link ? entryById.get(link.marketingEntryId) : undefined;
      return {
        id: item._id as string,
        mediaId: item.mediaId,
        mediaType: item.mediaType,
        mediaProductType: item.mediaProductType ?? null,
        caption: item.caption ?? null,
        permalink: item.permalink ?? null,
        thumbnailUrl: item.thumbnailUrl ?? null,
        timestamp: item.timestamp,
        likeCount: nullable(item.likeCount),
        commentsCount: nullable(item.commentsCount),
        reach: nullable(item.reach),
        views: nullable(item.views),
        saves: nullable(item.saves),
        shares: nullable(item.shares),
        profileVisits: nullable(item.profileVisits),
        follows: nullable(item.follows),
        interactions: nullable(item.interactions),
        marketingEntryId: entry?._id ?? null,
        marketingEntryTitle: entry?.title ?? null,
      };
    });

  const mediaInPeriod = media.filter(
    (item) => item.timestamp >= start && item.timestamp <= end,
  );
  const unlinked = mediaInPeriod.filter(
    (item) => !item.marketingEntryId,
  ).length;
  const formats = summarizeFormats(mediaInPeriod);
  const top = topMedia(mediaInPeriod, 5);
  const lowest = lowestMedia(mediaInPeriod, 5);

  const latestByBreakdown = new Map<
    string,
    { label: string; value: number }[]
  >();
  for (const row of [...audience].sort((a, b) => b.capturedAt - a.capturedAt)) {
    if (!latestByBreakdown.has(row.breakdown)) {
      latestByBreakdown.set(
        row.breakdown,
        row.values.map((value) => ({ label: value.label, value: value.value })),
      );
    }
  }

  const currentMediaCount =
    currentMetrics.mediaCount ?? (mediaInPeriod.length || null);
  currentMetrics.mediaCount = currentMediaCount;

  const hasAudience = ["age", "country", "gender"].some(
    (key) => (latestByBreakdown.get(key)?.length ?? 0) > 0,
  );

  const gaps = buildDataGaps({
    connection: true,
    hasReach: currentMetrics.reach !== null,
    hasViews: currentMetrics.views !== null,
    hasInteractions: currentMetrics.interactions !== null,
    hasFollowers: currentMetrics.followers !== null,
    mediaCount: mediaInPeriod.length,
    hasAudience,
  });

  return {
    workspace: {
      name: workspace.name,
      businessType: workspace.businessType,
      mainGoal: workspace.mainGoal ?? null,
      audience: workspace.audienceDescription ?? null,
      marketingGoals: workspace.marketingGoals ?? null,
      marketingPriorities: workspace.marketingPriorities ?? null,
      industry: workspace.industry ?? null,
      productsServices: workspace.productsServices ?? null,
      customerNeeds: workspace.customerNeeds ?? null,
      brandVoice: workspace.brandVoice ?? null,
      preferredPlatforms: workspace.preferredPlatforms ?? [],
      goals: goals.slice(0, 8).map((goal) => ({
        title: goal.title,
        current:
          goal.current !== undefined
            ? `${formatMetric(goal.current)}${goal.unit ?? ""}`
            : null,
        target:
          goal.target !== undefined
            ? `${formatMetric(goal.target)}${goal.unit ?? ""}`
            : null,
      })),
    },
    connection: {
      username: connection.username ?? null,
      accountType: connection.accountType ?? null,
      lastSyncedAt: connection.lastSyncedAt ?? null,
      dataFreshnessAt: connection.lastSyncedAt ?? null,
    },
    period: {
      key: periodKey,
      label: PERIOD_LABELS[periodKey],
      start,
      end,
      metrics: currentMetrics,
      previous: previousMetrics,
      changes: buildMetricChanges(currentMetrics, previousMetrics),
    },
    daily,
    media: {
      top,
      lowest,
      formats,
      recent: media.slice(0, 30),
      total: mediaInPeriod.length,
      unlinked,
    },
    audience: {
      country: latestByBreakdown.get("country") ?? [],
      age: latestByBreakdown.get("age") ?? [],
      gender: latestByBreakdown.get("gender") ?? [],
    },
    dataGaps: gaps,
    generatedAt: new Date().toISOString(),
  };
}

/** UI helper: recent media includes the planner link title when confirmed. */
export function mediaFormatLabel(item: MediaMetric): string {
  return contentFormatLabel(item.mediaProductType, item.mediaType);
}
