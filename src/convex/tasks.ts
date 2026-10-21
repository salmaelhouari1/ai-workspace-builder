import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertMember, requireWorkspace } from "./lib/auth";
import { logActivity } from "./lib/activity";

const priority = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);
const status = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** All tasks in the workspace; the client filters/groups for v1. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const projectName = new Map(projects.map((p) => [p._id, p.name]));
    return tasks
      .map((t) => ({
        ...t,
        projectName: t.projectId ? projectName.get(t.projectId) : undefined,
      }))
      .sort((a, b) => {
        if ((a.status === "done") !== (b.status === "done"))
          return a.status === "done" ? 1 : -1;
        if (a.dueDate !== undefined && b.dueDate !== undefined)
          return a.dueDate - b.dueDate;
        if (a.dueDate !== undefined) return -1;
        if (b.dueDate !== undefined) return 1;
        return b.createdAt - a.createdAt;
      });
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
    priority: v.optional(priority),
    status: v.optional(status),
    projectId: v.optional(v.id("projects")),
    parentId: v.optional(v.id("tasks")),
    tags: v.optional(v.array(v.string())),
    reason: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (args.title.trim().length === 0) throw new Error("Task needs a title");
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== workspaceId) {
        throw new Error("Unknown project");
      }
    }
    // Subtasks: one level deep, same workspace as the parent.
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.workspaceId !== workspaceId) {
        throw new Error("Unknown parent task");
      }
    }
    const now = Date.now();
    const id = await ctx.db.insert("tasks", {
      workspaceId,
      title: args.title.trim().slice(0, 300),
      description: args.description,
      dueDate: args.dueDate,
      dueTime: args.dueTime,
      priority: args.priority ?? "medium",
      status: args.status ?? "todo",
      projectId: args.projectId,
      parentId: args.parentId,
      tags: args.tags ?? [],
      reason: args.reason,
      source: args.source ?? "manual",
      createdAt: now,
      updatedAt: now,
    });
    if (args.source === "ai" || args.source === "inbox") {
      await logActivity(ctx, {
        workspaceId,
        actor: "ai",
        action: "task.created",
        detail: `Created task "${args.title.trim().slice(0, 80)}"`,
        route: "/app/tasks",
      });
    }
    return id;
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    clearDueDate: v.optional(v.boolean()),
    dueTime: v.optional(v.string()),
    priority: v.optional(priority),
    status: v.optional(status),
    projectId: v.optional(v.id("projects")),
    reason: v.optional(v.string()),
    assigneeEmail: v.optional(v.string()),
    assigneeName: v.optional(v.string()),
    clearAssignee: v.optional(v.boolean()),
    clearProject: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await assertMember(ctx, task.workspaceId);

    // Moving a task into a project must target one of *this* workspace's
    // projects — otherwise a guessed ID could cross-link workspaces.
    if (args.projectId !== undefined) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== task.workspaceId) {
        throw new Error("Unknown project");
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, 300);
    if (args.description !== undefined) patch.description = args.description;
    if (args.clearDueDate) {
      patch.dueDate = undefined;
      patch.dueTime = undefined;
    } else {
      if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
      if (args.dueTime !== undefined) patch.dueTime = args.dueTime;
    }
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.completedAt = args.status === "done" ? Date.now() : undefined;
    }
    if (args.clearProject) patch.projectId = undefined;
    else if (args.projectId !== undefined) patch.projectId = args.projectId;
    if (args.reason !== undefined) patch.reason = args.reason;
    if (args.clearAssignee) {
      patch.assigneeEmail = undefined;
      patch.assigneeName = undefined;
    } else if (args.assigneeEmail !== undefined) {
      const email = args.assigneeEmail.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new Error("Invalid assignee email");
      patch.assigneeEmail = email;
      patch.assigneeName = args.assigneeName?.trim().slice(0, 120) || undefined;
    }

    await ctx.db.patch(args.taskId, patch as never);
    return { ok: true };
  },
});

/** Attach a note/comment to a task — a trail of "what happened here". */
export const addComment = mutation({
  args: { taskId: v.id("tasks"), text: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    const userId = await assertMember(ctx, task.workspaceId);
    const user = await ctx.db.get(userId);

    const text = args.text.trim().slice(0, 2000);
    if (!text) throw new Error("The note is empty");

    const comment = {
      id: crypto.randomUUID(),
      text,
      author: user?.name?.trim() || user?.email?.split("@")[0] || "Someone",
      createdAt: Date.now(),
    };
    await ctx.db.patch(args.taskId, {
      comments: [...(task.comments ?? []), comment],
      updatedAt: Date.now(),
    });
    return comment;
  },
});

/** Delete a note from a task. */
export const removeComment = mutation({
  args: { taskId: v.id("tasks"), commentId: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await assertMember(ctx, task.workspaceId);
    await ctx.db.patch(args.taskId, {
      comments: (task.comments ?? []).filter((c) => c.id !== args.commentId),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Mark done / reopen — the one-click Home + Tasks interaction. */
export const toggle = mutation({
  args: { taskId: v.id("tasks"), done: v.boolean() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await assertMember(ctx, task.workspaceId);
    await ctx.db.patch(args.taskId, {
      status: args.done ? "done" : "todo",
      completedAt: args.done ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await assertMember(ctx, task.workspaceId);
    // Deleting a parent takes its subtasks with it — no orphans.
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentId", args.taskId))
      .collect();
    for (const child of children) await ctx.db.delete(child._id);
    await ctx.db.delete(args.taskId);
    return { ok: true };
  },
});
