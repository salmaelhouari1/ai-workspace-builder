import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const CACHE_MS = 6 * 60 * 60 * 1000;

const reportType = v.union(
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("content"),
  v.literal("audience"),
  v.literal("improvement"),
);

/** Non-Node storage helpers for the AI report action. */
export const findCached = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    reportType,
    snapshotHash: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("intelligenceReports")
      .withIndex("by_workspace_type", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("reportType", args.reportType),
      )
      .take(20);
    const fresh = rows
      .filter(
        (row) =>
          row.snapshotHash === args.snapshotHash &&
          Date.now() - row.createdAt < CACHE_MS,
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return fresh
      ? { reportId: fresh._id as string, source: fresh.source }
      : null;
  },
});

export const save = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    connectionId: v.id("integrationConnections"),
    reportType,
    periodKey: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
    title: v.string(),
    dataFreshnessAt: v.number(),
    snapshot: v.string(),
    snapshotHash: v.string(),
    content: v.string(),
    source: v.union(v.literal("ai"), v.literal("deterministic")),
    generatedBy: v.id("users"),
    insights: v.array(
      v.object({
        kind: v.union(
          v.literal("observation"),
          v.literal("interpretation"),
          v.literal("opportunity"),
          v.literal("recommendation"),
          v.literal("limitation"),
        ),
        text: v.string(),
        evidence: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const reportId = await ctx.db.insert("intelligenceReports", {
      workspaceId: args.workspaceId,
      connectionId: args.connectionId,
      reportType: args.reportType,
      periodKey: args.periodKey,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      title: args.title,
      dataFreshnessAt: args.dataFreshnessAt,
      snapshot: args.snapshot,
      snapshotHash: args.snapshotHash,
      content: args.content,
      source: args.source,
      generatedBy: args.generatedBy,
      createdAt: now,
    });
    for (const insight of args.insights.slice(0, 8)) {
      await ctx.db.insert("intelligenceInsights", {
        workspaceId: args.workspaceId,
        connectionId: args.connectionId,
        reportId,
        periodKey: args.periodKey,
        kind: insight.kind,
        title: `${args.title} · ${insight.kind}`,
        body: insight.text.slice(0, 800),
        evidence: insight.evidence.slice(0, 500),
        createdAt: now,
      });
    }
    return reportId;
  },
});
