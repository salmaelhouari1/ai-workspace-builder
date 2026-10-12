import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertMember, requireWorkspace } from "./lib/auth";
import { logActivity } from "./lib/activity";

const priority = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));
const status = v.union(
  v.literal("planned"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("done"),
);

const newTaskValidator = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  dueDate: v.optional(v.number()),
  dueTime: v.optional(v.string()),
  priority: v.optional(priority),
  status: v.optional(v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"))),
  reason: v.optional(v.string()),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const result = projects.map((p) => {
      const own = tasks.filter((t) => t.projectId === p._id);
      const done = own.filter((t) => t.status === "done").length;
      return {
        ...p,
        totalTasks: own.length,
        doneTasks: done,
        progress: own.length ? Math.round((done / own.length) * 100) : 0,
      };
    });
    return result.sort((a, b) => {
      const rank = (s: string) => (s === "active" ? 0 : s === "planned" ? 1 : s === "paused" ? 2 : 3);
      return rank(a.status) - rank(b.status) || b.createdAt - a.createdAt;
    });
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    await assertMember(ctx, project.workspaceId);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const done = tasks.filter((t) => t.status === "done").length;
    return {
      ...project,
      tasks: tasks.sort((a, b) => {
        if (a.status === "done" !== (b.status === "done")) return a.status === "done" ? 1 : -1;
        if (a.dueDate !== undefined && b.dueDate !== undefined) return a.dueDate - b.dueDate;
        if (a.dueDate !== undefined) return -1;
        if (b.dueDate !== undefined) return 1;
        return b.createdAt - a.createdAt;
      }),
      totalTasks: tasks.length,
      doneTasks: done,
      progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.number()),
    priority: v.optional(priority),
    status: v.optional(status),
    tasks: v.optional(v.array(newTaskValidator)),
    /** "manual" for the user, "ai" when created through a confirmed proposal. */
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      workspaceId,
      name: args.name.trim().slice(0, 200),
      description: args.description,
      status: args.status ?? "active",
      priority: args.priority ?? "medium",
      deadline: args.deadline,
      createdAt: now,
      updatedAt: now,
    });
    for (const task of args.tasks ?? []) {
      await ctx.db.insert("tasks", {
        workspaceId,
        title: task.title.trim().slice(0, 300),
        description: task.description,
        status: task.status ?? "todo",
        priority: task.priority ?? "medium",
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        projectId,
        tags: [],
        reason: task.reason,
        source: args.source ?? "manual",
        createdAt: now,
        updatedAt: now,
      });
    }
    if (args.source === "ai") {
      await logActivity(ctx, {
        workspaceId,
        actor: "ai",
        action: "project.created",
        detail: `AI created project "${args.name.trim().slice(0, 80)}" with ${(args.tasks ?? []).length} tasks — confirmed by you.`,
        route: `/app/projects/${projectId}`,
      });
    }
    return projectId;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    deadline: v.optional(v.number()),
    clearDeadline: v.optional(v.boolean()),
    priority: v.optional(priority),
    status: v.optional(status),
    /** Set when an AI proposal changed it, for the activity log. */
    aiNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    await assertMember(ctx, project.workspaceId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim().slice(0, 200);
    if (args.description !== undefined) patch.description = args.description;
    if (args.clearDeadline) patch.deadline = undefined;
    else if (args.deadline !== undefined) patch.deadline = args.deadline;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.projectId, patch as never);

    if (args.aiNote) {
      await logActivity(ctx, {
        workspaceId: project.workspaceId,
        actor: "ai",
        action: "project.updated",
        detail: args.aiNote,
        route: `/app/projects/${args.projectId}`,
      });
    }
    return { ok: true };
  },
});

/**
 * Automatic organization (spec §19): file orphan tasks whose text matches a
 * project. Never silent — only runs when the user clicks "Organize".
 */
export const claimRelatedTasks = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    await assertMember(ctx, project.workspaceId);

    const orphans = (await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", project.workspaceId))
      .collect()).filter((t) => t.status !== "done");

    const tokens = project.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3);
    let claimed = 0;
    for (const task of orphans) {
      if (task.projectId) continue;
      const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
      if (tokens.some((t) => text.includes(t))) {
        await ctx.db.patch(task._id, { projectId: project._id, updatedAt: Date.now() });
        claimed += 1;
      }
    }
    if (claimed) {
      await logActivity(ctx, {
        workspaceId: project.workspaceId,
        actor: "ai",
        action: "tasks.organized",
        detail: `Moved ${claimed} task${claimed > 1 ? "s" : ""} into "${project.name}".`,
        route: `/app/projects/${project._id}`,
      });
    }
    return { claimed };
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    await assertMember(ctx, project.workspaceId);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const t of tasks) {
      await ctx.db.patch(t._id, { projectId: undefined });
    }
    await ctx.db.delete(args.projectId);
    return { ok: true };
  },
});
