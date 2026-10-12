import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireWorkspace } from "./lib/auth";

/** Recent activity (spec §25): every AI change is logged and visible. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const entries = await ctx.db
      .query("activityLog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(30);
    return entries;
  },
});
