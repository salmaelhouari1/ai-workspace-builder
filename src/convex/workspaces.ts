import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { currentUserWorkspace, requireWorkspace } from "./lib/auth";
import { buildSeed, seedDayStart, ALL_MODULES } from "./lib/templates";
import {
  detectBusinessType,
  guessBusinessName,
  type BusinessType,
} from "../lib/nlp";
import { logActivity } from "./lib/activity";

const BUSINESS_TYPES = [
  "freelance",
  "ecommerce",
  "saas",
  "creator",
  "agency",
  "general",
];

/** The signed-in user's workspace, or null when they haven't onboarded yet. */
export const getForMe = query({
  args: {},
  handler: async (ctx) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) return null;
    const workspace = await ctx.db.get(session.workspaceId);
    return workspace;
  },
});

/** Sidebar badges (inbox pending, open tasks) — cheap counts only. */
export const navBadges = query({
  args: {},
  handler: async (ctx) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) return { inbox: 0, tasks: 0 };
    const pending = await ctx.db
      .query("inboxItems")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", session.workspaceId).eq("status", "pending"),
      )
      .collect();
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", session.workspaceId),
      )
      .collect();
    const openCount = tasks.filter((t) => t.status !== "done").length;
    return { inbox: pending.length, tasks: openCount };
  },
});

/**
 * Generate the whole workspace from what the user is building.
 * This is step 3 of onboarding: parse → structure → done in one transaction.
 *
 * Idempotent by design: if the user already has a workspace (a retried
 * request, a lost response, a second tab), we return the existing one instead
 * of failing — a retry must never block the user or duplicate their data.
 * User-facing failures are ConvexErrors so the real reason reaches the
 * browser in production, where plain Error messages are redacted.
 */
export const create = mutation({
  args: {
    prompt: v.string(),
    name: v.optional(v.string()),
    businessType: v.optional(v.string()),
    mainGoal: v.optional(v.string()),
    teamSize: v.optional(v.string()),
    stage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Onboarding runs BEFORE any membership exists — requireWorkspace would
    // throw "Not authenticated" for every brand-new user here — so this one
    // mutation only requires a signed-in session.
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError(
        "Your session expired — sign in again and we'll pick up where you left off.",
      );
    }

    const prompt = args.prompt.trim();
    if (prompt.length < 3) {
      throw new ConvexError(
        "Tell us a little more about what you're building.",
      );
    }
    if (prompt.length > 4000) {
      throw new ConvexError(
        "That description is a bit long — keep it under 4,000 characters.",
      );
    }

    // v1: one workspace per user. A repeated call (retry after a flaky
    // network, double submit, second tab) returns the existing workspace so
    // the client can simply continue into the app.
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      return { workspaceId: existing.workspaceId, alreadyExisted: true };
    }

    const detected = detectBusinessType(prompt || args.name || "");
    const businessType = (
      args.businessType && BUSINESS_TYPES.includes(args.businessType)
        ? args.businessType
        : detected.type
    ) as BusinessType;

    const name =
      args.name?.trim().slice(0, 100) ||
      guessBusinessName(prompt) ||
      "My workspace";

    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      businessType,
      prompt: prompt.slice(0, 4000),
      mainGoal: args.mainGoal?.trim().slice(0, 300) || undefined,
      teamSize: args.teamSize?.trim().slice(0, 40) || undefined,
      stage: args.stage?.trim().slice(0, 40) || undefined,
      ownerId: userId,
      modules: ALL_MODULES,
      onboardedAt: now,
      createdAt: now,
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
    });

    const seed = buildSeed({
      name,
      businessType,
      prompt: args.prompt,
      mainGoal: args.mainGoal,
      stage: args.stage,
    });

    for (const project of seed.projects) {
      const deadline = seedDayStart(project.deadlineIn);
      const projectId = await ctx.db.insert("projects", {
        workspaceId,
        name: project.name,
        description: project.description,
        status: project.status ?? "active",
        priority: project.priority ?? "medium",
        deadline,
        createdAt: now,
        updatedAt: now,
      });
      for (const task of project.tasks) {
        await ctx.db.insert("tasks", {
          workspaceId,
          title: task.title,
          description: task.description,
          status: task.status ?? "todo",
          priority: task.priority ?? "medium",
          dueDate: seedDayStart(task.dueIn),
          dueTime: task.dueTime,
          projectId,
          tags: task.tags ?? [],
          reason: task.reason,
          source: "generated",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const goal of seed.goals) {
      await ctx.db.insert("goals", {
        workspaceId,
        title: goal.title,
        description: goal.description,
        target: goal.target,
        current: goal.current,
        unit: goal.unit,
        deadline: seedDayStart(goal.deadlineIn),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const doc of seed.documents) {
      await ctx.db.insert("documents", {
        workspaceId,
        title: doc.title,
        content: doc.content,
        category: doc.category,
        createdAt: now,
        updatedAt: now,
      });
    }

    await logActivity(ctx, {
      workspaceId,
      actor: "ai",
      action: "workspace.created",
      detail: `OCIVO built your ${businessType} workspace: ${seed.projects.length} projects, ${seed.goals.length} goals, ${seed.documents.length} documents.`,
      route: "/app",
    });

    return { workspaceId, alreadyExisted: false };
  },
});

/** Minimal profile editing from Settings. */
export const update = mutation({
  args: {
    name: v.optional(v.string()),
    mainGoal: v.optional(v.string()),
    teamSize: v.optional(v.string()),
    stage: v.optional(v.string()),
    businessType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error("Workspace not found");

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined && args.name.trim())
      patch.name = args.name.trim();
    if (args.mainGoal !== undefined) patch.mainGoal = args.mainGoal;
    if (args.teamSize !== undefined) patch.teamSize = args.teamSize;
    if (args.stage !== undefined) patch.stage = args.stage;
    if (
      args.businessType !== undefined &&
      BUSINESS_TYPES.includes(args.businessType)
    ) {
      patch.businessType = args.businessType;
    }
    if (Object.keys(patch).length)
      await ctx.db.patch(workspaceId, patch as never);
    return { ok: true };
  },
});
