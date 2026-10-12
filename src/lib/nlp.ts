/**
 * Local natural-language helpers shared by the client (command bar, quick-add)
 * and the Convex backend (workspace generation, AI fallback answers).
 *
 * Everything here is deterministic — no network, no keys — so core flows keep
 * working even when the AI gateway is unavailable.
 */

export type BusinessType =
  | "freelance"
  | "ecommerce"
  | "saas"
  | "creator"
  | "agency"
  | "general";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "am", "be", "my", "our", "your", "i", "we", "it", "at",
  "this", "that", "what", "which", "how", "do", "does", "did", "me", "you",
]);

export const DAY_MS = 86_400_000;

/** Start of the calendar day (UTC) for a timestamp. */
export function utcDayStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Start of the calendar day (UTC) for a JS Date, using its local fields. */
export function localDayStart(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole-day difference between two day-start timestamps (b - a). */
export function dayDiff(a: number, b: number): number {
  return Math.round((utcDayStart(b) - utcDayStart(a)) / DAY_MS);
}

export function addDays(ts: number, n: number): number {
  return ts + n * DAY_MS;
}

/** "Overdue" | "Today" | "Tomorrow" | "In 3 days" | "Fri" | "Oct 20" */
export function relativeDayLabel(dayStart: number, now = Date.now()): string {
  const diff = dayDiff(now, dayStart);
  if (diff < -1) return `${Math.abs(diff)} days late`;
  if (diff === -1) return "Yesterday";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 6) {
    return new Date(dayStart).toLocaleDateString(undefined, { weekday: "short" });
  }
  return new Date(dayStart).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Longer prose form for AI "why now" reasons. */
export function relativeDayPhrase(dayStart: number, now = Date.now()): string {
  const diff = dayDiff(now, dayStart);
  if (diff < 0) return `Overdue by ${Math.abs(diff) === 1 ? "a day" : `${Math.abs(diff)} days`}.`;
  if (diff === 0) return "Due today.";
  if (diff === 1) return "Due tomorrow.";
  if (diff <= 6) {
    const day = new Date(dayStart).toLocaleDateString(undefined, { weekday: "long" });
    return `Due ${day}.`;
  }
  const formatted = new Date(dayStart).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
  return `Due ${formatted}.`;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3,
  april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

export interface ParsedWhen {
  /** UTC-midnight timestamp of the calendar day. */
  dueDate?: number;
  /** Wall-clock label like "10:30". */
  dueTime?: string;
  /** The text that was recognised as a date/time, for stripping. */
  matched: string[];
}

function normalizeDate(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Extract "when" from free text: today / tomorrow / next Friday / in 3 days /
 * October 20 / at 10:30 … Everything recognised is returned so the caller can
 * strip it out of the resulting task title.
 */
export function parseWhen(text: string, now = new Date()): ParsedWhen {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  const today = normalizeDate(now);
  let dueDate: number | undefined;
  let dueTime: string | undefined;

  const takeDay = (ts: number, raw: string) => {
    if (dueDate === undefined) {
      dueDate = ts;
      matched.push(raw);
    }
  };

  // ---- time of day -------------------------------------------------------
  const timeMatch = lower.match(
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\bat\s+(\d{1,2})(?::(\d{2}))?\b/,
  );
  if (timeMatch) {
    const raw = timeMatch[0];
    const hour = parseInt(timeMatch[1] ?? timeMatch[4], 10);
    const minute = timeMatch[2] ?? timeMatch[5];
    const meridiem = timeMatch[3];
    if (!Number.isNaN(hour) && hour <= 24) {
      let h = hour;
      if (meridiem === "pm" && h < 12) h += 12;
      if (meridiem === "am" && h === 12) h = 0;
      if (meridiem === undefined && h <= 7) h += 0; // "at 10" stays 10:00
      dueTime = `${String(h).padStart(2, "0")}:${minute ?? "00"}`;
      matched.push(raw);
    }
  }

  // ---- relative days -----------------------------------------------------
  const relDay = lower.match(/\b(today|tonight|tomorrow|tmr|tomorow)\b/);
  if (relDay) {
    const offset = relDay[1] === "today" || relDay[1] === "tonight" ? 0 : 1;
    takeDay(today + offset * DAY_MS, relDay[0]);
  }

  if (dueDate === undefined) {
    const inMatch = lower.match(/\bin\s+(\d{1,3})\s+(day|days|week|weeks)\b/);
    if (inMatch) {
      const n = parseInt(inMatch[1], 10);
      const mult = inMatch[2].startsWith("week") ? 7 : 1;
      takeDay(today + n * mult * DAY_MS, inMatch[0]);
    }
  }

  if (dueDate === undefined) {
    const nextWeek = lower.match(/\bnext\s+week\b|\bend\s+of\s+(?:the\s+)?week\b/);
    if (nextWeek) {
      if (nextWeek[0].includes("end")) {
        const todayDow = now.getDay();
        const toFriday = (5 - todayDow + 7) % 7 || 7;
        takeDay(today + toFriday * DAY_MS, nextWeek[0]);
      } else {
        takeDay(today + 7 * DAY_MS, nextWeek[0]);
      }
    }
  }

  // ---- weekday -----------------------------------------------------------
  if (dueDate === undefined) {
    const wd = lower.match(/\b(next\s+)?(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun)\b/);
    if (wd) {
      const target = WEEKDAYS[wd[2]];
      const current = now.getDay();
      let diff = (target - current + 7) % 7;
      if (wd[1]) diff = diff === 0 ? 7 : diff;
      takeDay(today + diff * DAY_MS, wd[0]);
    }
  }

  // ---- explicit date: "October 20" / "20 October" ------------------------
  if (dueDate === undefined) {
    const named = lower.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})\b/,
    );
    if (named) {
      const month = MONTHS[named[1]];
      const day = parseInt(named[2], 10);
      let year = now.getFullYear();
      const candidate = new Date(year, month, day);
      if (normalizeDate(candidate) < today) year += 1;
      takeDay(Date.UTC(year, month, day), named[0]);
    } else {
      const numeric = lower.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
      if (numeric) {
        const month = parseInt(numeric[2], 10) - 1;
        const day = parseInt(numeric[1], 10);
        if (month >= 0 && month <= 11 && day <= 31) {
          let year = numeric[3]
            ? numeric[3].length === 2
              ? 2000 + parseInt(numeric[3], 10)
              : parseInt(numeric[3], 10)
            : now.getFullYear();
          const candidate = new Date(year, month, day);
          if (normalizeDate(candidate) < today) year += 1;
          takeDay(Date.UTC(year, month, day), numeric[0]);
        }
      }
    }
  }

  // ---- next month --------------------------------------------------------
  if (dueDate === undefined) {
    const nextMonth = lower.match(/\bnext\s+month\b/);
    if (nextMonth) {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      takeDay(normalizeDate(d), nextMonth[0]);
    }
  }

  return { dueDate, dueTime, matched };
}

const LEAD_WORDS =
  /^(remind me to|i need to|i have to|i should|don'?t forget to|remember to|need to|todo:?|to-do:?|please)\s+/i;

export interface ParsedTask {
  title: string;
  dueDate?: number;
  dueTime?: string;
  priority: "low" | "medium" | "high";
}

/** Turn "Remind me to send the proposal next Tuesday at 10" into a task. */
export function parseTask(text: string, now = new Date()): ParsedTask {
  const when = parseWhen(text, now);
  let title = text;

  for (const m of when.matched) {
    title = title.replace(new RegExp(escapeRegExp(m), "ig"), " ");
  }
  title = title.replace(LEAD_WORDS, "");
  title = title.replace(/\b(by|on|at|in|before|since)\s*$/i, "");
  title = title.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  title = title.replace(/^[:,\-–]\s*/, "").replace(/\s+$/, "");
  if (!title) title = text.trim();

  title = title.charAt(0).toUpperCase() + title.slice(1);

  const priority = /\b(urgent|asap|high priority|top priority|important)\b/i.test(text)
    ? "high"
    : /\b(whenever|low priority|someday|eventually)\b/i.test(text)
      ? "low"
      : "medium";

  return { title, dueDate: when.dueDate, dueTime: when.dueTime, priority };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Business-type detection
// ---------------------------------------------------------------------------

const BUSINESS_KEYWORDS: Record<BusinessType, string[]> = {
  ecommerce: [
    "e-commerce", "ecommerce", "online store", "shop", "store", "clothing",
    "boutique", "apparel", "sell", "selling", "products", "product line",
    "retail", "etsy", "shopify", "amazon fba", "merch", "jewelry", "fashion",
    "inventory", "dropshipping", "marketplace",
  ],
  freelance: [
    "freelance", "freelancer", "freelancing", "consultant", "consulting",
    "solo", "my own clients", "independent", "self-employed", "contractor",
    "i design", "i develop", "i write", "i photograph", "my practice",
  ],
  agency: [
    "agency", "agencies", "we manage", "retainer", "retainers", "seo",
    "social media management", "our clients", "team of", "studio",
    "marketing firm",
  ],
  creator: [
    "creator", "content creator", "youtube", "youtuber", "instagram", "tiktok",
    "newsletter", "podcast", "audience", "subscribers", "followers", "blog",
    "influencer", "community", "course", "coaching audience",
  ],
  saas: [
    "saas", "startup", "start-up", "app", "software", "platform", "api",
    "subscription app", "technical", "mvp", "beta users", "software product",
    "i'm building an app", "building an app",
  ],
  general: [],
};

/** Score every archetype against the description and pick the best match. */
export function detectBusinessType(text: string): {
  type: BusinessType;
  scores: Record<BusinessType, number>;
} {
  const lower = ` ${text.toLowerCase()} `;
  const scores = {
    freelance: 0, ecommerce: 0, saas: 0, creator: 0, agency: 0, general: 0.1,
  } as Record<BusinessType, number>;

  (Object.keys(BUSINESS_KEYWORDS) as BusinessType[]).forEach((type) => {
    for (const kw of BUSINESS_KEYWORDS[type]) {
      if (lower.includes(` ${kw}`) || lower.includes(`${kw} `)) {
        scores[type] += kw.includes(" ") ? 2.5 : 1.5;
      }
    }
  });

  let type: BusinessType = "general";
  let best = 0;
  (Object.keys(scores) as BusinessType[]).forEach((t) => {
    if (scores[t] > best) {
      best = scores[t];
      type = t;
    }
  });
  return { type: scores[type] >= 1.5 ? type : "general", scores };
}

/** Pull a plausible business name out of onboarding prose. */
export function guessBusinessName(prompt: string): string | null {
  const m = prompt.match(
    /(?:i(?:'|’)?m|i am|called|named|we(?:'|’)?re|our)\s+(?:starting\s+|running\s+|building\s+|a\s+|an\s+)?(?:small\s+|new\s+)?([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,3})/,
    // fall through to a generic scan below when the text is all lowercase
  );
  if (m && m[1] && m[1].length > 2) {
    const candidate = m[1].trim();
    if (!/^(starting|running|building|the|a|an|small|new|my|our)$/i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Text scoring (used for search + contextual AI retrieval)
// ---------------------------------------------------------------------------

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9À-ÿ']+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Keyword-overlap score with a phrase bonus. Deterministic stand-in for
 * embedding similarity: "website client" still matches "client website
 * redesign" even though the exact phrase differs.
 */
export function scoreText(query: string, ...texts: (string | undefined | null)[]): number {
  const haystack = texts.filter(Boolean).join(" \n ").toLowerCase();
  if (!haystack.trim()) return 0;
  const q = query.toLowerCase().trim();
  const tokens = tokenize(q);
  if (!tokens.length) return 0;

  let score = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) score += 1;
    // partial word matches (prefix) — helps "website" ~ "websites"
    else if (t.length > 4 && haystack.includes(t.slice(0, t.length - 1))) score += 0.5;
  }
  if (tokens.length > 1 && haystack.includes(q)) score += tokens.length * 0.75;
  return score / Math.max(tokens.length, 1);
}
