import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertMember, requireWorkspace } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return docs.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const get = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    await assertMember(ctx, doc.workspaceId);
    return doc;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    content: v.optional(v.string()),
    category: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const now = Date.now();
    return await ctx.db.insert("documents", {
      workspaceId,
      title: args.title.trim().slice(0, 200) || "Untitled",
      content: args.content ?? "",
      category: args.category?.trim() || "Notes",
      projectId: args.projectId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    documentId: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await assertMember(ctx, doc.workspaceId);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, 200) || "Untitled";
    if (args.content !== undefined) patch.content = args.content;
    if (args.category !== undefined) patch.category = args.category.trim() || "Notes";
    await ctx.db.patch(args.documentId, patch as never);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await assertMember(ctx, doc.workspaceId);
    await ctx.db.delete(args.documentId);
    return { ok: true };
  },
});
