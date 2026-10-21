import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertMember, requireWorkspace } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const projectById = new Map(projects.map((p) => [p._id, p]));
    const now = Date.now();
    return goals
      .map((g) => {
        // Manual numbers win; otherwise fall back to real progress across
        // the linked projects (completed vs total tasks).
        const manual =
          g.target && g.target > 0 && g.current !== undefined
            ? Math.min(100, Math.round((g.current / g.target) * 100))
            : null;
        const linked = (g.projectIds ?? [])
          .map((id) => projectById.get(id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        let derived: number | null = null;
        if (!manual && linked.length) {
          let done = 0;
          let total = 0;
          for (const p of linked) {
            const own = tasks.filter((t) => t.projectId === p._id);
            done += own.filter((t) => t.status === "done").length;
            total += own.length;
          }
          derived = total > 0 ? Math.round((done / total) * 100) : null;
        }
        const progress = manual ?? derived;
        const linkedProjects = linked.map((p) => {
          const own = tasks.filter((t) => t.projectId === p._id);
          const done = own.filter((t) => t.status === "done").length;
          return {
            id: p._id,
            name: p.name,
            totalTasks: own.length,
            doneTasks: done,
            progress: own.length ? Math.round((done / own.length) * 100) : 0,
          };
        });
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
        return { ...g, progress, note, linkedProjects, progressSource: manual !== null ? "manual" : derived !== null ? "projects" : null };
      })
      .sort((a, b) =>
        a.status === b.status ? a.createdAt - b.createdAt : a.status === "active" ? -1 : 1,
      );
  },
});

async function assertProjectsInWorkspace(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  ids: Id<"projects">[],
) {
  for (const id of ids.slice(0, 20)) {
    const project = await ctx.db.get(id);
    if (!project || project.workspaceId !== workspaceId) {
      throw new Error("Unknown project");
    }
  }
}

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    target: v.optional(v.number()),
    current: v.optional(v.number()),
    unit: v.optional(v.string()),
    deadline: v.optional(v.number()),
    projectIds: v.optional(v.array(v.id("projects"))),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (!args.title.trim()) throw new Error("Goal needs a title");
    if (args.projectIds) {
      await assertProjectsInWorkspace(ctx, workspaceId, args.projectIds);
    }
    const now = Date.now();
    return await ctx.db.insert("goals", {
      workspaceId,
      title: args.title.trim().slice(0, 200),
      description: args.description,
      target: args.target,
      current: args.current ?? 0,
      unit: args.unit,
      deadline: args.deadline,
      projectIds: args.projectIds?.slice(0, 20) ?? [],
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
    projectIds: v.optional(v.array(v.id("projects"))),
  },
  handler: async (ctx, args) => {
    const goal = await ctx.db.get(args.goalId);
    if (!goal) throw new Error("Goal not found");
    await assertMember(ctx, goal.workspaceId);
    if (args.projectIds) {
      await assertProjectsInWorkspace(ctx, goal.workspaceId, args.projectIds);
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, 200);
    if (args.description !== undefined) patch.description = args.description;
    if (args.target !== undefined) patch.target = args.target;
    if (args.current !== undefined) patch.current = args.current;
    if (args.unit !== undefined) patch.unit = args.unit;
    if (args.clearDeadline) patch.deadline = undefined;
    else if (args.deadline !== undefined) patch.deadline = args.deadline;
    if (args.status !== undefined) patch.status = args.status;
    if (args.projectIds !== undefined) {
      patch.projectIds = args.projectIds.slice(0, 20);
    }
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

/** Projects not yet linked to any goal — used by the goal editor. */
export const linkableProjects = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return projects.map((p) => ({ id: p._id, name: p.name, status: p.status }));
  },
});
