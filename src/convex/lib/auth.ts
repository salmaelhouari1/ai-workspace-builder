/**
 * Workspace-scoped authorization helpers.
 *
 * Every OCIVO row carries a workspaceId; these helpers guarantee a user can
 * only ever read or write data inside a workspace they are a member of.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export interface WorkspaceContext {
  userId: Id<"users">;
  workspaceId: Id<"workspaces">;
}

/** Resolve the signed-in user's workspace, or null when unauthenticated. */
export async function currentUserWorkspace(
  ctx: QueryCtx | MutationCtx,
): Promise<{ userId: Id<"users">; workspaceId: Id<"workspaces"> } | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!membership) return null;
  return { userId, workspaceId: membership.workspaceId };
}

/** Same, but throws when there is no session (queries/mutations). */
export async function requireWorkspace(
  ctx: QueryCtx | MutationCtx,
): Promise<WorkspaceContext> {
  const session = await currentUserWorkspace(ctx);
  if (!session) throw new Error("Not authenticated");
  return session;
}

/**
 * Assert the user is a member of the given workspace before touching any of
 * its documents. Every workspace-scoped mutation/query calls this.
 */
export async function assertMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId).eq("workspaceId", workspaceId))
    .first();
  if (!membership) throw new Error("Unauthorized: not a member of this workspace");
  return userId;
}
