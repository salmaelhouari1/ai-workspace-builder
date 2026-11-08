"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { vly } from "../lib/vly-integrations";
import {
  buildAIReport,
  buildDeterministicReport,
  buildRecommendationSeeds,
  formatMetric,
  reportTitle,
  type AIReportAnalysis,
  type EvidenceStatement,
} from "../lib/analytics";
import { sha256Hex } from "./lib/crypto";

const MODEL = "gpt-4o-mini";

const reportType = v.union(
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("content"),
  v.literal("audience"),
  v.literal("improvement"),
);
const periodKey = v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"));

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

function statements(value: unknown): EvidenceStatement[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((item) => {
    const row = item as { text?: unknown; evidence?: unknown };
    if (typeof row.text !== "string" || typeof row.evidence !== "string") {
      return [];
    }
    const text = row.text.trim();
    const evidence = row.evidence.trim();
    if (!text || !evidence) return [];
    return [{ text: text.slice(0, 500), evidence: evidence.slice(0, 320) }];
  });
}

function parseAnalysis(raw: string): AIReportAnalysis | null {
  const parsed = parseJson<Record<string, unknown>>(raw);
  if (!parsed) return null;
  const analysis: AIReportAnalysis = {
    observations: statements(parsed.observations),
    interpretation: statements(parsed.interpretation),
    opportunities: statements(parsed.opportunities),
    recommendations: statements(parsed.recommendations),
    limitations: statements(parsed.limitations),
  };
  if (!analysis.observations.length || !analysis.limitations.length) {
    return null;
  }
  return analysis;
}

const PROMPT = `You are the marketing analyst inside OCIVO. You receive a deterministic analytics snapshot for one Instagram professional account and the business context the user supplied.

Non-negotiable rules:
- Use ONLY the snapshot. Do not invent metrics, posts, dates, audiences, sales, conversions or causes.
- Do not calculate new numbers and do not sum daily reach. If a value is null or "Unavailable", say it is unavailable.
- Observations are facts directly supported by the snapshot.
- Interpretation is a cautious hypothesis, clearly distinct from fact.
- Correlation is not causation. Never claim a post caused follower growth, sales or revenue.
- Every statement must carry a short evidence string naming the actual metric/content and value from the snapshot.
- Recommendations must be practical and small enough to execute. Potential benefit belongs in the recommendation text as a hypothesis, not a promise.
- Mention missing data in limitations.
- Return strict JSON only:
{
  "observations": [{"text":"...","evidence":"..."}],
  "interpretation": [{"text":"...","evidence":"..."}],
  "opportunities": [{"text":"...","evidence":"..."}],
  "recommendations": [{"text":"...","evidence":"..."}],
  "limitations": [{"text":"...","evidence":"..."}]
}
At most 5 statements per section. No prose outside JSON.`;

export const generate = action({
  args: {
    period: periodKey,
    reportType,
  },
  handler: async (ctx, args): Promise<{
    reportId: string;
    source: "ai" | "deterministic";
    cached: boolean;
  }> => {
    const access = await ctx.runQuery(api.integrations.access, {});
    if (!access) throw new Error("Not authenticated");

    const data = await ctx.runQuery(api.analytics.dashboard, {
      period: args.period,
    });
    if (!data?.snapshot || !data.connection) {
      throw new Error("Connect Instagram and sync data before generating a report");
    }
    const snapshot = data.snapshot;
    const connectionId = data.connection.id;
    // `generatedAt` is request-time metadata. Excluding it keeps the hash
    // stable so the same data set can reuse a cached report.
    const snapshotForReport = { ...snapshot, generatedAt: undefined };
    const snapshotJson = JSON.stringify(snapshotForReport);
    const snapshotHash = await sha256Hex(snapshotJson);

    const cached = await ctx.runQuery(internal.reportStore.findCached, {
      workspaceId: access.workspaceId,
      reportType: args.reportType,
      snapshotHash,
    });
    if (cached) {
      return {
        reportId: cached.reportId,
        source: cached.source,
        cached: true,
      };
    }

    const compactSnapshot = {
      ...snapshotForReport,
      daily: snapshot.daily.slice(-45),
    };
    let content = "";
    let source: "ai" | "deterministic" = "deterministic";
    let analysis: AIReportAnalysis | null = null;

    try {
      const response = await vly.ai.completion(
        {
          model: MODEL,
          temperature: 0.2,
          maxTokens: 2200,
          messages: [
            { role: "system", content: PROMPT },
            {
              role: "user",
              content: `REPORT TYPE: ${reportTitle(args.reportType)}\n\nSNAPSHOT:\n${JSON.stringify(compactSnapshot, null, 2)}`,
            },
          ],
        },
        { timeout: 25000, retries: 1 },
      );
      const raw = response.data?.choices?.[0]?.message?.content;
      if (!response.success || !raw) {
        throw new Error(response.error || "empty completion");
      }
      analysis = parseAnalysis(raw);
      if (!analysis) throw new Error("AI report did not match the required structure");
      content = buildAIReport(snapshot, args.reportType, analysis);
      source = "ai";
    } catch (err) {
      console.warn(
        "[ocivo] AI report unavailable, deterministic report used:",
        err instanceof Error ? err.message : err,
      );
      content = buildDeterministicReport(snapshot, args.reportType);
      source = "deterministic";
    }

    let insightRows: Array<{
      kind: "observation" | "interpretation" | "opportunity" | "recommendation" | "limitation";
      text: string;
      evidence: string;
    }> = [];
    if (analysis) {
      insightRows = [
        ...analysis.observations.map((item) => ({
          kind: "observation" as const,
          ...item,
        })),
        ...analysis.opportunities.map((item) => ({
          kind: "opportunity" as const,
          ...item,
        })),
        ...analysis.recommendations.map((item) => ({
          kind: "recommendation" as const,
          ...item,
        })),
        ...analysis.limitations.map((item) => ({
          kind: "limitation" as const,
          ...item,
        })),
      ].slice(0, 8);
    } else {
      // The deterministic fallback still leaves traceable insight cards. The
      // wording is limited to the calculated snapshot, with no model claims.
      const seeds = buildRecommendationSeeds({
        period: snapshot.period,
        media: snapshot.media,
        businessGoal: snapshot.workspace.mainGoal,
      });
      insightRows = [
        {
          kind: "observation" as const,
          text: `Reach was ${formatMetric(snapshot.period.metrics.reach)} and interactions were ${formatMetric(snapshot.period.metrics.interactions)} in this period.`,
          evidence: `${snapshot.period.label}; reach ${formatMetric(snapshot.period.metrics.reach)}, interactions ${formatMetric(snapshot.period.metrics.interactions)}.`,
        },
        {
          kind: "observation" as const,
          text: `${snapshot.media.total} published media item${snapshot.media.total === 1 ? " was" : "s were"} measured; ${snapshot.media.unlinked} remain unlinked to the planner.`,
          evidence: `Measured media ${snapshot.media.total}; unlinked ${snapshot.media.unlinked}.`,
        },
        ...seeds.slice(0, 3).map((seed) => ({
          kind: "opportunity" as const,
          text: seed.explanation,
          evidence: seed.evidence
            .map((item) => `${item.label} ${item.value}`)
            .join("; "),
        })),
        {
          kind: "limitation" as const,
          text: "Instagram insights are estimated and can be delayed by up to 48 hours. Engagement is not proof of sales or causation.",
          evidence: "Meta Instagram insights limitations; no conversion data is connected.",
        },
      ].slice(0, 8);
    }

    const reportId = await ctx.runMutation(internal.reportStore.save, {
      workspaceId: access.workspaceId,
      connectionId,
      reportType: args.reportType,
      periodKey: args.period,
      periodStart: snapshot.period.start,
      periodEnd: snapshot.period.end,
      title: reportTitle(args.reportType),
      dataFreshnessAt:
        snapshot.connection.dataFreshnessAt ?? snapshot.period.end,
      snapshot: snapshotJson,
      snapshotHash,
      content,
      source,
      generatedBy: access.userId,
      insights: insightRows,
    });

    return { reportId: reportId as string, source, cached: false };
  },
});
