import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireWorkspace } from "./lib/auth";
import { scoreText } from "../lib/nlp";

export interface SearchHit {
  kind: "task" | "project" | "document" | "goal" | "note";
  id: string;
  title: string;
  subtitle?: string;
  route: string;
  score: number;
}

/**
 * Global search across the whole workspace (spec §18). Keyword-overlap
 * scoring with a phrase bonus, so "website client" finds the client website
 * redesign task even without exact word matches.
 */
export const run = query({
  args: { q: v.string() },
  handler: async (ctx, args): Promise<SearchHit[]> => {
    const q = args.q.trim();
    if (q.length < 2) return [];
    const { workspaceId } = await requireWorkspace(ctx);

    // Bounded scans: search reads at most this many rows per entity, keeping
    // the query cheap at any workspace size.
    const CAP = 300;
    const [tasks, projects, docs, goals, inbox] = await Promise.all([
      ctx.db.query("tasks").withIndex("by_workspace", (x) => x.eq("workspaceId", workspaceId)).take(CAP),
      ctx.db.query("projects").withIndex("by_workspace", (x) => x.eq("workspaceId", workspaceId)).collect(),
      ctx.db.query("documents").withIndex("by_workspace", (x) => x.eq("workspaceId", workspaceId)).take(CAP),
      ctx.db.query("goals").withIndex("by_workspace", (x) => x.eq("workspaceId", workspaceId)).collect(),
      ctx.db
        .query("inboxItems")
        .withIndex("by_workspace_status", (x) =>
          x.eq("workspaceId", workspaceId).eq("status", "pending"),
        )
        .take(40),
    ]);

    const hits: SearchHit[] = [];

    for (const p of projects) {
      const s = scoreText(q, p.name, p.description);
      if (s > 0.12) {
        hits.push({
          kind: "project",
          id: p._id,
          title: p.name,
          subtitle: p.description,
          route: `/app/projects/${p._id}`,
          score: s + 0.25,
        });
      }
    }
    for (const t of tasks) {
      const s = scoreText(q, t.title, t.description, t.tags?.join(" "));
      if (s > 0.12) {
        hits.push({
          kind: "task",
          id: t._id,
          title: t.title,
          subtitle: t.status === "done" ? "Done" : undefined,
          route: "/app/tasks",
          score: s,
        });
      }
    }
    for (const d of docs) {
      const s = scoreText(q, d.title, d.content.slice(0, 1200), d.category);
      if (s > 0.12) {
        hits.push({
          kind: "document",
          id: d._id,
          title: d.title,
          subtitle: d.category,
          route: `/app/documents/${d._id}`,
          score: s,
        });
      }
    }
    for (const g of goals) {
      const s = scoreText(q, g.title, g.description);
      if (s > 0.12) {
        hits.push({ kind: "goal", id: g._id, title: g.title, route: "/app/goals", score: s });
      }
    }
    for (const i of inbox) {
      const s = scoreText(q, i.title, i.raw);
      if (s > 0.2) {
        hits.push({
          kind: "note",
          id: i._id,
          title: i.title,
          subtitle: "Inbox note",
          route: "/app/inbox",
          score: s * 0.8,
        });
      }
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, 14);
  },
});
