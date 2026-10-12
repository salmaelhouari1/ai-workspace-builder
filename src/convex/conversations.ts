import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspace } from "./lib/auth";

const referenceValidator = v.object({
  label: v.string(),
  kind: v.string(),
  route: v.string(),
});

/** Most recent conversation + its messages (the AI page's thread). */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const conversations = await ctx.db
      .query("aiConversations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(1);
    const conversation = conversations[0];
    if (!conversation) return null;
    const messages = await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .collect();
    return {
      conversation,
      messages: messages.sort((a, b) => a.createdAt - b.createdAt),
    };
  },
});

/**
 * Persist one exchange. Called from the AI action after the answer is built,
 * so the thread survives reloads.
 */
export const saveExchange = mutation({
  args: {
    conversationId: v.optional(v.id("aiConversations")),
    question: v.string(),
    answer: v.string(),
    references: v.optional(v.array(referenceValidator)),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const now = Date.now();

    let conversationId = args.conversationId;
    if (conversationId) {
      const existing = await ctx.db.get(conversationId);
      if (!existing || existing.workspaceId !== workspaceId) {
        throw new Error("Conversation not found");
      }
      await ctx.db.patch(conversationId, { updatedAt: now });
    } else {
      conversationId = await ctx.db.insert("aiConversations", {
        workspaceId,
        title: args.question.slice(0, 90),
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("aiMessages", {
      conversationId,
      workspaceId,
      role: "user",
      content: args.question,
      createdAt: now,
    });
    await ctx.db.insert("aiMessages", {
      conversationId,
      workspaceId,
      role: "assistant",
      content: args.answer,
      references: args.references,
      createdAt: now + 1,
    });

    return { conversationId };
  },
});

/** Start a fresh thread from the AI page's "New chat". */
export const startNew = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const now = Date.now();
    return await ctx.db.insert("aiConversations", {
      workspaceId,
      title: "New conversation",
      createdAt: now,
      updatedAt: now,
    });
  },
});
