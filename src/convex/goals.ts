import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertMember, requireWorkspace } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const now = Date.now();
    return goals
      .map((g) => {
        const progress =
          g.target && g.target > 0 && g.current !== undefined
            ? Math.min(100, Math.round((g.current / g.target) * 100))
            : null;
        let note: string | null = null;
        if (progress !== null && g.deadline && g.createdAt) {
          const total = g.deadline - g.createdAt;
          if (total > 86_400_000) {
            const expected = Math.min(
              100,
              Math.max(0, Math.round(((now - g.createdAt) / total) * 100)),
            );
            const delta = expected - progress;
            const month = new Date(g.deadline).toLocaleDateString(undefined, {
              month: "long",
            });
            if (delta >= 4) {
              note = `You're currently ${delta}% behind the pace required to reach your ${month} goal.`;
            } else if (delta <= -4) {
              note = `You're ${Math.abs(delta)}% ahead of pace for your ${month} goal.`;
            } else {
              note = `Right on pace for your ${month} goal.`;
            }
          }
        }
        return { ...g, progress, note };
      })
      .sort((a, b) =>
        a.status === b.status ? a.createdAt - b.createdAt : a.status === "active" ? -1 : 1,
      );
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    target: v.optional(v.number()),
    current: v.optional(v.number()),
    unit: v.optional(v.string()),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const now = Date.now();
    return await ctx.db.insert("goals", {
      workspaceId,
      title: args.title.trim().slice(0, 200),
      description: args.description,
      target: args.target,
      current: args.current ?? 0,
      unit: args.unit,
      deadline: args.deadline,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    target: v.optional(v.number()),
    current: v.optional(v.number()),
    unit: v.optional(v.string()),
    deadline: v.optional(v.number()),
    clearDeadline: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("active"), v.literal("done"))),
  },
  handler: async (ctx, args) => {
    const goal = await ctx.db.get(args.goalId);
    if (!goal) throw new Error("Goal not found");
    await assertMember(ctx, goal.workspaceId);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, 200);
    if (args.description !== undefined) patch.description = args.description;
    if (args.target !== undefined) patch.target = args.target;
    if (args.current !== undefined) patch.current = args.current;
    if (args.unit !== undefined) patch.unit = args.unit;
    if (args.clearDeadline) patch.deadline = undefined;
    else if (args.deadline !== undefined) patch.deadline = args.deadline;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.goalId, patch as never);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { goalId: v.id("goals") },
  handler: async (ctx, args) => {
    const goal = await ctx.db.get(args.goalId);
    if (!goal) throw new Error("Goal not found");
    await assertMember(ctx, goal.workspaceId);
    await ctx.db.delete(args.goalId);
    return { ok: true };
  },
});
