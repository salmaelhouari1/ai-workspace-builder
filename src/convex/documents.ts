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
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const projectName = new Map(projects.map((p) => [p._id, p.name]));
    return docs
      .map((d) => ({
        ...d,
        projectName: d.projectId ? projectName.get(d.projectId) : undefined,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const get = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    await assertMember(ctx, doc.workspaceId);
    let projectName: string | undefined;
    if (doc.projectId) {
      const project = await ctx.db.get(doc.projectId);
      projectName = project?.name;
    }
    return { ...doc, projectName };
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
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== workspaceId) {
        throw new Error("Unknown project");
      }
    }
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
    projectId: v.optional(v.id("projects")),
    clearProject: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await assertMember(ctx, doc.workspaceId);
    if (args.projectId !== undefined) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== doc.workspaceId) {
        throw new Error("Unknown project");
      }
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined)
      patch.title = args.title.trim().slice(0, 200) || "Untitled";
    if (args.content !== undefined) patch.content = args.content;
    if (args.category !== undefined)
      patch.category = args.category.trim() || "Notes";
    if (args.clearProject) patch.projectId = undefined;
    else if (args.projectId !== undefined) patch.projectId = args.projectId;
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
