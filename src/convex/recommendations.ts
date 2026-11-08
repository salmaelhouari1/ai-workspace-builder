import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { assertMember, requireWorkspace } from "./lib/auth";
import { logActivity } from "./lib/activity";
import { buildAnalyticsSnapshot } from "./lib/analyticsData";
import {
  buildRecommendationSeeds,
  type PeriodKey,
  type RecommendationSeed,
} from "../lib/analytics";

const periodKey = v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"));

async function upsertSeeds(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  connectionId: Id<"integrationConnections">,
  period: PeriodKey,
  seeds: RecommendationSeed[],
) {
  const existing = await ctx.db
    .query("intelligenceRecommendations")
    .withIndex("by_workspace_fingerprint", (q) =>
      q.eq("workspaceId", workspaceId),
    )
    .collect();
  const byFingerprint = new Map(
    existing
      .filter((row) => row.connectionId === connectionId)
      .map((row) => [row.fingerprint, row]),
  );
  const now = Date.now();
  let created = 0;
  let updated = 0;
  for (const seed of seeds) {
    const current = byFingerprint.get(seed.fingerprint);
    if (current) {
      // Never overwrite a user's saved, dismissed or actioned decision.
      await ctx.db.patch(current._id, {
        title: seed.title.slice(0, 160),
        explanation: seed.explanation.slice(0, 1200),
        evidence: seed.evidence.slice(0, 6).map((item) => ({
          label: item.label.slice(0, 120),
          value: item.value.slice(0, 200),
        })),
        confidence: seed.confidence,
        suggestedAction: seed.suggestedAction.slice(0, 1000),
        potentialBenefit: seed.potentialBenefit.slice(0, 700),
        source: "deterministic",
        updatedAt: now,
      });
      updated++;
    } else {
      await ctx.db.insert("intelligenceRecommendations", {
        workspaceId,
        connectionId,
        periodKey: period,
        fingerprint: seed.fingerprint.slice(0, 220),
        title: seed.title.slice(0, 160),
        explanation: seed.explanation.slice(0, 1200),
        evidence: seed.evidence.slice(0, 6).map((item) => ({
          label: item.label.slice(0, 120),
          value: item.value.slice(0, 200),
        })),
        confidence: seed.confidence,
        suggestedAction: seed.suggestedAction.slice(0, 1000),
        potentialBenefit: seed.potentialBenefit.slice(0, 700),
        status: "new",
        source: "deterministic",
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
  }
  return { created, updated, total: seeds.length };
}

/** Manual refresh from the Intelligence page. */
export const refresh = mutation({
  args: { period: periodKey },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const snapshot = await buildAnalyticsSnapshot(ctx, workspaceId, args.period);
    if (!snapshot) return { created: 0, updated: 0, total: 0 };
    const connection = await ctx.db
      .query("integrationConnections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "instagram"),
      )
      .collect();
    connection.sort((a, b) => b.updatedAt - a.updatedAt);
    const active = connection[0];
    if (!active) return { created: 0, updated: 0, total: 0 };
    const seeds = buildRecommendationSeeds({
      period: snapshot.period,
      media: snapshot.media,
      businessGoal: snapshot.workspace.mainGoal,
    });
    return await upsertSeeds(
      ctx,
      workspaceId,
      active._id,
      args.period,
      seeds,
    );
  },
});

/** Internal: after a sync. The same deterministic evidence pipeline as manual. */
export const refreshForConnection = internalMutation({
  args: {
    connectionId: v.id("integrationConnections"),
    period: periodKey,
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return { created: 0, updated: 0, total: 0 };
    const snapshot = await buildAnalyticsSnapshot(
      ctx,
      connection.workspaceId,
      args.period,
    );
    if (!snapshot) return { created: 0, updated: 0, total: 0 };
    const seeds = buildRecommendationSeeds({
      period: snapshot.period,
      media: snapshot.media,
      businessGoal: snapshot.workspace.mainGoal,
    });
    return await upsertSeeds(
      ctx,
      connection.workspaceId,
      connection._id,
      args.period,
      seeds,
    );
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const rows = await ctx.db
      .query("intelligenceRecommendations")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(30);
    return rows;
  },
});

/** Save or dismiss. The recommendation text stays available for history. */
export const setStatus = mutation({
  args: {
    recommendationId: v.id("intelligenceRecommendations"),
    status: v.union(v.literal("new"), v.literal("saved"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    const recommendation = await ctx.db.get(args.recommendationId);
    if (!recommendation) throw new ConvexError("Recommendation not found");
    await assertMember(ctx, recommendation.workspaceId);
    if (recommendation.status === "actioned") {
      throw new ConvexError("An actioned recommendation cannot be changed");
    }
    await ctx.db.patch(args.recommendationId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

function evidenceText(
  evidence: Array<{ label: string; value: string }>,
): string {
  return evidence.map((item) => `${item.label}: ${item.value}`).join("\n");
}

/**
 * Turn a recommendation into an existing OCIVO record. The click is the user's
 * confirmation; no external platform is changed.
 */
export const act = mutation({
  args: {
    recommendationId: v.id("intelligenceRecommendations"),
    action: v.union(
      v.literal("createTask"),
      v.literal("addToPlanner"),
      v.literal("createCampaign"),
    ),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const recommendation = await ctx.db.get(args.recommendationId);
    if (!recommendation) throw new ConvexError("Recommendation not found");
    const userId = await assertMember(ctx, recommendation.workspaceId);
    if (recommendation.status === "actioned") {
      throw new ConvexError("This recommendation was already actioned");
    }
    const now = Date.now();
    const workspaceId = recommendation.workspaceId;
    const evidence = evidenceText(recommendation.evidence);

    if (args.action === "createTask") {
      const taskId = await ctx.db.insert("tasks", {
        workspaceId,
        title: recommendation.title.slice(0, 300),
        description: `${recommendation.explanation}\n\nSuggested action: ${recommendation.suggestedAction}\n\nEvidence:\n${evidence}\n\n${recommendation.potentialBenefit}`.slice(
          0,
          8000,
        ),
        status: "todo",
        priority: "medium",
        tags: ["intelligence", "recommendation"],
        reason: recommendation.explanation.slice(0, 500),
        source: "ai",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(recommendation._id, {
        status: "actioned",
        actionRoute: "/app/tasks",
        actionedAt: now,
        updatedAt: now,
      });
      await logActivity(ctx, {
        workspaceId,
        actor: "ai",
        action: "recommendation.task.created",
        detail: `Created task from recommendation "${recommendation.title.slice(0, 80)}"`,
        route: "/app/tasks",
      });
      return { ok: true as const, route: "/app/tasks", taskId };
    }

    if (args.action === "addToPlanner") {
      const entryId = await ctx.db.insert("marketingEntries", {
        workspaceId,
        title: recommendation.title.slice(0, 240),
        contentType: "post",
        platform: "instagram",
        body: `${recommendation.explanation}\n\n**Suggested action:** ${recommendation.suggestedAction}\n\n**Evidence:**\n${evidence}\n\n*${recommendation.potentialBenefit}*`,
        status: args.scheduledAt ? "planned" : "idea",
        scheduledAt: args.scheduledAt,
        pillar: "improvement",
        tags: ["intelligence", "recommendation"],
        workspaceMemberId: userId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(recommendation._id, {
        status: "actioned",
        actionRoute: "/app/marketing",
        actionedAt: now,
        updatedAt: now,
      });
      await logActivity(ctx, {
        workspaceId,
        actor: "ai",
        action: "recommendation.planner.added",
        detail: `Added recommendation "${recommendation.title.slice(0, 80)}" to the Marketing Planner`,
        route: "/app/marketing",
      });
      return { ok: true as const, route: "/app/marketing", entryId };
    }

    const campaignId = await ctx.db.insert("campaigns", {
      workspaceId,
      name: recommendation.title.slice(0, 200),
      objective: "Marketing improvement experiment",
      audience: undefined,
      status: "active",
      notes: `${recommendation.explanation}\n\nHypothesis: ${recommendation.potentialBenefit}\n\nEvidence:\n${evidence}`.slice(
        0,
        4000,
      ),
      workspaceMemberId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("marketingEntries", {
      workspaceId,
      title: recommendation.title.slice(0, 240),
      contentType: "post",
      platform: "instagram",
      body: `**Suggested action:** ${recommendation.suggestedAction}\n\n*${recommendation.potentialBenefit}*`,
      status: "idea",
      campaignId,
      pillar: "improvement",
      tags: ["intelligence", "recommendation"],
      workspaceMemberId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(recommendation._id, {
      status: "actioned",
      actionRoute: "/app/marketing",
      actionedAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      workspaceId,
      actor: "ai",
      action: "recommendation.campaign.created",
      detail: `Created campaign "${recommendation.title.slice(0, 80)}" from an evidence-backed recommendation`,
      route: "/app/marketing",
    });
    return {
      ok: true as const,
      route: "/app/marketing",
      campaignId,
    };
  },
});
