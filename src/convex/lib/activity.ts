import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function logActivity(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    actor: "user" | "ai";
    action: string;
    detail: string;
    route?: string;
  },
) {
  await ctx.db.insert("activityLog", {
    workspaceId: args.workspaceId,
    actor: args.actor,
    action: args.action,
    detail: args.detail,
    route: args.route,
    createdAt: Date.now(),
  });
}
