import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireWorkspace } from "./lib/auth";
import { logActivity } from "./lib/activity";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface TeamPerson {
  email: string;
  name?: string;
  role: "owner" | "member";
  teamMemberId?: Id<"teamMembers">; // undefined for the owner row
}

/**
 * Everyone in this workspace: the owner (derived from the workspace) plus
 * the people added by email. This is what the task assignee picker reads.
 */
export const list = query({
  args: {},
  handler: async (ctx): Promise<TeamPerson[]> => {
    const { workspaceId } = await requireWorkspace(ctx);
    const workspace = await ctx.db.get(workspaceId);
    const people: TeamPerson[] = [];

    if (workspace) {
      const owner = await ctx.db.get(workspace.ownerId);
      people.push({
        email: owner?.email ?? "",
        name: owner?.name,
        role: "owner",
      });
    }

    const rows = await ctx.db
      .query("teamMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    for (const row of rows) {
      // Skip a duplicate of the owner's own email.
      if (people.some((p) => p.email && p.email === row.email)) continue;
      people.push({
        email: row.email,
        name: row.name,
        role: "member",
        teamMemberId: row._id,
      });
    }
    return people;
  },
});

/** Add a teammate by email so tasks can be assigned to them. */
export const add = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);

    const email = args.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email))
      throw new ConvexError("That doesn't look like an email address.");

    const workspace = await ctx.db.get(workspaceId);
    const owner = workspace ? await ctx.db.get(workspace.ownerId) : null;
    if (owner?.email?.toLowerCase() === email) {
      throw new ConvexError(
        "That's your own email — you're already on the team.",
      );
    }

    const existing = await ctx.db
      .query("teamMembers")
      .withIndex("by_email", (q) =>
        q.eq("workspaceId", workspaceId).eq("email", email),
      )
      .first();
    if (existing) throw new ConvexError("They're already on your team.");

    // Resolve a display name when the email already belongs to an account.
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    await ctx.db.insert("teamMembers", {
      workspaceId,
      email,
      name: user?.name ?? undefined,
      userId: user?._id,
      role: "member",
      createdAt: Date.now(),
    });

    await logActivity(ctx, {
      workspaceId,
      actor: "user",
      action: "team.added",
      detail: `Added ${email} to the team`,
      route: "/app/settings",
    });
    return { ok: true };
  },
});

/** Remove someone from the roster (their assigned tasks get unassigned). */
export const remove = mutation({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.teamMemberId);
    if (!row) throw new Error("Team member not found");
    const { workspaceId } = await requireWorkspace(ctx);
    if (row.workspaceId !== workspaceId) throw new Error("Unauthorized");

    await ctx.db.delete(args.teamMemberId);

    // Unassign any tasks that pointed at them.
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    for (const task of tasks) {
      if (task.assigneeEmail?.toLowerCase() === row.email) {
        await ctx.db.patch(task._id, {
          assigneeEmail: undefined,
          assigneeName: undefined,
          updatedAt: Date.now(),
        });
      }
    }

    await logActivity(ctx, {
      workspaceId,
      actor: "user",
      action: "team.removed",
      detail: `Removed ${row.email} from the team`,
      route: "/app/settings",
    });
    return { ok: true };
  },
});
