import { v } from "convex/values";
import { query } from "./_generated/server";
import { currentUserWorkspace } from "./lib/auth";
import { relativeDayPhrase, utcDayStart } from "../lib/nlp";

/**
 * Contextual retrieval for the assistant (spec §24).
 *
 * Instead of shoving the whole database into the model, this returns a
 * compact, bounded snapshot of the workspace; the action then re-ranks it
 * against the actual question before sending anything to the model.
 */
export const workspaceContext = query({
  args: {
    // When the assistant runs inside the document editor, only that document
    // carries its full body — every other document contributes an excerpt, so
    // a long library never floods the function boundary.
    focusDocumentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) return null;
    const { workspaceId } = session;

    const [workspace, allTasks, projects, goals, docs, inbox, campaigns, entries, ideas] =
      await Promise.all([
        ctx.db.get(workspaceId),
        ctx.db
          .query("tasks")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
          .collect(),
        ctx.db
          .query("projects")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
          .collect(),
        ctx.db
          .query("goals")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
          .collect(),
        ctx.db
          .query("documents")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
          .take(30),
        ctx.db
          .query("inboxItems")
          .withIndex("by_workspace_status", (q) =>
            q.eq("workspaceId", workspaceId).eq("status", "pending"),
          )
          .collect(),
        // Marketing planner, bounded: the assistant only needs enough to
        // name campaigns, spot open drafts and avoid collisions.
        ctx.db
          .query("campaigns")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
          .take(40),
        ctx.db
          .query("marketingEntries")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
          .take(150),
        ctx.db
          .query("marketingIdeas")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
          .take(60),
      ]);

    const now = Date.now();
    const today = utcDayStart(now);
    const projectName = new Map(projects.map((p) => [p._id, p.name]));

    const open = allTasks.filter((t) => t.status !== "done");
    const done = allTasks.filter((t) => t.status === "done");

    const tasks = [...open, ...done.slice(-8)]
      .sort((a, b) => {
        if ((a.status === "done") !== (b.status === "done"))
          return a.status === "done" ? 1 : -1;
        if (a.dueDate !== undefined && b.dueDate !== undefined)
          return a.dueDate - b.dueDate;
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
        overdue:
          t.dueDate !== undefined && t.dueDate < today && t.status !== "done",
        project: t.projectId ? (projectName.get(t.projectId) ?? null) : null,
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
        deadline: p.deadline
          ? relativeDayPhrase(p.deadline, now).replace(/\.$/, "")
          : null,
        progress: own.length ? Math.round((doneCount / own.length) * 100) : 0,
        doneTasks: doneCount,
        totalTasks: own.length,
      };
    });

    const goalItems = goals.map((g) => {
      const manual =
        g.target && g.target > 0 && g.current !== undefined
          ? Math.min(100, Math.round((g.current / g.target) * 100))
          : null;
      let derived: number | null = null;
      if (manual === null && g.projectIds?.length) {
        let done = 0;
        let total = 0;
        for (const id of g.projectIds) {
          const own = allTasks.filter((t) => t.projectId === id);
          done += own.filter((t) => t.status === "done").length;
          total += own.length;
        }
        derived = total > 0 ? Math.round((done / total) * 100) : null;
      }
      return {
        id: g._id as string,
        title: g.title,
        current: g.current ?? null,
        target: g.target ?? null,
        unit: g.unit ?? null,
        deadlineTs: g.deadline ?? null,
        deadline: g.deadline
          ? relativeDayPhrase(g.deadline, now).replace(/\.$/, "")
          : null,
        progress: manual ?? derived,
        projects: (g.projectIds ?? [])
          .map((id) => projectName.get(id))
          .filter((n): n is string => Boolean(n)),
      };
    });

    // Focus doc may fall outside the 30-doc cap — fetch it explicitly and
    // make sure the snapshot never loses the document being edited.
    const focusedFetch =
      args.focusDocumentId && !docs.some((d) => d._id === args.focusDocumentId)
        ? await ctx.db.get(args.focusDocumentId)
        : undefined;
    const effectiveDocs =
      focusedFetch &&
      focusedFetch.workspaceId === workspaceId &&
      focusedFetch._id === args.focusDocumentId
        ? [...docs, focusedFetch]
        : docs;
    const docItems = effectiveDocs.map((d) => ({
      id: d._id as string,
      title: d.title,
      category: d.category,
      excerpt: d.content.slice(0, 600),
      // Full body only for the focused doc; others contribute excerpts only.
      full:
        args.focusDocumentId === d._id
          ? focusedFetch?.content ?? d.content
          : undefined,
    }));

    // Marketing: bodies stay in the database (they can be long markdown) —
    // the snapshot only carries what answers and proposals need.
    const campaignName = new Map(campaigns.map((c) => [c._id, c.name]));
    const entryItems = entries
      .map((e) => ({
        id: e._id as string,
        title: e.title,
        platform: e.platform,
        contentType: e.contentType,
        status: e.status,
        scheduledAt: e.scheduledAt ?? null,
        campaignName: e.campaignId
          ? (campaignName.get(e.campaignId) ?? null)
          : null,
      }))
      .sort((a, b) => {
        if (a.scheduledAt !== null && b.scheduledAt !== null)
          return a.scheduledAt - b.scheduledAt;
        if (a.scheduledAt !== null) return -1;
        if (b.scheduledAt !== null) return 1;
        return 0;
      });

    const campaignItems = campaigns.map((c) => {
      const own = entries.filter((e) => e.campaignId === c._id);
      return {
        id: c._id as string,
        name: c.name,
        status: c.status,
        objective: c.objective ?? null,
        audience: c.audience ?? null,
        startDate: c.startDate ?? null,
        endDate: c.endDate ?? null,
        entries: own.length,
        published: own.filter((e) => e.status === "published").length,
      };
    });

    const ideaItems = ideas
      .filter((i) => !i.convertedTo)
      .map((i) => ({
        id: i._id as string,
        title: i.title,
        platform: i.platform,
        contentType: i.contentType,
        campaignName: i.campaignId
          ? (campaignName.get(i.campaignId) ?? null)
          : null,
      }));

    return {
      marketing: {
        campaigns: campaignItems,
        entries: entryItems,
        ideas: ideaItems,
      },
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
      taskTitles: [...taskById.entries()].map(([id, t]) => ({
        id,
        title: t.title,
      })),
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
    if (!conversation || conversation.workspaceId !== session.workspaceId)
      return null;
    // Bounded history: only the most recent messages leave the database.
    const messages = (await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(40))
      .sort((a, b) => a.createdAt - b.createdAt);
    return messages;
  },
});
