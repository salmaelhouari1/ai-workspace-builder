import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertMember, requireWorkspace } from "./lib/auth";
import { logActivity } from "./lib/activity";

const priority = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));
const taskStatus = v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"));
const projectStatus = v.union(
  v.literal("planned"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("done"),
);

const taskSpec = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  dueDate: v.optional(v.number()),
  dueTime: v.optional(v.string()),
  priority: v.optional(priority),
});

/**
 * Preview → Confirm → Execute (spec §25).
 *
 * The AI never writes to the database directly: it returns a proposal, the
 * UI shows exactly what will change, and this mutation runs only when the
 * user clicks Confirm.
 */
export const apply = mutation({
  args: {
    proposal: v.union(
      v.object({
        kind: v.literal("createTasks"),
        tasks: v.array(taskSpec),
        projectId: v.optional(v.id("projects")),
        projectLabel: v.optional(v.string()),
      }),
      v.object({
        kind: v.literal("createProject"),
        name: v.string(),
        description: v.optional(v.string()),
        deadline: v.optional(v.number()),
        tasks: v.array(taskSpec),
      }),
      v.object({
        kind: v.literal("updateTask"),
        taskId: v.id("tasks"),
        title: v.optional(v.string()),
        dueDate: v.optional(v.number()),
        dueTime: v.optional(v.string()),
        clearDue: v.optional(v.boolean()),
        status: v.optional(taskStatus),
        note: v.optional(v.string()),
      }),
      v.object({
        kind: v.literal("updateProject"),
        projectId: v.id("projects"),
        deadline: v.optional(v.number()),
        clearDeadline: v.optional(v.boolean()),
        status: v.optional(projectStatus),
        note: v.optional(v.string()),
      }),
      v.object({
        kind: v.literal("createGoal"),
        title: v.string(),
        target: v.optional(v.number()),
        current: v.optional(v.number()),
        unit: v.optional(v.string()),
        deadline: v.optional(v.number()),
      }),
      v.object({
        kind: v.literal("createDocument"),
        title: v.string(),
        content: v.string(),
        category: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const now = Date.now();
    const p = args.proposal;

    switch (p.kind) {
      case "createTasks": {
        if (p.projectId) {
          const project = await ctx.db.get(p.projectId);
          if (!project || project.workspaceId !== workspaceId) throw new Error("Project not found");
        }
        for (const t of p.tasks) {
          await ctx.db.insert("tasks", {
            workspaceId,
            title: t.title.slice(0, 300),
            description: t.description,
            status: "todo",
            priority: t.priority ?? "medium",
            dueDate: t.dueDate,
            dueTime: t.dueTime,
            projectId: p.projectId,
            tags: [],
            source: "ai",
            createdAt: now,
            updatedAt: now,
          });
        }
        const where = p.projectLabel ? ` in "${p.projectLabel}"` : "";
        const summary = `Created ${p.tasks.length} task${p.tasks.length === 1 ? "" : "s"}${where}.`;
        await logActivity(ctx, { workspaceId, actor: "ai", action: "tasks.created", detail: summary, route: "/app/tasks" });
        return { summary };
      }

      case "createProject": {
        const projectId = await ctx.db.insert("projects", {
          workspaceId,
          name: p.name.slice(0, 200),
          description: p.description,
          status: "active",
          priority: "medium",
          deadline: p.deadline,
          createdAt: now,
          updatedAt: now,
        });
        for (const t of p.tasks) {
          await ctx.db.insert("tasks", {
            workspaceId,
            title: t.title.slice(0, 300),
            description: t.description,
            status: "todo",
            priority: t.priority ?? "medium",
            dueDate: t.dueDate,
            dueTime: t.dueTime,
            projectId,
            tags: [],
            source: "ai",
            createdAt: now,
            updatedAt: now,
          });
        }
        const summary = `Created project "${p.name}" with ${p.tasks.length} task${p.tasks.length === 1 ? "" : "s"}.`;
        await logActivity(ctx, { workspaceId, actor: "ai", action: "project.created", detail: summary, route: `/app/projects/${projectId}` });
        return { summary, route: `/app/projects/${projectId}` };
      }

      case "updateTask": {
        const task = await ctx.db.get(p.taskId);
        if (!task || task.workspaceId !== workspaceId) throw new Error("Task not found in this workspace");
        const patch: Record<string, unknown> = { updatedAt: now };
        if (p.title !== undefined) patch.title = p.title.slice(0, 300);
        if (p.clearDue) {
          patch.dueDate = undefined;
          patch.dueTime = undefined;
        } else {
          if (p.dueDate !== undefined) patch.dueDate = p.dueDate;
          if (p.dueTime !== undefined) patch.dueTime = p.dueTime;
        }
        if (p.status !== undefined) {
          patch.status = p.status;
          patch.completedAt = p.status === "done" ? now : undefined;
        }
        await ctx.db.patch(p.taskId, patch as never);
        const summary = p.note ?? `Updated task "${task.title}".`;
        await logActivity(ctx, { workspaceId, actor: "ai", action: "task.updated", detail: summary, route: "/app/tasks" });
        return { summary };
      }

      case "updateProject": {
        const project = await ctx.db.get(p.projectId);
        if (!project || project.workspaceId !== workspaceId) throw new Error("Project not found");
        const patch: Record<string, unknown> = { updatedAt: now };
        if (p.clearDeadline) patch.deadline = undefined;
        else if (p.deadline !== undefined) patch.deadline = p.deadline;
        if (p.status !== undefined) patch.status = p.status;
        await ctx.db.patch(p.projectId, patch as never);
        const summary = p.note ?? `Updated project "${project.name}".`;
        await logActivity(ctx, { workspaceId, actor: "ai", action: "project.updated", detail: summary, route: `/app/projects/${p.projectId}` });
        return { summary };
      }

      case "createGoal": {
        const goalId = await ctx.db.insert("goals", {
          workspaceId,
          title: p.title.slice(0, 200),
          target: p.target,
          current: p.current ?? 0,
          unit: p.unit,
          deadline: p.deadline,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        const summary = `Created goal "${p.title}".`;
        await logActivity(ctx, { workspaceId, actor: "ai", action: "goal.created", detail: summary, route: "/app/goals" });
        return { summary, route: "/app/goals", goalId };
      }

      case "createDocument": {
        const docId = await ctx.db.insert("documents", {
          workspaceId,
          title: p.title.slice(0, 200),
          content: p.content,
          category: p.category?.trim() || "Notes",
          createdAt: now,
          updatedAt: now,
        });
        const summary = `Created document "${p.title}".`;
        await logActivity(ctx, { workspaceId, actor: "ai", action: "document.created", detail: summary, route: `/app/documents/${docId}` });
        return { summary, route: `/app/documents/${docId}` };
      }
    }
  },
});

/** Guard used by the client before showing a proposal preview. */
export const assertCanApply = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId, userId } = await requireWorkspace(ctx);
    await assertMember(ctx, workspaceId);
    return { workspaceId, userId };
  },
});
