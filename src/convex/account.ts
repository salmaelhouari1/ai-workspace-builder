import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { CURRENT_TERMS_VERSION } from "./lib/legal";

/**
 * Account-level mutations: terms acceptance + full self-service deletion.
 *
 * Deletion is a hard cascade: workspace data, membership, auth tables and the
 * user row itself. It cannot be undone — the UI requires typing the workspace
 * name before calling it for owners.
 */

export const recordTermsAcceptance = mutation({
  args: { version: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false };

    const version = args.version.trim().slice(0, 40) || CURRENT_TERMS_VERSION;
    await ctx.db.patch(userId, {
      termsAcceptedVersion: version,
      termsAcceptedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Tables that fan out directly from a workspace. */
const WORKSPACE_TABLES = [
  "tasks",
  "projects",
  "documents",
  "goals",
  "inboxItems",
  "activityLog",
  "workspaceMembers",
  "teamMembers",
] as const;

/** Delete every row that hangs off the workspace, then the workspace itself. */
async function deleteWorkspaceData(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
): Promise<void> {
  for (const table of WORKSPACE_TABLES) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
  // AI messages need the conversation index — loop conversations first.
  const conversations = await ctx.db
    .query("aiConversations")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const conversation of conversations) {
    const messages = await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .collect();
    for (const message of messages) await ctx.db.delete(message._id);
    await ctx.db.delete(conversation._id);
  }
  await ctx.db.delete(workspaceId);
}

export const deleteMe = mutation({
  args: { confirmName: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false as const };

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (membership) {
      const workspace = await ctx.db.get(membership.workspaceId);
      if (workspace) {
        if (workspace.ownerId === userId) {
          // Owner: type-to-confirm, then hard-delete the whole workspace.
          if (
            workspace.name.trim().toLowerCase() !==
            args.confirmName.trim().toLowerCase()
          ) {
            throw new Error(
              "The workspace name doesn't match — nothing was deleted.",
            );
          }
          await deleteWorkspaceData(ctx, workspace._id);
        } else {
          // A non-owner member simply leaves the workspace.
          await ctx.db.delete(membership._id);
        }
      }
    }

    // Auth cascade: sessions → refresh tokens, accounts → verification codes.
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of refreshTokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) await ctx.db.delete(code._id);
      await ctx.db.delete(account._id);
    }

    // Auth verifiers are keyed by a separate idReference, not by user —
    // they expire on their own; deleting them is unnecessary.
    await ctx.db.delete(userId);

    return { ok: true as const };
  },
});
