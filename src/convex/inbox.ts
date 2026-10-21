import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspace } from "./lib/auth";
import { logActivity } from "./lib/activity";

/**
 * Smart Inbox (spec §9).
 *
 * Flow: dump anything → it sits as a pending item → OCIVO parses it into
 * reviewable entries (tasks / notes / links / ideas) → the user confirms →
 * real tasks and notes are created, and the dump is archived as "saved".
 */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const items = await ctx.db
      .query("inboxItems")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const projectName = new Map(projects.map((p) => [p._id, p.name]));
    return items
      .map((i) => ({
        ...i,
        projectName: i.projectId ? projectName.get(i.projectId) : undefined,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Quick dump — no review required to capture. */
export const add = mutation({
  args: { raw: v.string() },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const raw = args.raw.trim();
    if (!raw) throw new Error("Nothing to add");
    return await ctx.db.insert("inboxItems", {
      workspaceId,
      raw,
      kind: "note",
      title: raw.slice(0, 120),
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

const entryValidator = v.object({
  kind: v.union(v.literal("task"), v.literal("note"), v.literal("link"), v.literal("idea")),
  title: v.string(),
  detail: v.optional(v.string()),
  dueDate: v.optional(v.number()),
  url: v.optional(v.string()),
  projectId: v.optional(v.id("projects")),
  include: v.optional(v.boolean()),
});

/**
 * Commit the reviewed entries: tasks become tasks, notes/links/ideas become
 * documents in Notes, and the raw dump moves to "saved".
 */
export const process = mutation({
  args: {
    itemId: v.id("inboxItems"),
    entries: v.array(entryValidator),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Inbox item not found");
    const { workspaceId } = await requireWorkspace(ctx);
    if (item.workspaceId !== workspaceId) throw new Error("Unauthorized");
    // Only pending items can be processed — a second submit (double click,
    // two tabs) must not create the same tasks twice.
    if (item.status !== "pending") {
      throw new Error("This note was already processed.");
    }

    const selected = args.entries.filter((e) => e.include !== false);
    const now = Date.now();
    let createdTasks = 0;
    let createdNotes = 0;

    for (const entry of selected) {
      if (entry.kind === "task") {
        if (entry.projectId) {
          const project = await ctx.db.get(entry.projectId);
          if (!project || project.workspaceId !== workspaceId) continue;
        }
        await ctx.db.insert("tasks", {
          workspaceId,
          title: entry.title.trim().slice(0, 300),
          description: entry.detail,
          status: "todo",
          priority: "medium",
          dueDate: entry.dueDate,
          projectId: entry.projectId,
          tags: [],
          source: "inbox",
          createdAt: now,
          updatedAt: now,
        });
        createdTasks += 1;
      } else {
        await ctx.db.insert("documents", {
          workspaceId,
          title: entry.title.trim().slice(0, 200) || "Untitled note",
          content: `# ${entry.title.trim().slice(0, 200) || "Untitled note"}\n\n${
            entry.url ? `[${entry.url}](${entry.url})\n\n` : ""
          }${entry.detail ?? ""}`,
          category: "Notes",
          createdAt: now,
          updatedAt: now,
        });
        createdNotes += 1;
      }
    }

    await ctx.db.patch(args.itemId, {
      status: "saved",
      detail: selected
        .map((e) => `${e.kind}: ${e.title}`)
        .join(" · ")
        .slice(0, 500),
    });

    await logActivity(ctx, {
      workspaceId,
      actor: "ai",
      action: "inbox.processed",
      detail: `OCIVO turned a note into ${createdTasks} task${createdTasks === 1 ? "" : "s"} and ${createdNotes} note${createdNotes === 1 ? "" : "s"}.`,
      route: "/app/inbox",
    });

    return { createdTasks, createdNotes };
  },
});

export const dismiss = mutation({
  args: { itemId: v.id("inboxItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Inbox item not found");
    const { workspaceId } = await requireWorkspace(ctx);
    if (item.workspaceId !== workspaceId) throw new Error("Unauthorized");
    await ctx.db.patch(args.itemId, { status: "dismissed" });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { itemId: v.id("inboxItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Inbox item not found");
    const { workspaceId } = await requireWorkspace(ctx);
    if (item.workspaceId !== workspaceId) throw new Error("Unauthorized");
    await ctx.db.delete(args.itemId);
    return { ok: true };
  },
});
