"use node";

/**
 * OCIVO AI (spec §7, §8, §24, §25).
 *
 * - Contextual retrieval: a compact workspace snapshot is re-ranked against
 *   the question before anything reaches the model.
 * - Safety: structural changes come back as *proposals* the UI must confirm;
 *   the model never gets a direct write path.
 * - Resilience: if the gateway is unavailable, a deterministic responder
 *   answers from the same snapshot, so the assistant never goes dark.
 */

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { vly } from "../lib/vly-integrations";
import {
  fallbackAnswer,
  type AssistantReference,
  type FallbackContext,
} from "../lib/ai-fallback";
import { parseInboxLocal, type InboxEntry } from "../lib/inbox";
import { scoreText } from "../lib/nlp";

const MODEL = "gpt-4o-mini";

type Context = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

async function loadContext(ctx: ActionCtx) {
  return await ctx.runQuery(api.context.workspaceContext, {});
}

// ---------------------------------------------------------------------------
// Snapshot + contextual retrieval
// ---------------------------------------------------------------------------

function rank<T>(
  items: T[],
  question: string,
  text: (t: T) => string,
  cap: number,
): T[] {
  return items
    .map((item) => ({ item, s: scoreText(question, text(item)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, cap)
    .map((x) => x.item);
}

function buildSnapshot(
  context: Context,
  question: string,
  focusDocId?: string,
): string {
  const lines: string[] = [];
  const w = context.workspace;
  lines.push(
    `WORKSPACE: ${w.name} | business type: ${w.businessType} | main goal: ${w.mainGoal ?? "not set"} | today: ${context.today}`,
  );

  if (context.goals.length) {
    lines.push("GOALS:");
    for (const g of context.goals.slice(0, 8)) {
      lines.push(
        `- [goal:${g.id}] ${g.title} | ${g.current ?? "—"}${g.unit ?? ""} of ${g.target ?? "—"}${g.unit ?? ""}${g.progress !== null ? ` (${g.progress}%)` : ""}${g.projects?.length ? ` | tracked by projects: ${g.projects.join(", ")}` : ""} | due ${g.deadline ?? "none"} | route /app/goals`,
      );
    }
  }

  if (context.projects.length) {
    lines.push("PROJECTS:");
    for (const p of context.projects.slice(0, 14)) {
      lines.push(
        `- [project:${p.id}] ${p.name} | ${p.status} | ${p.progress}% done (${p.doneTasks}/${p.totalTasks} tasks) | due ${p.deadline ?? "none"}${p.description ? ` | ${p.description.slice(0, 140)}` : ""} | route /app/projects/${p.id}`,
      );
    }
  }

  const openTasks = context.tasks.filter((t) => t.status !== "done");
  const relevantTasks = rank(
    openTasks,
    question,
    (t) =>
      `${t.title} ${t.project ?? ""} ${t.reason ?? ""} ${t.tags.join(" ")}`,
    40,
  );
  // Always keep overdue/today's work in the prompt — it drives most questions.
  const always = openTasks.filter((t) => t.overdue || t.due === "Today");
  const merged = new Map<string, (typeof context.tasks)[number]>();
  for (const t of [...always, ...relevantTasks]) merged.set(t.id, t);

  if (merged.size) {
    lines.push("OPEN TASKS:");
    for (const t of [...merged.values()].slice(0, 45)) {
      lines.push(
        `- [task:${t.id}] ${t.title} | due ${t.due ?? "no date"}${t.overdue ? " (OVERDUE)" : ""} | ${t.status} | ${t.priority}${t.project ? ` | project ${t.project}` : ""}${t.reason ? ` | context: ${t.reason}` : ""} | route /app/tasks`,
      );
    }
  }

  const docs = focusDocId
    ? context.documents
    : rank(context.documents, question, (d) => `${d.title} ${d.excerpt}`, 5);
  if (docs.length) {
    lines.push("DOCUMENTS:");
    for (const d of docs.slice(0, 6)) {
      const body =
        focusDocId === d.id ? d.full.slice(0, 3500) : d.excerpt.slice(0, 320);
      lines.push(
        `- [doc:${d.id}] "${d.title}" (${d.category}) | route /app/documents/${d.id}\n  ${body.replace(/\n+/g, " ⏎ ")}`,
      );
    }
  }

  if (context.pendingInbox) {
    lines.push(
      `INBOX: ${context.pendingInbox} unprocessed item(s) waiting for review.`,
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Proposal conversion (untrusted model JSON → validated mutation args)
// ---------------------------------------------------------------------------

export interface TaskSpec {
  title: string;
  description?: string;
  dueDate?: number;
  dueTime?: string;
  priority?: "low" | "medium" | "high";
}

export type Proposal =
  | {
      kind: "createTasks";
      tasks: TaskSpec[];
      projectId?: Id<"projects">;
      projectLabel?: string;
    }
  | {
      kind: "createProject";
      name: string;
      description?: string;
      deadline?: number;
      tasks: TaskSpec[];
    }
  | {
      kind: "updateTask";
      taskId: Id<"tasks">;
      title?: string;
      dueDate?: number;
      dueTime?: string;
      clearDue?: boolean;
      status?: "todo" | "in_progress" | "done";
      note?: string;
    }
  | {
      kind: "updateProject";
      projectId: Id<"projects">;
      deadline?: number;
      clearDeadline?: boolean;
      status?: "planned" | "active" | "paused" | "done";
      note?: string;
    }
  | {
      kind: "createGoal";
      title: string;
      target?: number;
      current?: number;
      unit?: string;
      deadline?: number;
    }
  | {
      kind: "createDocument";
      title: string;
      content: string;
      category?: string;
    };

function dayFromIso(iso: unknown): number | undefined {
  if (typeof iso !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return undefined;
  const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ts) ? ts : undefined;
}

function asPriority(p: unknown): "low" | "medium" | "high" | undefined {
  return p === "low" || p === "high" || p === "medium" ? p : undefined;
}

function taskSpecs(raw: unknown): TaskSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskSpec[] = [];
  for (const item of raw.slice(0, 30)) {
    const t = item as Record<string, unknown>;
    if (typeof t?.title !== "string" || !t.title.trim()) continue;
    const due = dayFromIso(t.due);
    out.push({
      title: t.title.trim().slice(0, 200),
      description:
        typeof t.description === "string"
          ? t.description.slice(0, 800)
          : undefined,
      dueDate: due,
      dueTime:
        typeof t.dueTime === "string" && /^\d{1,2}:\d{2}$/.test(t.dueTime)
          ? t.dueTime
          : undefined,
      priority: asPriority(t.priority),
    });
  }
  return out;
}

function convertProposal(raw: unknown, context: Context): Proposal | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  try {
    switch (p.type) {
      case "createTasks": {
        const tasks = taskSpecs(p.tasks);
        if (!tasks.length) return null;
        let projectId: Id<"projects"> | undefined;
        let projectLabel: string | undefined;
        if (typeof p.project === "string" && p.project.trim()) {
          projectLabel = p.project.trim();
          const match = context.projects.find(
            (x) => x.name.toLowerCase() === projectLabel!.toLowerCase(),
          );
          if (match) projectId = match.id as Id<"projects">;
        }
        return { kind: "createTasks", tasks, projectId, projectLabel };
      }
      case "createProject": {
        if (typeof p.name !== "string" || !p.name.trim()) return null;
        return {
          kind: "createProject",
          name: p.name.trim().slice(0, 160),
          description:
            typeof p.description === "string"
              ? p.description.slice(0, 600)
              : undefined,
          deadline: dayFromIso(p.deadline),
          tasks: taskSpecs(p.tasks),
        };
      }
      case "updateTask": {
        if (typeof p.taskId !== "string") return null;
        const known = context.tasks.find((t) => t.id === p.taskId);
        if (!known) return null;
        const note =
          typeof p.note === "string" ? p.note.slice(0, 300) : undefined;
        const clearDue = p.due === null;
        const due = dayFromIso(p.due);
        const status =
          p.status === "todo" ||
          p.status === "in_progress" ||
          p.status === "done"
            ? p.status
            : undefined;
        if (
          !clearDue &&
          due === undefined &&
          typeof p.title !== "string" &&
          !status
        )
          return null;
        return {
          kind: "updateTask",
          taskId: p.taskId as Id<"tasks">,
          title:
            typeof p.title === "string" && p.title.trim()
              ? p.title.trim().slice(0, 200)
              : undefined,
          dueDate: due,
          clearDue,
          status,
          note,
        };
      }
      case "updateProject": {
        if (typeof p.projectId !== "string") return null;
        const known = context.projects.find((x) => x.id === p.projectId);
        if (!known) return null;
        const clearDeadline = p.deadline === null;
        const deadline = dayFromIso(p.deadline);
        const status =
          p.status === "planned" ||
          p.status === "active" ||
          p.status === "paused" ||
          p.status === "done"
            ? p.status
            : undefined;
        if (!clearDeadline && deadline === undefined && !status) return null;
        return {
          kind: "updateProject",
          projectId: p.projectId as Id<"projects">,
          deadline,
          clearDeadline,
          status,
          note: typeof p.note === "string" ? p.note.slice(0, 300) : undefined,
        };
      }
      case "createGoal": {
        if (typeof p.title !== "string" || !p.title.trim()) return null;
        return {
          kind: "createGoal",
          title: p.title.trim().slice(0, 160),
          target: typeof p.target === "number" ? p.target : undefined,
          current: typeof p.current === "number" ? p.current : undefined,
          unit: typeof p.unit === "string" ? p.unit.slice(0, 20) : undefined,
          deadline: dayFromIso(p.deadline),
        };
      }
      case "createDocument": {
        if (typeof p.title !== "string" || !p.title.trim()) return null;
        if (typeof p.content !== "string" || !p.content.trim()) return null;
        return {
          kind: "createDocument",
          title: p.title.trim().slice(0, 160),
          content: p.content.slice(0, 20000),
          category:
            typeof p.category === "string"
              ? p.category.slice(0, 60)
              : undefined,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function sanitizeReferences(raw: unknown): AssistantReference[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantReference[] = [];
  for (const item of raw.slice(0, 8)) {
    const r = item as Record<string, unknown>;
    if (
      typeof r?.label === "string" &&
      typeof r?.route === "string" &&
      r.route.startsWith("/app") &&
      !r.route.includes("..")
    ) {
      out.push({
        label: r.label.slice(0, 80),
        kind: typeof r.kind === "string" ? r.kind.slice(0, 24) : "workspace",
        route: r.route,
      });
    }
  }
  return out;
}

function toFallbackContext(context: Context): FallbackContext {
  return {
    workspaceName: context.workspace.name,
    businessType: context.workspace.businessType,
    tasks: context.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ?? undefined,
      reason: t.reason ?? undefined,
      projectName: t.project ?? undefined,
      tags: t.tags,
    })),
    projects: context.projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      deadline: p.deadlineTs ?? undefined,
      doneTasks: p.doneTasks,
      totalTasks: p.totalTasks,
    })),
    goals: context.goals.map((g) => ({
      id: g.id,
      title: g.title,
      target: g.target ?? undefined,
      current: g.current ?? undefined,
      unit: g.unit ?? undefined,
      deadline: g.deadlineTs ?? undefined,
    })),
    pendingInbox: context.pendingInbox,
    documentTitles: context.documents.map((d) => d.title),
  };
}

const SYSTEM_BASE = `You are OCIVO, the AI inside an AI-native workspace for entrepreneurs, freelancers, creators and small businesses. The workspace builds itself from what the user is building — you keep it organised.

How to behave:
- Answer ONLY from the WORKSPACE SNAPSHOT below. Be concrete: mention real task, project and goal names. If the data doesn't contain the answer, say what's missing instead of inventing facts.
- Match the user's language (if they write Spanish, reply in Spanish).
- Keep it short and scannable: brief paragraphs, numbered lists, **bold** for names. No headings unless helpful.
- When you refer to a workspace item, also return it in "references" copying the exact route shown in the snapshot.
- If the user asks you to CREATE, UPDATE, ORGANISE, PLAN or CONVERT something structural, do NOT pretend it exists yet. Set "proposal" to ONE proposal object and say you've prepared it for confirmation.
- Never propose deleting data, and never propose changes you weren't asked for.
- Dates in proposals use "YYYY-MM-DD" (today is in the snapshot). If a task's due date should be cleared, use "due": null.

Return STRICT JSON only — no prose outside it:
{
  "answer": "your reply (markdown allowed)",
  "references": [{"label": "...", "kind": "project|task|goal|document|workspace", "route": "/app/..."}],
  "proposal": null | PROPOSAL
}

PROPOSAL variants (exactly one):
- {"type":"createTasks","project":"<exact project name or omit>","tasks":[{"title":"...","description":"...","due":"YYYY-MM-DD","dueTime":"HH:MM","priority":"low|medium|high"}]}
- {"type":"createProject","name":"...","description":"...","deadline":"YYYY-MM-DD","tasks":[...]}
- {"type":"updateTask","taskId":"...","title":"...","due":"YYYY-MM-DD"|null,"status":"todo|in_progress|done","note":"one-line summary of the change"}
- {"type":"updateProject","projectId":"...","deadline":"YYYY-MM-DD"|null,"status":"planned|active|paused|done","note":"one-line summary"}
- {"type":"createGoal","title":"...","target":10000,"current":0,"unit":"€","deadline":"YYYY-MM-DD"}
- {"type":"createDocument","title":"...","content":"# markdown ...","category":"Notes"}`;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface ChatResult {
  answer: string;
  references: AssistantReference[];
  proposal: Proposal | null;
  conversationId: Id<"aiConversations"> | null;
  source: "ai" | "offline";
}

export const chat = action({
  args: {
    question: v.string(),
    conversationId: v.optional(v.id("aiConversations")),
    mode: v.optional(v.union(v.literal("chat"), v.literal("document"))),
    documentId: v.optional(v.id("documents")),
    instruction: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ChatResult> => {
    const context = await loadContext(ctx);
    if (!context) {
      return {
        answer: "You're signed out — sign back in to talk to your workspace.",
        references: [] as AssistantReference[],
        proposal: null,
        conversationId: null,
        source: "offline" as const,
      };
    }

    const question = args.question.trim().slice(0, 4000);
    const focusDoc =
      args.mode === "document" && args.documentId
        ? context.documents.find((d) => d.id === args.documentId)
        : undefined;

    const snapshot = buildSnapshot(context, question, focusDoc?.id);

    // Conversation continuity (bounded).
    let history: { role: "user" | "assistant"; content: string }[] = [];
    if (args.conversationId) {
      const messages = await ctx.runQuery(api.context.conversationHistory, {
        conversationId: args.conversationId,
      });
      if (messages) {
        history = messages
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 600) }));
      }
    }

    const system =
      SYSTEM_BASE +
      "\n\nWORKSPACE SNAPSHOT:\n" +
      snapshot +
      (focusDoc
        ? `\n\nTHE USER IS EDITING DOCUMENT "${focusDoc.title}".\nInstruction: ${args.instruction ?? "Help with this document."}\nIf the instruction implies creating tasks/checklists/action plans, return them as a "createTasks" proposal (or "createDocument" if it's a new document).`
        : "");

    let answer = "";
    let references: AssistantReference[] = [];
    let proposal: Proposal | null = null;
    let source: "ai" | "offline" = "ai";

    try {
      const res = await vly.ai.completion(
        {
          model: MODEL,
          messages: [
            { role: "system", content: system },
            ...history,
            { role: "user", content: question || (args.instruction ?? "") },
          ],
          temperature: 0.3,
          maxTokens: 1600,
        },
        { timeout: 20000, retries: 1 },
      );
      const text = res.data?.choices?.[0]?.message?.content;
      if (!res.success || !text)
        throw new Error(res.error || "empty completion");

      const parsed = parseJson<{
        answer?: unknown;
        references?: unknown;
        proposal?: unknown;
      }>(text);

      if (parsed && typeof parsed.answer === "string") {
        answer = parsed.answer.trim();
        references = sanitizeReferences(parsed.references);
        proposal = convertProposal(parsed.proposal, context);
      } else {
        answer = text.trim();
      }
    } catch (err) {
      source = "offline";
      const offline = fallbackAnswer(question, toFallbackContext(context));
      answer = offline.answer;
      references = offline.references;
      console.warn("[ocivo] AI gateway unavailable, offline answer used:", err);
    }

    if (!answer) {
      answer = "I couldn't put that together — try rephrasing?";
    }

    const saved: { conversationId: Id<"aiConversations"> } =
      await ctx.runMutation(api.conversations.saveExchange, {
        conversationId: args.conversationId,
        question,
        answer,
        references,
      });

    return {
      answer,
      references,
      proposal,
      conversationId: saved.conversationId,
      source,
    };
  },
});

// ---------------------------------------------------------------------------
// Inbox parsing (spec §9)
// ---------------------------------------------------------------------------

const INBOX_SYSTEM = `You split a raw note dump from an entrepreneur's inbox into reviewable entries.

Return STRICT JSON only:
{"items":[{"kind":"task|note|link|idea","title":"short imperative title","detail":"original fragment","due":"YYYY-MM-DD","url":"https://..."}]}

Rules:
- Anything actionable becomes a task (imperative title, extract dates: today is $TODAY, use "YYYY-MM-DD").
- Links become kind "link" with the url.
- Ideas ("what if...", "maybe we could...") become "idea".
- Everything else is a "note".
- Keep the original wording in "detail". Do not invent entries that aren't in the text. Return [] for empty input.`;

interface InboxAI {
  items?: Array<{
    kind?: string;
    title?: string;
    detail?: string;
    due?: string;
    url?: string;
  }>;
}

const INBOX_KINDS = ["task", "note", "link", "idea"] as const;

export const parseInbox = action({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const text = args.text.trim().slice(0, 8000);
    if (!text) return { items: [] as InboxEntry[], source: "offline" as const };

    try {
      const context = await loadContext(ctx);
      const res = await vly.ai.completion(
        {
          model: MODEL,
          temperature: 0,
          maxTokens: 1200,
          messages: [
            {
              role: "system",
              content: INBOX_SYSTEM.replace(
                "$TODAY",
                context?.today ?? "today",
              ),
            },
            { role: "user", content: text },
          ],
        },
        { timeout: 20000, retries: 1 },
      );
      const body = res.data?.choices?.[0]?.message?.content;
      if (!res.success || !body)
        throw new Error(res.error || "empty completion");
      const parsed = parseJson<InboxAI>(body);
      if (!parsed?.items?.length) throw new Error("no items");

      const items: InboxEntry[] = [];
      for (const raw of parsed.items.slice(0, 24)) {
        if (!raw?.title || typeof raw.title !== "string") continue;
        const kind = INBOX_KINDS.includes(
          raw.kind as (typeof INBOX_KINDS)[number],
        )
          ? (raw.kind as InboxEntry["kind"])
          : "note";
        items.push({
          kind,
          title: raw.title.trim().slice(0, 160),
          detail:
            typeof raw.detail === "string"
              ? raw.detail.slice(0, 1000)
              : undefined,
          dueDate: dayFromIso(raw.due),
          url:
            typeof raw.url === "string" && /^https?:\/\//.test(raw.url)
              ? raw.url
              : undefined,
          include: true,
        });
      }
      if (!items.length) throw new Error("no items");
      return { items, source: "ai" as const };
    } catch (err) {
      console.warn("[ocivo] inbox AI unavailable, offline parser used:", err);
      return { items: parseInboxLocal(text), source: "offline" as const };
    }
  },
});
