import { v } from "convex/values";
import { query } from "./_generated/server";
import { currentUserWorkspace } from "./lib/auth";
import { relativeDayPhrase, utcDayStart, DAY_MS } from "../lib/nlp";

/**
 * Contextual retrieval for the assistant (spec §24).
 *
 * Instead of shoving the whole database into the model, this returns a
 * compact, bounded snapshot of the workspace; the action then re-ranks it
 * against the actual question before sending anything to the model.
 */
export const workspaceContext = query({
  args: {},
  handler: async (ctx) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) return null;
    const { workspaceId } = session;

    const [workspace, allTasks, projects, goals, docs, inbox] = await Promise.all([
      ctx.db.get(workspaceId),
      ctx.db.query("tasks").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect(),
      ctx.db.query("projects").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect(),
      ctx.db.query("goals").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect(),
      ctx.db.query("documents").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect(),
      ctx.db.query("inboxItems").withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "pending"),
      ).collect(),
    ]);

    const now = Date.now();
    const today = utcDayStart(now);
    const projectName = new Map(projects.map((p) => [p._id, p.name]));

    const open = allTasks.filter((t) => t.status !== "done");
    const done = allTasks.filter((t) => t.status === "done");

    const tasks = [...open, ...done.slice(-8)]
      .sort((a, b) => {
        if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
        if (a.dueDate !== undefined && b.dueDate !== undefined) return a.dueDate - b.dueDate;
        if (a.dueDate !== undefined) return -1;
        if (b.dueDate !== undefined) return 1;
        return b.createdAt - a.createdAt;
      })
      .slice(0, 100)
      .map((t) => ({
        id: t._id as string,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ?? null,
        due:
          t.dueDate !== undefined
            ? `${relativeDayPhrase(t.dueDate, now).replace(/\.$/, "")}${t.dueTime ? `, ${t.dueTime}` : ""}`
            : null,
        overdue: t.dueDate !== undefined && t.dueDate < today && t.status !== "done",
        project: t.projectId ? projectName.get(t.projectId) ?? null : null,
        reason: t.reason ?? null,
        tags: t.tags,
      }));

    const taskById = new Map(allTasks.map((t) => [t._id as string, t]));

    const projectItems = projects.map((p) => {
      const own = allTasks.filter((t) => t.projectId === p._id);
      const doneCount = own.filter((t) => t.status === "done").length;
      return {
        id: p._id as string,
        name: p.name,
        description: p.description ?? null,
        status: p.status,
        deadlineTs: p.deadline ?? null,
        deadline: p.deadline ? relativeDayPhrase(p.deadline, now).replace(/\.$/, "") : null,
        progress: own.length ? Math.round((doneCount / own.length) * 100) : 0,
        doneTasks: doneCount,
        totalTasks: own.length,
      };
    });

    const goalItems = goals.map((g) => ({
      id: g._id as string,
      title: g.title,
      current: g.current ?? null,
      target: g.target ?? null,
      unit: g.unit ?? null,
      deadlineTs: g.deadline ?? null,
      deadline: g.deadline ? relativeDayPhrase(g.deadline, now).replace(/\.$/, "") : null,
      progress:
        g.target && g.target > 0 && g.current !== undefined
          ? Math.min(100, Math.round((g.current / g.target) * 100))
          : null,
    }));

    const docItems = docs.map((d) => ({
      id: d._id as string,
      title: d.title,
      category: d.category,
      excerpt: d.content.slice(0, 600),
      full: d.content,
    }));

    return {
      workspace: {
        id: workspaceId as string,
        name: workspace?.name ?? "Workspace",
        businessType: workspace?.businessType ?? "general",
        mainGoal: workspace?.mainGoal ?? null,
      },
      tasks,
      projects: projectItems,
      goals: goalItems,
      documents: docItems,
      pendingInbox: inbox.length,
      today: new Date(today).toISOString().slice(0, 10),
      // helper for the action: resolve due strings when proposals come back
      taskTitles: [...taskById.entries()].map(([id, t]) => ({ id, title: t.title })),
    };
  },
});

/** Recent messages of a conversation, workspace-guarded. */
export const conversationHistory = query({
  args: { conversationId: v.id("aiConversations") },
  handler: async (ctx, args) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) return null;
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.workspaceId !== session.workspaceId) return null;
    const messages = await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    return messages.sort((a, b) => a.createdAt - b.createdAt);
  },
});
