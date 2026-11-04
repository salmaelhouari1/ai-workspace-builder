/**
 * Deterministic assistant fallback.
 *
 * Used whenever the AI gateway is slow or unavailable so OCIVO still answers
 * questions from real workspace data. It intentionally mirrors the answer
 * shapes the LLM path produces: prose + clickable references.
 */

import { marketingPlatformLabel } from "./marketing";
import { relativeDayPhrase, utcDayStart, DAY_MS } from "./nlp";

export interface FallbackTask {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: number;
  reason?: string;
  projectId?: string;
  projectName?: string;
  tags?: string[];
}

export interface FallbackProject {
  id: string;
  name: string;
  status: string;
  deadline?: number;
  doneTasks: number;
  totalTasks: number;
}

export interface FallbackGoal {
  id: string;
  title: string;
  target?: number;
  current?: number;
  unit?: string;
  deadline?: number;
}

export interface FallbackMarketingEntry {
  id: string;
  title: string;
  platform: string;
  contentType: string;
  status: string;
  scheduledAt?: number;
  campaignName?: string;
}

export interface FallbackMarketing {
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    startDate?: number;
    endDate?: number;
    entries: number;
  }>;
  entries: FallbackMarketingEntry[];
  ideas: number;
}

export interface FallbackContext {
  workspaceName: string;
  businessType: string;
  tasks: FallbackTask[];
  projects: FallbackProject[];
  goals: FallbackGoal[];
  pendingInbox: number;
  documentTitles: string[];
  marketing?: FallbackMarketing;
}

export interface AssistantReference {
  label: string;
  kind: string;
  route: string;
}

export interface FallbackAnswer {
  answer: string;
  references: AssistantReference[];
}

function pct(goal: FallbackGoal): number | null {
  if (!goal.target || goal.target <= 0 || goal.current === undefined) return null;
  return Math.min(100, Math.round((goal.current / goal.target) * 100));
}

function taskLine(t: FallbackTask): string {
  const when = t.dueDate ? ` — ${relativeDayPhrase(t.dueDate).replace(/\.$/, "")}` : "";
  const proj = t.projectName ? ` (${t.projectName})` : "";
  return `- **${t.title}**${when}${proj}`;
}

export function fallbackAnswer(
  question: string,
  ctx: FallbackContext,
): FallbackAnswer {
  const q = question.toLowerCase();
  const open = ctx.tasks.filter((t) => t.status !== "done");
  const now = Date.now();
  const today = utcDayStart(now);
  const overdue = open.filter((t) => t.dueDate !== undefined && t.dueDate < today);
  const dueToday = open.filter((t) => t.dueDate === today);
  const dueTomorrow = open.filter((t) => t.dueDate === today + DAY_MS);
  const refs: AssistantReference[] = [];

  const rank = (t: FallbackTask) => {
    if (t.dueDate === undefined) return t.priority === "high" ? 60 : 30;
    const d = (t.dueDate - today) / DAY_MS;
    if (d < 0) return 100;
    if (d === 0) return 90;
    if (d === 1) return 80;
    return 50 - Math.min(40, d);
  };
  const top = [...open].sort((a, b) => rank(b) - rank(a)).slice(0, 3);

  // ---- intent matching ---------------------------------------------------
  if (/\boverdue\b|\blate\b|\bbehind\b/.test(q)) {
    if (!overdue.length) {
      return {
        answer: "Nothing is overdue — you're fully caught up. 🎯",
        references: [],
      };
    }
    for (const t of overdue.slice(0, 5)) {
      if (t.projectId && t.projectName) {
        refs.push({ label: t.projectName, kind: "project", route: `/app/projects/${t.projectId}` });
      }
    }
    return {
      answer:
        `You have **${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}**:\n\n` +
        overdue.slice(0, 6).map(taskLine).join("\n") +
        "\n\nStart with the oldest one — everything else can wait an hour.",
      references: dedupe(refs),
    };
  }

  if (/\bwhat should i\b|\btoday\b|\bdo next\b|\bpriorit|\bfirst\b|\bthis week\b/.test(q)) {
    for (const t of top) {
      if (t.projectId && t.projectName) {
        refs.push({ label: t.projectName, kind: "project", route: `/app/projects/${t.projectId}` });
      }
    }
    if (!top.length) {
      return {
        answer:
          "Nothing is demanding your attention right now. 🎯\n\nTry adding your next task from the command bar (**⌘K**) or dump raw notes in the **Inbox** — I'll sort them.",
        references: [],
      };
    }
    const lines = top
      .map((t, i) => {
        const why = t.dueDate !== undefined && t.dueDate <= today + DAY_MS
          ? relativeDayPhrase(t.dueDate)
          : t.reason ?? (t.priority === "high" ? "High priority." : "Next in line.");
        return `${i + 1}. **${t.title}** — ${why}`;
      })
      .join("\n");
    return {
      answer: `Here's what I'd do next:\n\n${lines}`,
      references: dedupe(refs),
    };
  }

  if (/\bsummar|\boverview\b|\bstatus\b|\bprojects?\b|\bprogress\b/.test(q) && /project|everything|current|work|status|summar|overview/.test(q)) {
    if (!ctx.projects.length) {
      return { answer: "You don't have any projects yet — want me to create your first one?", references: [] };
    }
    const lines = ctx.projects
      .map((p) => {
        const bar = "█".repeat(Math.round((p.totalTasks ? p.doneTasks / p.totalTasks : 0) * 8)).padEnd(8, "░");
        const due = p.deadline ? ` — due ${relativeDayPhrase(p.deadline).replace(/\.$/, "").toLowerCase()}` : "";
        refs.push({ label: p.name, kind: "project", route: `/app/projects/${p.id}` });
        return `- **${p.name}** [${bar}] ${p.doneTasks}/${p.totalTasks} tasks${due}`;
      })
      .join("\n");
    return {
      answer: `Here's where **${ctx.workspaceName}** stands:\n\n${lines}\n\n${overdue.length ? `⚠️ ${overdue.length} task${overdue.length > 1 ? "s are" : " is"} overdue.` : "No overdue work. Nice."}`,
      references: dedupe(refs),
    };
  }

  if (/\blead|\bclient|\bfollow[- ]?up|\bcontact\b/.test(q)) {
    const followUps = open.filter((t) => /follow|lead|client|proposal|outreach/i.test(t.title));
    if (!followUps.length) {
      return {
        answer: "I can't find any follow-up tasks right now. Dump new leads in the **Inbox** and I'll create them for you.",
        references: [],
      };
    }
    for (const t of followUps) {
      if (t.projectId && t.projectName) {
        refs.push({ label: t.projectName, kind: "project", route: `/app/projects/${t.projectId}` });
      }
    }
    return {
      answer:
        `You have **${followUps.length} open follow-up${followUps.length > 1 ? "s" : ""}**:\n\n` +
        followUps.map(taskLine).join("\n"),
      references: dedupe(refs),
    };
  }

  if (/\bgoal|\brevenue|\btarget\b/.test(q)) {
    if (!ctx.goals.length) {
      return { answer: "No goals yet. Want me to create one — e.g. \"Reach €10,000 by December\"?", references: [] };
    }
    const lines = ctx.goals
      .map((g) => {
        const p = pct(g);
        refs.push({ label: g.title, kind: "goal", route: "/app/goals" });
        const value = g.current !== undefined && g.target
          ? `${g.current}${g.unit === "%" ? "%" : ` ${g.unit ?? ""} / ${g.target}${g.unit === "%" ? "%" : ` ${g.unit ?? ""}`}`}`
          : "not tracked yet";
        return `- **${g.title}** — ${value}${p !== null ? ` (${p}%)` : ""}`;
      })
      .join("\n");
    return { answer: `Your goals:\n\n${lines}`, references: dedupe(refs) };
  }

  if (/\binbox|\bnotes?\b|\bunprocessed\b/.test(q)) {
    return {
      answer: ctx.pendingInbox
        ? `You have **${ctx.pendingInbox} unprocessed item${ctx.pendingInbox > 1 ? "s" : ""}** waiting in your Inbox. Review them and I'll turn the tasks into real tasks.`
        : "Your Inbox is empty — dump anything in there (notes, links, meeting minutes) and I'll organise it.",
      references: [],
    };
  }

  if (/\bcontent\b|\bpost\b|\bcalendar\b|\bemail\b|\bnewsletter\b|\bschedul|\bcampaign\b|\bmarketing\b/.test(q)) {
    const planner = ctx.marketing;
    const planned = (planner?.entries ?? []).filter((e) => e.status !== "published");
    if (planned.length) {
      refs.push({ label: "Marketing planner", kind: "workspace", route: "/app/marketing" });
      const lines = planned.slice(0, 6).map((e) => {
        const when = e.scheduledAt
          ? relativeDayPhrase(e.scheduledAt).replace(/\.$/, "")
          : "unscheduled";
        return `- **${e.title}** — ${marketingPlatformLabel(e.platform)} · ${e.contentType} · ${when}${e.campaignName ? ` (${e.campaignName})` : ""}`;
      });
      const campaigns = planner?.campaigns.length
        ? `\n\n${planner.campaigns.length} campaign${planner.campaigns.length === 1 ? "" : "s"} running · ${planner.ideas} idea${planner.ideas === 1 ? "" : "s"} waiting to be drafted.`
        : "";
      return {
        answer: `Here's what's in your planner:\n\n${lines.join("\n")}${campaigns}`,
        references: dedupe(refs),
      };
    }

    const contentTasks = open.filter((t) => (t.tags ?? []).includes("content") || /content|post|video|newsletter/i.test(t.title));
    if (!contentTasks.length) {
      return {
        answer: "You have nothing scheduled yet. Want me to create a content plan for next week?",
        references: [],
      };
    }
    return {
      answer: `Your open content work:\n\n${contentTasks.map(taskLine).join("\n")}`,
      references: [],
    };
  }

  // ---- generic overview --------------------------------------------------
  const done = ctx.tasks.length - open.length;
  return {
    answer:
      `**${ctx.workspaceName}** at a glance:\n\n` +
      `- ${open.length} open task${open.length === 1 ? "" : "s"} (${done} done)\n` +
      `- ${ctx.projects.length} project${ctx.projects.length === 1 ? "" : "s"}\n` +
      `- ${ctx.goals.length} goal${ctx.goals.length === 1 ? "" : "s"}\n` +
      (overdue.length ? `- ⚠️ ${overdue.length} overdue\n` : "") +
      (ctx.pendingInbox ? `- 📥 ${ctx.pendingInbox} items waiting in your Inbox\n` : "") +
      `\nAsk me things like *"What should I do today?"*, *"Summarise my projects"* or *"Show my overdue tasks"* — or tell me to **create a project** / **add a task** and I'll prepare it for your confirmation.`,
    references: [],
  };
}

function dedupe(refs: AssistantReference[]): AssistantReference[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.kind}:${r.route}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
