"use node";

/**
 * Instagram connection and synchronization actions.
 *
 * Only this server-side module ever sees plaintext access tokens. Tokens are
 * decrypted for a request, used, and never logged or returned. All persisted
 * analytics are normalized before they enter the provider-independent engine.
 */

import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  type ActionCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  authorizationUrl,
  exchangeAuthorizationCode,
  exchangeLongLivedToken,
  fetchAccountInsight,
  fetchAccountTimeSeries,
  fetchDemographicInsight,
  fetchFollowerSeries,
  fetchMediaInsight,
  fetchProfile,
  fetchRecentMedia,
  getInstagramConfig,
  isInstagramAuthError,
  refreshLongLivedToken,
  type InstagramMedia,
  type InstagramProfile,
} from "./lib/meta";
import {
  decryptSecret,
  encryptSecret,
  randomHex,
  sha256Hex,
} from "./lib/crypto";
import {
  PERIOD_DAYS,
  type PeriodKey,
  type PeriodMetrics,
} from "../lib/analytics";
import {
  shouldRefreshToken,
  tokenExpiresAt as computeTokenExpiry,
} from "./lib/token";

const DAY = 86_400_000;
const RANGE_KEYS: PeriodKey[] = ["7d", "30d", "90d"];

interface SyncRange {
  key: PeriodKey;
  window: "current" | "previous";
  start: number;
  end: number;
}

interface AccountTotals {
  reach: number | null;
  views: number | null;
  interactions: number | null;
  accountsEngaged: number | null;
  follows: number | null;
  unfollows: number | null;
  errors: string[];
}

function authorizationRanges(now: number): SyncRange[] {
  return RANGE_KEYS.flatMap((key) => {
    const duration = PERIOD_DAYS[key] * DAY;
    return [
      {
        key,
        window: "current" as const,
        start: now - duration,
        end: now,
      },
      {
        key,
        window: "previous" as const,
        start: now - duration * 2,
        end: now - duration,
      },
    ];
  });
}

function parseFollowBreakdown(
  breakdown: Array<{ key: string; value: number }>,
): { follows: number | null; unfollows: number | null } {
  // Only treat this as follows/unfollows when the API actually returns an
  // unfollow dimension. A follower/non-follower breakdown is a different
  // metric and must not be mislabeled.
  if (!breakdown.some((item) => item.key.toLowerCase().includes("unfollow"))) {
    return { follows: null, unfollows: null };
  }
  let follows: number | null = null;
  let unfollows: number | null = null;
  for (const item of breakdown) {
    const key = item.key.toLowerCase();
    if (key.includes("unfollow")) unfollows = item.value;
    else if (key.includes("follow")) follows = item.value;
  }
  return { follows, unfollows };
}

async function fetchTotals(
  accountId: string,
  token: string,
  start: number,
  end: number,
): Promise<AccountTotals> {
  const errors: string[] = [];
  const metrics = [
    "reach",
    "views",
    "total_interactions",
    "accounts_engaged",
    "follows_and_unfollows",
  ] as const;
  const results = await Promise.all(
    metrics.map(async (metric) => {
      try {
        return {
          metric,
          result: await fetchAccountInsight(
            accountId,
            token,
            metric,
            start,
            end,
          ),
          error: null as string | null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "request failed";
        errors.push(`${metric}: ${message.slice(0, 160)}`);
        return { metric, result: null, error: message };
      }
    }),
  );
  const byMetric = new Map(results.map((row) => [row.metric, row.result]));
  const follow = parseFollowBreakdown(
    byMetric.get("follows_and_unfollows")?.breakdown ?? [],
  );
  return {
    reach: byMetric.get("reach")?.value ?? null,
    views: byMetric.get("views")?.value ?? null,
    interactions: byMetric.get("total_interactions")?.value ?? null,
    accountsEngaged: byMetric.get("accounts_engaged")?.value ?? null,
    follows: follow.follows,
    unfollows: follow.unfollows,
    errors,
  };
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function followerAt(
  series: Array<{ date: string; value: number }>,
  end: number,
): number | null {
  let value: number | null = null;
  for (const point of series) {
    const timestamp = Date.parse(point.date);
    if (Number.isFinite(timestamp) && timestamp <= end + DAY) {
      value = point.value;
    }
  }
  return value;
}

function followerDelta(
  series: Array<{ date: string; value: number }>,
  start: number,
  end: number,
): number | null {
  const inRange = series
    .map((point) => ({ ...point, timestamp: Date.parse(point.date) }))
    .filter(
      (point) =>
        Number.isFinite(point.timestamp) &&
        point.timestamp >= start &&
        point.timestamp <= end + DAY,
    );
  if (inRange.length < 2) return null;
  return inRange[inRange.length - 1].value - inRange[0].value;
}

function mediaMetricsFor(media: InstagramMedia): string[] {
  if ((media.mediaProductType ?? "").toUpperCase() === "STORY") {
    return ["reach", "views", "replies", "shares"];
  }
  return ["reach", "views", "likes", "comments", "saved", "shares"];
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

async function syncConnection(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  connectionId: Id<"integrationConnections">,
  syncRunId: Id<"analyticsSyncRuns">,
): Promise<{
  status: "success" | "partial";
  metricsStored: number;
  warnings: string[];
  syncedAt: number;
}> {
  const config = getInstagramConfig();
  if (!config.configured || !config.encryptionKey) {
    throw new ConvexError(
      `Instagram is not configured. Missing: ${config.missing.join(", ")}`,
    );
  }
  const connection = await ctx.runQuery(
    internal.integrations.connectionForSync,
    { workspaceId },
  );
  if (!connection || connection._id !== connectionId) {
    throw new ConvexError("Instagram connection not found");
  }
  if (!connection.accessTokenCiphertext) {
    await ctx.runMutation(internal.integrations.markSyncError, {
      connectionId: connection._id,
      syncRunId,
      message: "Instagram needs to be reconnected",
      needsReauth: true,
    });
    throw new ConvexError("Instagram needs to be reconnected");
  }

  let accessToken = await decryptSecret(
    connection.accessTokenCiphertext,
    config.encryptionKey,
  );
  let tokenExpiresAt = connection.tokenExpiresAt;
  const warnings: string[] = [];

  // Long-lived tokens last 60 days; refresh proactively when under 7 days.
  if (shouldRefreshToken(tokenExpiresAt, connection.connectedAt)) {
    try {
      const refreshed = await refreshLongLivedToken(accessToken);
      accessToken = refreshed.accessToken;
      tokenExpiresAt = computeTokenExpiry(refreshed.expiresIn);
      await ctx.runMutation(internal.integrations.updateToken, {
        connectionId: connection._id,
        accessTokenCiphertext: await encryptSecret(
          accessToken,
          config.encryptionKey,
        ),
        tokenExpiresAt,
      });
    } catch {
      if (tokenExpiresAt !== undefined && tokenExpiresAt < Date.now()) {
        await ctx.runMutation(internal.integrations.markSyncError, {
          connectionId: connection._id,
          syncRunId,
          message: "Instagram token expired and could not be refreshed.",
          needsReauth: true,
        });
        throw new ConvexError("Instagram needs to be reconnected");
      }
      warnings.push("Token refresh failed; the current valid token was used.");
    }
  }

  let profile: InstagramProfile;
  try {
    profile = await fetchProfile(accessToken);
  } catch (error) {
    const auth = isInstagramAuthError(error);
    await ctx.runMutation(internal.integrations.markSyncError, {
      connectionId: connection._id,
      syncRunId,
      message: auth
        ? "Instagram access expired or was revoked."
        : error instanceof Error
          ? error.message
          : "Instagram profile request failed.",
      needsReauth: auth,
    });
    throw new ConvexError(
      auth
        ? "Instagram needs to be reconnected"
        : "Instagram could not be reached. Try again shortly.",
    );
  }

  const accountId = profile.userId || profile.id;
  if (!accountId) {
    await ctx.runMutation(internal.integrations.markSyncError, {
      connectionId: connection._id,
      syncRunId,
      message: "Instagram did not return a professional account ID.",
      needsReauth: true,
    });
    throw new ConvexError("Instagram needs to be reconnected");
  }

  const now = Date.now();
  const ranges = authorizationRanges(now);
  const [recentMedia, followerSeries, reachSeries, demographicSets] =
    await Promise.all([
      fetchRecentMedia(accountId, accessToken, 50).catch((error) => {
        warnings.push(
          `Media list: ${error instanceof Error ? error.message.slice(0, 120) : "unavailable"}`,
        );
        return [] as InstagramMedia[];
      }),
      fetchFollowerSeries(accountId, accessToken, now - 90 * DAY, now).catch(
        () => {
          warnings.push("Follower history is unavailable for this account.");
          return [] as Array<{ date: string; value: number }>;
        },
      ),
      fetchAccountTimeSeries(
        accountId,
        accessToken,
        "reach",
        now - 90 * DAY,
        now,
      ).catch(() => {
        warnings.push("Daily reach series is unavailable.");
        return [] as Array<{ date: string; value: number }>;
      }),
      Promise.all(
        (["country", "age", "gender"] as const).map(async (breakdown) => {
          try {
            return {
              breakdown,
              values: await fetchDemographicInsight(
                accountId,
                accessToken,
                "follower_demographics",
                breakdown,
              ),
            };
          } catch {
            return { breakdown, values: [] };
          }
        }),
      ),
    ]);

  const mediaRows = [];
  for (let index = 0; index < recentMedia.length; index += 5) {
    const chunk = recentMedia.slice(index, index + 5);
    const rows = await Promise.all(
      chunk.map(async (media) => {
        let insights: Record<string, number | null> = {};
        try {
          insights = await fetchMediaInsight(
            media.id,
            accessToken,
            mediaMetricsFor(media),
          );
        } catch {
          // An album or an expired story can legitimately return no insight
          // data. The basic public counts still remain valid.
        }
        const likes =
          insights.likes !== undefined && insights.likes !== null
            ? insights.likes
            : media.likeCount;
        const comments =
          insights.comments !== undefined && insights.comments !== null
            ? insights.comments
            : media.commentsCount;
        const knownInteractions = [
          likes,
          comments,
          insights.saved ?? null,
          insights.shares ?? null,
          insights.replies ?? null,
        ];
        return {
          mediaId: media.id,
          mediaType: media.mediaType,
          mediaProductType: media.mediaProductType ?? undefined,
          caption: media.caption ?? undefined,
          permalink: media.permalink ?? undefined,
          thumbnailUrl: media.thumbnailUrl ?? undefined,
          timestamp: media.timestamp,
          likeCount: likes ?? null,
          commentsCount: comments ?? null,
          reach: insights.reach ?? null,
          views: insights.views ?? null,
          saves: insights.saved ?? null,
          shares: insights.shares ?? null,
          profileVisits: insights.profile_visits ?? null,
          follows: insights.follows ?? null,
          interactions: sumKnown(knownInteractions),
          capturedAt: now,
        };
      }),
    );
    mediaRows.push(...rows);
  }

  const periodRows = [];
  const accountMetricErrors: string[] = [];
  for (const range of ranges) {
    const totals = await fetchTotals(
      accountId,
      accessToken,
      range.start,
      range.end,
    );
    accountMetricErrors.push(...totals.errors);
    const splitChange =
      totals.follows !== null && totals.unfollows !== null
        ? totals.follows - totals.unfollows
        : null;
    const followersEnd =
      followerAt(followerSeries, range.end) ??
      (range.end >= now - DAY ? profile.followersCount : null);
    const mediaCount = mediaRows.filter(
      (media) =>
        media.timestamp >= range.start && media.timestamp <= range.end,
    ).length;
    const metrics: PeriodMetrics = {
      followers: followersEnd,
      reach: totals.reach,
      views: totals.views,
      interactions: totals.interactions,
      accountsEngaged: totals.accountsEngaged,
      profileVisits: null,
      follows: totals.follows,
      unfollows: totals.unfollows,
      followerChange:
        splitChange ?? followerDelta(followerSeries, range.start, range.end),
      mediaCount,
    };
    periodRows.push({
      periodKey: range.key,
      window: range.window,
      periodStart: range.start,
      periodEnd: range.end,
      capturedAt: now,
      reach: metrics.reach,
      views: metrics.views,
      interactions: metrics.interactions,
      accountsEngaged: metrics.accountsEngaged,
      profileVisits: metrics.profileVisits,
      follows: metrics.follows,
      unfollows: metrics.unfollows,
      followerChange: metrics.followerChange,
      followersEnd: metrics.followers,
      mediaCount: metrics.mediaCount,
    });
  }

  const followerByDay = new Map<string, number>();
  for (const point of followerSeries) {
    const timestamp = Date.parse(point.date);
    if (Number.isFinite(timestamp)) followerByDay.set(dayKey(new Date(timestamp)), point.value);
  }
  if (profile.followersCount !== null) {
    followerByDay.set(dayKey(new Date(now)), profile.followersCount);
  }
  const reachByDay = new Map<string, number>();
  for (const point of reachSeries) {
    const timestamp = Date.parse(point.date);
    if (Number.isFinite(timestamp)) reachByDay.set(dayKey(new Date(timestamp)), point.value);
  }
  const mediaByDay = new Map<string, number>();
  for (const media of mediaRows) {
    const key = dayKey(new Date(media.timestamp));
    mediaByDay.set(key, (mediaByDay.get(key) ?? 0) + 1);
  }
  const allDays = new Set([
    ...followerByDay.keys(),
    ...reachByDay.keys(),
    ...mediaByDay.keys(),
  ]);
  const daily = [...allDays]
    .sort()
    .filter((day) => {
      const timestamp = Date.parse(day);
      return timestamp >= now - 90 * DAY;
    })
    .map((day) => ({
      date: day,
      followers: followerByDay.get(day) ?? null,
      reach: reachByDay.get(day) ?? null,
      views: null,
      interactions: null,
      accountsEngaged: null,
      profileVisits: null,
      follows: null,
      unfollows: null,
      mediaCount: mediaByDay.get(day) ?? null,
      capturedAt: now,
    }));

  const audience = demographicSets
    .filter((set) => set.values.length > 0)
    .map((set) => ({
      capturedAt: now,
      timeframe: "last_30_days",
      breakdown: set.breakdown,
      values: set.values,
    }));

  const stored = await ctx.runMutation(internal.analytics.storeData, {
    connectionId: connection._id,
    daily,
    periods: periodRows,
    media: mediaRows,
    audience,
  });

  for (const period of RANGE_KEYS) {
    await ctx.runMutation(internal.recommendations.refreshForConnection, {
      connectionId: connection._id,
      period,
    });
  }

  const metricsStored =
    stored.daily + stored.periods + stored.media + stored.audience;
  const partial = accountMetricErrors.length > 0 || warnings.length > 0;
  await ctx.runMutation(internal.integrations.finishSync, {
    connectionId: connection._id,
    syncRunId,
    status: partial ? "partial" : "success",
    metricsStored,
    dataAt: now,
  });

  return {
    status: partial ? "partial" : "success",
    metricsStored,
    warnings: [...new Set([...warnings, ...accountMetricErrors])].slice(0, 6),
    syncedAt: now,
  };
}

/** Safe configuration state for the Integrations UI. */
interface ActionAccess {
  userId: Id<"users">;
  workspaceId: Id<"workspaces">;
  isOwner: boolean;
  canManage: boolean;
}

export const configStatus = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    configured: boolean;
    missing: string[];
    redirectUri: string | null;
    graphVersion: string;
    canManage: boolean;
  }> => {
    const access = (await ctx.runQuery(
      api.integrations.access,
      {},
    )) as ActionAccess | null;
    if (!access) throw new Error("Not authenticated");
    const config = getInstagramConfig();
    return {
      configured: config.configured,
      missing: config.missing,
      redirectUri: config.redirectUri,
      graphVersion: config.graphVersion,
      canManage: access.isOwner,
    };
  },
});

export const beginOAuth = action({
  args: { forceReauth: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(api.integrations.requireOwnerForAction, {});
    const config = getInstagramConfig();
    if (!config.configured) {
      return {
        configured: false as const,
        missing: config.missing,
        redirectUri: config.redirectUri,
      };
    }
    const state = randomHex(32);
    const stateHash = await sha256Hex(state);
    await ctx.runMutation(internal.integrations.saveOAuthState, {
      workspaceId: access.workspaceId,
      userId: access.userId,
      stateHash,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return {
      configured: true as const,
      url: authorizationUrl(state, args.forceReauth ?? false),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
  },
});

/** One-time OAuth completion called only by the validated HTTP callback. */
export const completeOAuth = internalAction({
  args: {
    code: v.string(),
    state: v.string(),
  },
  handler: async (ctx, args): Promise<{
    workspaceId: string;
    username: string | null;
    syncStatus: "success" | "partial" | "pending";
  }> => {
    const config = getInstagramConfig();
    if (!config.configured || !config.appSecret || !config.encryptionKey) {
      throw new Error("Instagram is not configured");
    }
    const stateHash = await sha256Hex(args.state);
    const binding = await ctx.runMutation(
      internal.integrations.consumeOAuthState,
      { stateHash },
    );

    try {
      const short = await exchangeAuthorizationCode(args.code);
      if (!short.permissions.includes("instagram_business_manage_insights")) {
        throw new Error(
          "The Instagram insights permission was not granted. Reconnect and allow insights access.",
        );
      }
      const long = await exchangeLongLivedToken(short.accessToken);
      const profile = await fetchProfile(long.accessToken);
      if (!profile.userId) throw new Error("Instagram did not return an account ID");
      const expiry = computeTokenExpiry(long.expiresIn);
      const connectionId = await ctx.runMutation(
        internal.integrations.saveConnection,
        {
          workspaceId: binding.workspaceId,
          userId: binding.userId,
          providerAccountId: profile.userId,
          appScopedUserId: profile.id || undefined,
          username: profile.username || undefined,
          accountType: profile.accountType ?? undefined,
          profilePictureUrl: profile.profilePictureUrl ?? undefined,
          accessTokenCiphertext: await encryptSecret(
            long.accessToken,
            config.encryptionKey,
          ),
          tokenExpiresAt: expiry,
          scopes: short.permissions,
        },
      );

      // Initial sync is part of connection, but a sync failure must not undo a
      // valid OAuth connection. The UI can retry with a real error message.
      let syncStatus: "success" | "partial" | "pending" = "pending";
      let initialSyncRunId: Id<"analyticsSyncRuns"> | null = null;
      try {
        const started = await ctx.runMutation(internal.integrations.beginSync, {
          workspaceId: binding.workspaceId,
          trigger: "initial",
        });
        if (!started.busy) {
          initialSyncRunId = started.syncRunId;
          const result = await syncConnection(
            ctx,
            binding.workspaceId,
            connectionId,
            started.syncRunId,
          );
          syncStatus = result.status;
        }
      } catch (error) {
        if (initialSyncRunId) {
          await ctx.runMutation(internal.integrations.failSyncRun, {
            syncRunId: initialSyncRunId,
            message:
              error instanceof Error
                ? error.message.slice(0, 280)
                : "Initial Instagram sync failed",
          });
        }
        console.warn(
          "[ocivo] initial Instagram sync did not complete:",
          error instanceof Error ? error.message : error,
        );
      }

      return {
        workspaceId: binding.workspaceId,
        username: profile.username || null,
        syncStatus,
      };
    } catch (error) {
      await ctx.runMutation(internal.integrations.recordOAuthFailure, {
        workspaceId: binding.workspaceId,
        userId: binding.userId,
        message:
          error instanceof Error
            ? error.message.slice(0, 280)
            : "Instagram connection failed",
      });
      throw new ConvexError(
        error instanceof Error
          ? error.message.slice(0, 280)
          : "Instagram connection failed",
      );
    }
  },
});

export const syncNow = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    status: "success" | "partial" | "busy";
    metricsStored: number;
    warnings: string[];
    syncedAt: number | null;
  }> => {
    const access = (await ctx.runQuery(
      api.integrations.requireOwnerForAction,
      {},
    )) as { userId: Id<"users">; workspaceId: Id<"workspaces"> };
    const config = getInstagramConfig();
    if (!config.configured) {
      throw new ConvexError(
        `Instagram is not configured. Missing: ${config.missing.join(", ")}`,
      );
    }
    const started = (await ctx.runMutation(
      internal.integrations.beginSync,
      {
        workspaceId: access.workspaceId,
        trigger: "manual",
      },
    )) as
      | { busy: true; connectionId: Id<"integrationConnections"> }
      | {
          busy: false;
          connectionId: Id<"integrationConnections">;
          syncRunId: Id<"analyticsSyncRuns">;
        };
    if (started.busy) {
      return {
        status: "busy" as const,
        metricsStored: 0,
        warnings: ["A synchronization is already running."],
        syncedAt: null,
      };
    }
    try {
      return await syncConnection(
        ctx,
        access.workspaceId,
        started.connectionId,
        started.syncRunId,
      );
    } catch (error) {
      await ctx.runMutation(internal.integrations.failSyncRun, {
        syncRunId: started.syncRunId,
        message:
          error instanceof Error ? error.message.slice(0, 280) : "Synchronization failed",
      });
      throw error;
    }
  },
});

/** Scheduled entry point. Individual connection failures stay isolated. */
export const scheduledSync = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    skipped: boolean;
    connections: number;
    synced?: number;
    failed?: number;
  }> => {
    const config = getInstagramConfig();
    if (!config.configured) return { skipped: true, connections: 0 };
    const connections = (await ctx.runQuery(
      internal.integrations.activeConnectionsForSync,
      {},
    )) as Array<{
      workspaceId: Id<"workspaces">;
      connectionId: Id<"integrationConnections">;
    }>;
    let synced = 0;
    let failed = 0;
    for (const connection of connections) {
      let activeRunId: Id<"analyticsSyncRuns"> | null = null;
      try {
        const started = await ctx.runMutation(internal.integrations.beginSync, {
          workspaceId: connection.workspaceId,
          trigger: "scheduled",
        });
        if (started.busy) continue;
        activeRunId = started.syncRunId;
        await syncConnection(
          ctx,
          connection.workspaceId,
          started.connectionId,
          started.syncRunId,
        );
        synced++;
      } catch (error) {
        if (activeRunId) {
          await ctx.runMutation(internal.integrations.failSyncRun, {
            syncRunId: activeRunId,
            message:
              error instanceof Error
                ? error.message.slice(0, 280)
                : "Scheduled synchronization failed",
          });
        }
        failed++;
      }
    }
    return { skipped: false, connections: connections.length, synced, failed };
  },
});
