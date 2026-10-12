/**
 * Offline inbox parser — splits a raw dump into reviewable entries when the
 * AI gateway isn't available. Mirrors the shape the LLM path produces.
 */

import { parseWhen, DAY_MS, utcDayStart } from "./nlp";

export interface InboxEntry {
  kind: "task" | "note" | "link" | "idea";
  title: string;
  detail?: string;
  dueDate?: number;
  url?: string;
  include?: boolean;
}

const URL_RE = /\bhttps?:\/\/\S+|www\.\S+/i;

const TASK_START =
  /^(?:i\s+(?:need|have|want|should|must)\s+|need to|must|remember to|remind me(?: to)?|todo:?|to-?do:?|follow up|send|call|email|contact|finish|schedule|book|publish|draft|reply|pay|order|check|prepare|create|update|review|confirm|ask|sign|ship|design|write|set up|move|cancel)\b/i;

const IDEA_START = /^(?:idea|what if|maybe we could|someday|brainstorm)\b/i;

const TASK_CONJUNCTION =
  /,(?:\s+(?:and|also))?\s+|\s+(?:and|also)\s+(?=(?:i\s+)?(?:need|must|remember|remind|send|call|email|contact|finish|schedule|book|publish|draft|reply|pay|order|check|prepare|create|update|review|confirm|ask|follow)\b)/i;

function capitalize(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function chunkText(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const line of lines) {
    if (URL_RE.test(line) && line.split(/\s+/).length <= 6) {
      chunks.push(line);
      continue;
    }
    // Split on commas / "and" when the next fragment starts with an action verb.
    const parts = line
      .split(TASK_CONJUNCTION)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      chunks.push(...parts);
    } else {
      const sentences = line
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      chunks.push(...sentences);
    }
  }
  return chunks;
}

export function parseInboxLocal(text: string): InboxEntry[] {
  const chunks = chunkText(text);
  const entries: InboxEntry[] = [];

  for (const chunk of chunks) {
    const urlMatch = chunk.match(URL_RE);
    if (urlMatch) {
      const raw = urlMatch[0];
      const url = raw.startsWith("http") ? raw : `https://${raw}`;
      let host = raw;
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* keep raw */
      }
      const rest = chunk.replace(URL_RE, "").replace(/^[:\-–\s]+/, "").trim();
      entries.push({
        kind: "link",
        title: rest ? capitalize(rest) : `Link — ${host}`,
        detail: rest || undefined,
        url,
        include: true,
      });
      continue;
    }

    const when = parseWhen(chunk);
    const isIdea = IDEA_START.test(chunk);
    const isTask = TASK_START.test(chunk) || when.dueDate !== undefined;

    if (isIdea && !isTask) {
      entries.push({
        kind: "idea",
        title: capitalize(chunk.replace(/^idea[:\s-]*\s*/i, "")),
        detail: chunk,
        include: true,
      });
      continue;
    }

    if (isTask) {
      const title = capitalize(
        chunk
          .replace(/^(?:remember that|remember to|remind me to|i need to|i have to)\s*/i, "")
          .replace(/\s{2,}/g, " ")
          .replace(/[.,;]+$/, ""),
      );
      entries.push({
        kind: "task",
        title: title.slice(0, 160),
        detail: chunk,
        dueDate: when.dueDate,
        include: true,
      });
      continue;
    }

    entries.push({
      kind: "note",
      title: capitalize(chunk).slice(0, 160),
      detail: chunk,
      include: true,
    });
  }

  // De-duplicate near-identical entries.
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = e.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Used by the assistant fallback to describe pending inbox load. */
export function pendingLabel(count: number): string {
  if (count === 0) return "Your inbox is empty";
  return `You have ${count} unprocessed item${count > 1 ? "s" : ""} in your inbox`;
}

export const dayStart = (d: Date) => utcDayStart(d.getTime());
export const inDays = (n: number) => utcDayStart(Date.now()) + n * DAY_MS;
