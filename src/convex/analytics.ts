import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { assertMember, currentUserWorkspace, requireWorkspace } from "./lib/auth";
import { logActivity } from "./lib/activity";
import {
  buildAnalyticsSnapshot,
  getLatestConnection,
} from "./lib/analyticsData";
import { suggestPlannerEntries, type PlannerCandidate } from "../lib/analytics";

const nullableNumber = v.union(v.number(), v.null());
const periodKey = v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"));

/** Everything the Intelligence page needs for one selected period. */
export const dashboard = query({
  args: { period: periodKey },
  handler: async (ctx, args) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) return null;
    const workspace = await ctx.db.get(session.workspaceId);
    if (!workspace) return null;
    const connection = await getLatestConnection(ctx, session.workspaceId);
    const isOwner = workspace.ownerId === session.userId;

    if (!connection) {
      return {
        isOwner,
        connection: null,
        snapshot: null,
        reports: [],
        recommendations: [],
        insights: [],
        syncRuns: [],
        plannerEntries: [],
        linkedEntries: [],
      };
    }

    const [snapshot, reportRows, recommendationRows, insightRows, syncRuns, entries, links] =
      await Promise.all([
        buildAnalyticsSnapshot(ctx, session.workspaceId, args.period),
        ctx.db
          .query("intelligenceReports")
          .withIndex("by_workspace_created", (q) =>
            q.eq("workspaceId", session.workspaceId),
          )
          .order("desc")
          .take(20),
        ctx.db
          .query("intelligenceRecommendations")
          .withIndex("by_workspace_created", (q) =>
            q.eq("workspaceId", session.workspaceId),
          )
          .order("desc")
          .take(20),
        ctx.db
          .query("intelligenceInsights")
          .withIndex("by_workspace_created", (q) =>
            q.eq("workspaceId", session.workspaceId),
          )
          .order("desc")
          .take(10),
        ctx.db
          .query("analyticsSyncRuns")
          .withIndex("by_connection_started", (q) =>
            q.eq("connectionId", connection._id),
          )
          .order("desc")
          .take(5),
        ctx.db
          .query("marketingEntries")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", session.workspaceId),
          )
          .take(120),
        ctx.db
          .query("analyticsContentLinks")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", session.workspaceId),
          )
          .collect(),
      ]);

    const expired =
      connection.status === "connected" &&
      connection.tokenExpiresAt !== undefined &&
      connection.tokenExpiresAt < Date.now();

    return {
      isOwner,
      connection: {
        id: connection._id,
        provider: connection.provider,
        username: connection.username ?? null,
        accountType: connection.accountType ?? null,
        profilePictureUrl: connection.profilePictureUrl ?? null,
        status: expired ? "needsReauth" : connection.status,
        statusMessage: expired
          ? "The Instagram access token expired. Reconnect to resume collection."
          : (connection.statusMessage ?? null),
        connectedAt: connection.connectedAt,
        lastSyncedAt: connection.lastSyncedAt ?? null,
        lastSyncStatus: connection.lastSyncStatus ?? null,
        lastSyncError: connection.lastSyncError ?? null,
        tokenExpiresAt: connection.tokenExpiresAt ?? null,
      },
      snapshot,
      reports: reportRows
        .filter((report) => report.connectionId === connection._id)
        .slice(0, 8),
      recommendations: recommendationRows
        .filter(
          (row) =>
            row.connectionId === connection._id &&
            row.periodKey === args.period,
        )
        .slice(0, 12),
      insights: insightRows
        .filter(
          (row) =>
            row.connectionId === connection._id &&
            row.periodKey === args.period,
        )
        .slice(0, 6),
      syncRuns: syncRuns.map((run) => ({
        id: run._id,
        trigger: run.trigger,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
        metricsStored: run.metricsStored ?? null,
        error: run.error ?? null,
      })),
      plannerEntries: entries
        .filter((entry) => entry.platform === "instagram")
        .map((entry) => ({
          id: entry._id,
          title: entry.title,
          platform: entry.platform,
          status: entry.status,
          scheduledAt: entry.scheduledAt ?? null,
        })),
      linkedEntries: links
        .filter((link) => link.connectionId === connection._id)
        .map((link) => ({
          id: link._id,
          mediaId: link.mediaId,
          marketingEntryId: link.marketingEntryId,
        })),
    };
  },
});

/** Raw normalized snapshot for report generation and assistant context. */
export const snapshot = query({
  args: { period: periodKey },
  handler: async (ctx, args) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) return null;
    return await buildAnalyticsSnapshot(ctx, session.workspaceId, args.period);
  },
});

/** Internal: idempotent analytics storage after a sync. */
export const storeData = internalMutation({
  args: {
    connectionId: v.id("integrationConnections"),
    daily: v.array(
      v.object({
        date: v.string(),
        followers: nullableNumber,
        reach: nullableNumber,
        views: nullableNumber,
        interactions: nullableNumber,
        accountsEngaged: nullableNumber,
        profileVisits: nullableNumber,
        follows: nullableNumber,
        unfollows: nullableNumber,
        mediaCount: nullableNumber,
        capturedAt: v.number(),
      }),
    ),
    periods: v.array(
      v.object({
        periodKey: v.string(),
        window: v.union(v.literal("current"), v.literal("previous")),
        periodStart: v.number(),
        periodEnd: v.number(),
        capturedAt: v.number(),
        reach: nullableNumber,
        views: nullableNumber,
        interactions: nullableNumber,
        accountsEngaged: nullableNumber,
        profileVisits: nullableNumber,
        follows: nullableNumber,
        unfollows: nullableNumber,
        followerChange: nullableNumber,
        followersEnd: nullableNumber,
        mediaCount: nullableNumber,
      }),
    ),
    media: v.array(
      v.object({
        mediaId: v.string(),
        mediaType: v.string(),
        mediaProductType: v.optional(v.string()),
        caption: v.optional(v.string()),
        permalink: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
        timestamp: v.number(),
        likeCount: nullableNumber,
        commentsCount: nullableNumber,
        reach: nullableNumber,
        views: nullableNumber,
        saves: nullableNumber,
        shares: nullableNumber,
        profileVisits: nullableNumber,
        follows: nullableNumber,
        interactions: nullableNumber,
        capturedAt: v.number(),
      }),
    ),
    audience: v.array(
      v.object({
        capturedAt: v.number(),
        timeframe: v.string(),
        breakdown: v.union(
          v.literal("age"),
          v.literal("country"),
          v.literal("gender"),
          v.literal("city"),
        ),
        values: v.array(
          v.object({ label: v.string(), value: v.number() }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) throw new Error("Connection not found");
    const workspaceId = connection.workspaceId;

    for (const row of args.daily) {
      const existing = await ctx.db
        .query("analyticsAccountDaily")
        .withIndex("by_connection_date", (q) =>
          q.eq("connectionId", connection._id).eq("date", row.date),
        )
        .first();
      const payload = {
        ...row,
        workspaceId,
        connectionId: connection._id,
        provider: connection.provider,
      };
      if (existing) await ctx.db.patch(existing._id, payload);
      else await ctx.db.insert("analyticsAccountDaily", payload);
    }

    for (const row of args.periods) {
      const existing = await ctx.db
        .query("analyticsPeriods")
        .withIndex("by_connection_period", (q) =>
          q
            .eq("connectionId", connection._id)
            .eq("periodKey", row.periodKey)
            .eq("window", row.window),
        )
        .first();
      const payload = {
        ...row,
        workspaceId,
        connectionId: connection._id,
        provider: connection.provider,
      };
      if (existing) await ctx.db.patch(existing._id, payload);
      else await ctx.db.insert("analyticsPeriods", payload);
    }

    for (const row of args.media) {
      const existing = await ctx.db
        .query("analyticsMedia")
        .withIndex("by_connection_media", (q) =>
          q
            .eq("connectionId", connection._id)
            .eq("mediaId", row.mediaId),
        )
        .first();
      const payload = {
        ...row,
        workspaceId,
        connectionId: connection._id,
        provider: connection.provider,
        updatedAt: Date.now(),
      };
      if (existing) await ctx.db.patch(existing._id, payload);
      else await ctx.db.insert("analyticsMedia", payload);
    }

    // Demographics are snapshots, not time series. Keep each sync's snapshot
    // so a later report can state exactly which capture it used.
    for (const row of args.audience) {
      await ctx.db.insert("analyticsAudience", {
        ...row,
        workspaceId,
        connectionId: connection._id,
        provider: connection.provider,
      });
    }

    return {
      daily: args.daily.length,
      periods: args.periods.length,
      media: args.media.length,
      audience: args.audience.length,
    };
  },
});

/** Optional link suggestions. These never create a confirmed match. */
export const linkSuggestions = query({
  args: { mediaId: v.id("analyticsMedia") },
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.mediaId);
    if (!media) return [];
    await assertMember(ctx, media.workspaceId);
    const [entries, links] = await Promise.all([
      ctx.db
        .query("marketingEntries")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", media.workspaceId),
        )
        .collect(),
      ctx.db
        .query("analyticsContentLinks")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", media.workspaceId),
        )
        .collect(),
    ]);
    const linkedEntryIds = new Set(links.map((link) => link.marketingEntryId));
    const available: PlannerCandidate[] = entries
      .filter(
        (entry) =>
          entry.platform === "instagram" &&
          entry.workspaceId === media.workspaceId &&
          !linkedEntryIds.has(entry._id),
      )
      .map((entry) => ({
        id: entry._id,
        title: entry.title,
        platform: entry.platform,
        status: entry.status,
        scheduledAt: entry.scheduledAt ?? null,
        body: entry.body,
      }));
    return suggestPlannerEntries(
      { caption: media.caption ?? null, timestamp: media.timestamp },
      available,
    );
  },
});

/** Confirm a link between measured Instagram media and a planner entry. */
export const linkMedia = mutation({
  args: {
    mediaId: v.id("analyticsMedia"),
    marketingEntryId: v.id("marketingEntries"),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.mediaId);
    if (!media) throw new ConvexError("Measured media not found");
    const userId = await assertMember(ctx, media.workspaceId);
    const entry = await ctx.db.get(args.marketingEntryId);
    if (!entry || entry.workspaceId !== media.workspaceId) {
      throw new ConvexError("Planner entry not found in this workspace");
    }
    if (entry.platform !== "instagram") {
      throw new ConvexError("Only an Instagram planner entry can be linked");
    }

    const existingForEntry = await ctx.db
      .query("analyticsContentLinks")
      .withIndex("by_workspace_entry", (q) =>
        q
          .eq("workspaceId", media.workspaceId)
          .eq("marketingEntryId", entry._id),
      )
      .first();
    if (existingForEntry && existingForEntry.mediaId !== media._id) {
      throw new ConvexError("That planner entry is already linked to another post");
    }

    const existingForMedia = await ctx.db
      .query("analyticsContentLinks")
      .withIndex("by_media", (q) => q.eq("mediaId", media._id))
      .first();
    const now = Date.now();
    if (existingForMedia) {
      await ctx.db.patch(existingForMedia._id, {
        marketingEntryId: entry._id,
        matchSource: "manual",
        confidence: undefined,
        linkedBy: userId,
        updatedAt: now,
      });
      return { ok: true as const, linkId: existingForMedia._id };
    }
    const linkId = await ctx.db.insert("analyticsContentLinks", {
      workspaceId: media.workspaceId,
      connectionId: media.connectionId,
      mediaId: media._id,
      marketingEntryId: entry._id,
      matchSource: "manual",
      linkedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, linkId };
  },
});

export const unlinkMedia = mutation({
  args: { linkId: v.id("analyticsContentLinks") },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) return { ok: true as const };
    await assertMember(ctx, link.workspaceId);
    await ctx.db.delete(args.linkId);
    return { ok: true as const };
  },
});

async function deleteWorkspaceAnalytics(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
) {
  const daily = await ctx.db
    .query("analyticsAccountDaily")
    .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of daily) await ctx.db.delete(row._id);

  const periods = await ctx.db
    .query("analyticsPeriods")
    .withIndex("by_workspace_period", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of periods) await ctx.db.delete(row._id);

  const media = await ctx.db
    .query("analyticsMedia")
    .withIndex("by_workspace_timestamp", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of media) await ctx.db.delete(row._id);

  const links = await ctx.db
    .query("analyticsContentLinks")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of links) await ctx.db.delete(row._id);

  const runs = await ctx.db
    .query("analyticsSyncRuns")
    .withIndex("by_workspace_started", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of runs) await ctx.db.delete(row._id);

  const audience = await ctx.db
    .query("analyticsAudience")
    .withIndex("by_workspace_captured", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of audience) await ctx.db.delete(row._id);

  const reports = await ctx.db
    .query("intelligenceReports")
    .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of reports) await ctx.db.delete(row._id);

  const insights = await ctx.db
    .query("intelligenceInsights")
    .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of insights) await ctx.db.delete(row._id);

  const recommendations = await ctx.db
    .query("intelligenceRecommendations")
    .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of recommendations) await ctx.db.delete(row._id);
}

/** Owner-only explicit deletion. The Instagram connection is preserved. */
export const deleteAnalytics = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, workspaceId } = await requireWorkspace(ctx);
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace || workspace.ownerId !== userId) {
      throw new ConvexError("Only the workspace owner can delete analytics");
    }
    await deleteWorkspaceAnalytics(ctx, workspaceId);
    const connection = await getLatestConnection(ctx, workspaceId);
    if (connection) {
      await ctx.db.patch(connection._id, {
        lastSyncedAt: undefined,
        lastSyncStatus: undefined,
        lastSyncError: undefined,
        updatedAt: Date.now(),
      });
    }
    await logActivity(ctx, {
      workspaceId,
      actor: "user",
      action: "analytics.deleted",
      detail: "Deleted stored Instagram analytics, reports, insights and recommendations.",
      route: "/app/settings",
    });
    return { ok: true as const };
  },
});
