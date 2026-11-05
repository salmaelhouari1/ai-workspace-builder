import { query } from "./_generated/server";
import { requireWorkspace } from "./lib/auth";
import { DAY_MS, relativeDayPhrase, utcDayStart } from "../lib/nlp";

/**
 * The Home screen answers one question: "What should I care about today?"
 *
 * Everything here is derived from real workspace data — the same rules the
 * spec's example screen uses:
 *
 *   1. Follow up with 3 leads      → custom AI reason
 *   2. Finish the landing page     → due tomorrow
 *   3. Prepare tomorrow's content  → nothing scheduled yet
 */
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId, userId } = await requireWorkspace(ctx);
    const [
      workspace,
      user,
      tasks,
      projects,
      goals,
      inbox,
      campaigns,
      posts,
      activity,
    ] = await Promise.all([
      ctx.db.get(workspaceId),
      ctx.db.get(userId),
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
        .query("inboxItems")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspaceId", workspaceId).eq("status", "pending"),
        )
        .take(50),
      ctx.db
        .query("campaigns")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .take(50),
      ctx.db
        .query("marketingEntries")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .take(200),
      ctx.db
        .query("activityLog")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .order("desc")
        .take(6),
    ]);

    const now = Date.now();
    const today = utcDayStart(now);
    const projectName = new Map(projects.map((p) => [p._id, p.name]));
    const open = tasks.filter((t) => t.status !== "done");

    // Is any content actually scheduled in the next 7 days?
    const contentExists = open.some(
      (t) =>
        (t.tags ?? []).includes("content") ||
        /content|post|video|newsletter|reel|tweet/i.test(t.title),
    );
    const contentScheduled = open.some(
      (t) =>
        t.dueDate !== undefined &&
        t.dueDate >= today &&
        t.dueDate <= today + 7 * DAY_MS &&
        ((t.tags ?? []).includes("content") ||
          /content|post|video|newsletter|reel|tweet/i.test(t.title)),
    );

    const SENTINEL = "content-nothing-scheduled";

    const reasonFor = (t: (typeof tasks)[number]): string => {
      const projectNameStr = t.projectId
        ? projectName.get(t.projectId)
        : undefined;
      if (t.dueDate !== undefined && t.dueDate < today) {
        return relativeDayPhrase(t.dueDate, now);
      }
      if (t.dueDate === today) {
        if (t.reason && t.reason !== SENTINEL) return t.reason;
        return t.dueTime ? `Due today at ${t.dueTime}.` : "Due today.";
      }
      if (t.dueDate === today + DAY_MS) return "Due tomorrow.";
      if (t.reason === SENTINEL) {
        if (!contentScheduled) return "You have nothing scheduled yet.";
        return t.dueDate !== undefined
          ? relativeDayPhrase(t.dueDate, now)
          : "Waiting to be scheduled.";
      }
      if (t.reason) return t.reason;
      if (t.dueDate !== undefined) return relativeDayPhrase(t.dueDate, now);
      if (t.priority === "high") {
        return projectNameStr
          ? `Top priority in ${projectNameStr}.`
          : "High priority.";
      }
      return "Suggested by OCIVO.";
    };

    const scoreFor = (t: (typeof tasks)[number]): number => {
      if (t.dueDate !== undefined && t.dueDate < today) return 100;
      if (t.dueDate === today) return 90;
      if (t.dueDate === today + DAY_MS) return 80;
      if (t.reason === SENTINEL && !contentScheduled) return 70;
      if (t.reason) return 75;
      if (t.priority === "high") return 60;
      if (t.dueDate !== undefined && t.dueDate <= today + 7 * DAY_MS) return 50;
      return 30;
    };

    const nextActions = [...open]
      .sort((a, b) => scoreFor(b) - scoreFor(a) || a.createdAt - b.createdAt)
      .slice(0, 4)
      .map((t) => ({
        taskId: t._id,
        title: t.title,
        reason: reasonFor(t),
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        dueTime: t.dueTime,
        projectId: t.projectId,
        projectName: t.projectId ? projectName.get(t.projectId) : undefined,
      }));

    // ---- Marketing: what is coming up next --------------------------------
    const campaignName = new Map(campaigns.map((c) => [c._id, c.name]));
    const upcomingPosts = posts
      .filter(
        (p) =>
          p.scheduledAt !== undefined &&
          p.scheduledAt >= now &&
          p.status !== "published",
      )
      .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
      .slice(0, 4)
      .map((p) => ({
        id: p._id,
        title: p.title,
        platform: p.platform,
        contentType: p.contentType,
        status: p.status,
        scheduledAt: p.scheduledAt ?? null,
        campaignName: p.campaignId
          ? campaignName.get(p.campaignId) ?? null
          : null,
        hasMedia: (p.attachments ?? []).length > 0,
      }));

    const scheduledPostCount = posts.filter(
      (p) =>
        p.scheduledAt !== undefined &&
        p.scheduledAt >= now &&
        p.status !== "published",
    ).length;

    // ---- Pending tasks ----------------------------------------------------
    const priorityRank = (p: string) =>
      p === "high" ? 0 : p === "medium" ? 1 : 2;
    const openTasks = [...open]
      .sort((a, b) => {
        const aDue = a.dueDate ?? Number.POSITIVE_INFINITY;
        const bDue = b.dueDate ?? Number.POSITIVE_INFINITY;
        return (
          aDue - bDue ||
          priorityRank(a.priority) - priorityRank(b.priority) ||
          a.createdAt - b.createdAt
        );
      })
      .slice(0, 6)
      .map((t) => ({
        id: t._id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate ?? null,
        dueTime: t.dueTime ?? null,
        projectId: t.projectId ?? null,
        projectName: t.projectId ? projectName.get(t.projectId) ?? null : null,
      }));

    // ---- Active projects --------------------------------------------------
    const activeProjects = projects
      .filter((p) => p.status === "active")
      .map((p) => {
        const own = tasks.filter((t) => t.projectId === p._id);
        const done = own.filter((t) => t.status === "done").length;
        return {
          id: p._id,
          name: p.name,
          description: p.description,
          deadline: p.deadline,
          totalTasks: own.length,
          doneTasks: done,
          progress: own.length ? Math.round((done / own.length) * 100) : 0,
        };
      })
      .sort((a, b) => b.progress - a.progress || b.totalTasks - a.totalTasks)
      .slice(0, 4);

    // ---- Goals ------------------------------------------------------------
    const projectById = new Map(projects.map((p) => [p._id, p]));
    const goalItems = goals
      .filter((g) => g.status === "active")
      .map((g) => {
        // Manual numbers win; linked projects provide real derived progress.
        const manual =
          g.target && g.target > 0 && g.current !== undefined
            ? Math.min(100, Math.round((g.current / g.target) * 100))
            : null;
        let derived: number | null = null;
        if (manual === null && g.projectIds?.length) {
          let done = 0;
          let total = 0;
          for (const id of g.projectIds) {
            const own = tasks.filter((t) => t.projectId === id);
            done += own.filter((t) => t.status === "done").length;
            total += own.length;
          }
          derived = total > 0 ? Math.round((done / total) * 100) : null;
        }
        const progress = manual ?? derived;
        const linkedProjectNames = (g.projectIds ?? [])
          .map((id) => projectById.get(id)?.name)
          .filter((n): n is string => Boolean(n));
        let note: string | null = null;
        if (progress !== null && g.deadline && g.createdAt) {
          const total = g.deadline - g.createdAt;
          if (total > DAY_MS) {
            const expected = Math.min(
              100,
              Math.max(0, Math.round(((now - g.createdAt) / total) * 100)),
            );
            const delta = expected - progress;
            const month = new Date(g.deadline).toLocaleDateString(undefined, {
              month: "long",
            });
            if (delta >= 4) {
              note = `You're currently ${delta}% behind the pace required to reach your ${month} goal.`;
            } else if (delta <= -4) {
              note = `You're ${Math.abs(delta)}% ahead of pace for your ${month} goal.`;
            } else {
              note = `Right on pace for your ${month} goal.`;
            }
          }
        }
        return {
          id: g._id,
          title: g.title,
          current: g.current,
          target: g.target,
          unit: g.unit,
          deadline: g.deadline,
          progress,
          note,
          linkedProjectNames,
        };
      })
      .slice(0, 3);

    // ---- Upcoming ---------------------------------------------------------
    type Upcoming = {
      key: string;
      label: string;
      when: number;
      whenLabel: string;
      route: string;
      kind: "task" | "project" | "goal";
    };
    const upcoming: Upcoming[] = [];

    for (const t of open) {
      if (t.dueDate !== undefined && t.dueDate >= today) {
        upcoming.push({
          key: `t-${t._id}`,
          label: t.title,
          when: t.dueDate,
          whenLabel: relativeDayPhrase(t.dueDate, now).replace(/\.$/, ""),
          route: "/app/tasks",
          kind: "task",
        });
      }
    }
    for (const p of projects) {
      if (
        p.deadline !== undefined &&
        p.deadline >= today &&
        p.status !== "done"
      ) {
        upcoming.push({
          key: `p-${p._id}`,
          label: p.name,
          when: p.deadline,
          whenLabel: relativeDayPhrase(p.deadline, now).replace(/\.$/, ""),
          route: `/app/projects/${p._id}`,
          kind: "project",
        });
      }
    }
    for (const g of goals) {
      if (
        g.deadline !== undefined &&
        g.deadline >= today &&
        g.status !== "active"
      )
        continue;
      if (
        g.deadline !== undefined &&
        g.deadline >= today &&
        g.status === "active"
      ) {
        upcoming.push({
          key: `g-${g._id}`,
          label: g.title,
          when: g.deadline,
          whenLabel: relativeDayPhrase(g.deadline, now).replace(/\.$/, ""),
          route: "/app/goals",
          kind: "goal",
        });
      }
    }
    upcoming.sort((a, b) => a.when - b.when);

    // ---- AI insights ------------------------------------------------------
    type Insight = {
      id: string;
      text: string;
      tone: "warn" | "info" | "good";
      route?: string;
      action?: {
        kind: "organize";
        projectId: string;
        projectIdName: string;
        count: number;
      };
    };
    const insights: Insight[] = [];

    const overdueTasks = open.filter(
      (t) => t.dueDate !== undefined && t.dueDate < today,
    );
    if (overdueTasks.length) {
      const counts = new Map<string, number>();
      for (const t of overdueTasks) {
        const name = t.projectId ? projectName.get(t.projectId) : undefined;
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      insights.push({
        id: "overdue",
        text:
          `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}` +
          (top && top[1] >= 2 ? ` related to ${top[0]}` : "") +
          ".",
        tone: "warn",
        route: "/app/tasks",
      });
    }

    // Automatic organization suggestion (spec §19) — suggest, never restructure.
    const orphans = open.filter((t) => !t.projectId);
    if (orphans.length >= 3) {
      let best: { id: string; name: string; count: number } | null = null;
      for (const p of projects) {
        const tokens = p.name
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((x) => x.length > 3);
        if (!tokens.length) continue;
        const count = orphans.filter((t) =>
          tokens.some((tok) =>
            `${t.title} ${t.description ?? ""}`.toLowerCase().includes(tok),
          ),
        ).length;
        if (count >= 3 && (!best || count > best.count)) {
          best = { id: p._id, name: p.name, count };
        }
      }
      if (best) {
        insights.push({
          id: "organize",
          text: `You have ${best.count} tasks that appear to belong to your ${best.name} project.`,
          tone: "info",
          action: {
            kind: "organize",
            projectId: best.id,
            projectIdName: best.name,
            count: best.count,
          },
        });
      } else {
        insights.push({
          id: "orphans",
          text: `${orphans.length} tasks don't belong to a project yet.`,
          tone: "info",
          route: "/app/tasks",
        });
      }
    }

    if (contentExists && !contentScheduled) {
      insights.push({
        id: "content",
        text: "Your content calendar has no posts scheduled for next week.",
        tone: "info",
        route: "/app/tasks",
      });
    }

    const pendingInbox = inbox.length;
    if (pendingInbox > 0) {
      insights.push({
        id: "inbox",
        text: `You have ${pendingInbox} unprocessed note${pendingInbox > 1 ? "s" : ""} in your Inbox.`,
        tone: "info",
        route: "/app/inbox",
      });
    }

    const dueSoon = open.filter(
      (t) =>
        t.dueDate !== undefined &&
        t.dueDate >= today &&
        t.dueDate <= today + 7 * DAY_MS,
    );
    if (!dueSoon.length && open.length && insights.length < 3) {
      insights.push({
        id: "plan",
        text: "Nothing is scheduled for the next 7 days — ask OCIVO to plan your week.",
        tone: "info",
        route: "/app/ai",
      });
    }

    if (!insights.length) {
      insights.push({
        id: "all-clear",
        text: "Everything is under control — no overdue work, nothing waiting on you.",
        tone: "good",
      });
    }

    const firstName = (user?.name ?? "").trim().split(/\s+/)[0] || null;

    return {
      userName: firstName,
      workspaceName: workspace?.name ?? "your workspace",
      businessType: workspace?.businessType ?? "general",
      nextActions,
      activeProjects,
      goals: goalItems,
      upcoming: upcoming.slice(0, 6),
      insights: insights.slice(0, 4),
      upcomingPosts,
      openTasks,
      recentActivity: activity.map((a) => ({
        id: a._id,
        actor: a.actor,
        action: a.action,
        detail: a.detail,
        route: a.route ?? null,
        createdAt: a.createdAt,
      })),
      counts: {
        openTasks: open.length,
        projects: projects.filter((p) => p.status === "active").length,
        pendingInbox,
        scheduledPosts: scheduledPostCount,
        drafts: posts.filter((p) => p.status === "draft").length,
      },
    };
  },
});
