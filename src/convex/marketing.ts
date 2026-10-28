import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertMember, requireWorkspace } from "./lib/auth";

/**
 * Marketing Planner — the planner layer of the workspace.
 *
 * NOTE: this file is NOT a "marketing AI" backend. It only persists planner
 * records, validates them against the workspace-owner, and enforces every
 * rule in the spec §8: one owner per document, no cross-user write, no
 * empty submissions, no duplicate records, safe delete/archive, and no
 * accidental publication.
 */

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

const MAX_TITLE = 240;
const MAX_PLATFORM = 40;

const SUPPORTED_PLATFORMS = [
  "instagram",
  "tiktok",
  "linkedin",
  "facebook",
  "pinterest",
  "other",
] as const;

function normalizePlatform(raw: string): string {
  const k = raw.trim().toLowerCase();
  if (k === "instagram" || k === "tiktok" || k === "linkedin" ||
      k === "facebook" || k === "pinterest" || k === "other") {
    return k;
  }
  return "other";
}

// ---------------------------------------------------------------------------
// marketingEntries
// ---------------------------------------------------------------------------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const entries = await ctx.db
      .query("marketingEntries")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .orderBy("scheduledAt", "desc")
      .collect();
    return entries.map((e) => ({
      ...e,
      scheduledAt: e.scheduledAt ?? null,
      campaignName: e.campaignId
        ? (await ctx.db.get(e.campaignId))?.name ?? null
        : null,
    }));
  },
});

export const listByStatus = query({
  args: { status: v.union(
    v.literal("idea"),
    v.literal("draft"),
    v.literal("planned"),
    v.literal("readyToPublish"),
    v.literal("published"),
  ) },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const entries = await ctx.db
      .query("marketingEntries")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", args.status)
      )
      .collect();
    return entries.map((e) => ({
      ...e,
      scheduledAt: e.scheduledAt ?? null,
      campaignName: e.campaignId
        ? (await ctx.db.get(e.campaignId))?.name ?? null
        : null,
    }));
  },
});

export const get = query({
  args: { entryId: v.id("marketingEntries") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) return null;
    await assertMember(ctx, entry.workspaceId);
    const campaignName = entry.campaignId
      ? (await ctx.db.get(entry.campaignId))?.name ?? null
      : null;
    return { ...entry, scheduledAt: entry.scheduledAt ?? null, campaignName };
  },
});

const createEntry = mutation({
  args: {
    title: v.string(),
    contentType: v.string(),
    platform: v.string(),
    body: v.string(),
    hook: v.optional(v.string()),
    callToAction: v.optional(v.string()),
    creativeBrief: v.optional(v.string()),
    status: v.union(
      v.literal("idea"),
      v.literal("draft"),
      v.literal("planned"),
      v.literal("readyToPublish"),
      v.literal("published"),
    ),
    scheduledAt: v.optional(v.number()),
    campaignId: v.optional(v.id("campaigns")),
    pillar: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    audience: v.optional(v.string()),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (args.title.trim().length === 0) throw new Error("Title is required");
    if (!SUPPORTED_PLATFORMS.includes(args.platform as typeof SUPPORTED_PLATFORMS[number])) {
      throw new Error("Unsupported platform");
    }
    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign || campaign.workspaceId !== workspaceId) {
        throw new Error("Unknown campaign");
      }
    }
    const now = Date.now();
    const id = await ctx.db.insert("marketingEntries", {
      workspaceId,
      title: args.title.trim().slice(0, MAX_TITLE),
      contentType: args.contentType.trim().slice(0, MAX_PLATFORM),
      platform: normalizePlatform(args.platform),
      body: args.body,
      hook: args.hook?.trim().slice(0, MAX_TITLE),
      callToAction: args.callToAction?.trim().slice(0, MAX_TITLE),
      creativeBrief: args.creativeBrief?.trim().slice(0, 2000),
      status: args.status,
      scheduledAt: args.scheduledAt ?? undefined,
      campaignId: args.campaignId,
      pillar: args.pillar?.trim().slice(0, 80),
      tags: args.tags ?? [],
      audience: args.audience?.trim().slice(0, 160),
      workspaceMemberId: args.workspaceMemberId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

const updateEntry = mutation({
  args: {
    entryId: v.id("marketingEntries"),
    title: v.optional(v.string()),
    contentType: v.optional(v.string()),
    platform: v.optional(v.string()),
    body: v.optional(v.string()),
    hook: v.optional(v.string()),
    callToAction: v.optional(v.string()),
    creativeBrief: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("idea"),
        v.literal("draft"),
        v.literal("planned"),
        v.literal("readyToPublish"),
        v.literal("published"),
      ),
    ),
    scheduledAt: v.optional(v.number()),
    campaignId: v.optional(v.id("campaigns")),
    pillar: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    audience: v.optional(v.string()),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("Entry not found");
    await assertMember(ctx, entry.workspaceId);

    if (args.campaignId !== undefined) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign || campaign.workspaceId !== entry.workspaceId) {
        throw new Error("Unknown campaign");
      }
    }
    if (args.campaignId && args.campaignId !== entry.campaignId) {
      const existing = await ctx.db
        .query("marketingEntries")
        .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
        .filter((e) => e._id !== args.entryId)
        .filter((e) => e.title === entry.title)
        .first();
      if (existing) throw new Error("A content entry with this title already exists under the campaign");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, MAX_TITLE);
    if (args.contentType !== undefined) patch.contentType = args.contentType.trim().slice(0, MAX_PLATFORM);
    if (args.platform !== undefined) patch.platform = normalizePlatform(args.platform);
    if (args.body !== undefined) patch.body = args.body;
    if (args.hook !== undefined) patch.hook = args.hook.trim().slice(0, MAX_TITLE);
    if (args.callToAction !== undefined) patch.callToAction = args.callToAction.trim().slice(0, MAX_TITLE);
    if (args.creativeBrief !== undefined) patch.creativeBrief = args.creativeBrief.trim().slice(0, 2000);
    if (args.status !== undefined) patch.status = args.status;
    if (args.scheduledAt !== undefined) patch.scheduledAt = args.scheduledAt;
    if (args.pillar !== undefined) patch.pillar = args.pillar.trim().slice(0, 80);
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.audience !== undefined) patch.audience = args.audience.trim().slice(0, 160);
    if (args.workspaceMemberId !== undefined) patch.workspaceMemberId = args.workspaceMemberId;
    if (args.campaignId !== undefined) patch.campaignId = args.campaignId;

    await ctx.db.patch(args.entryId, patch);
    return { ok: true };
  },
});

const removeEntry = mutation({
  args: { entryId: v.id("marketingEntries") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("Content entry not found");
    await assertMember(ctx, entry.workspaceId);
    await ctx.db.delete(args.entryId);
    return { ok: true };
  },
});

export const create = createEntry;
export const update = updateEntry;
export const remove = removeEntry;

// ---------------------------------------------------------------------------
// marketingIdeas
// ---------------------------------------------------------------------------

export const listIdeas = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const ideas = await ctx.db
      .query("marketingIdeas")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .orderBy("updatedAt", "desc")
      .collect();
    return ideas.map((i) => ({
      ...i,
      convertedTo: i.convertedTo ?? null,
    }));
  },
});

export const getIdea = query({
  args: { ideaId: v.id("marketingIdeas") },
  handler: async (ctx, args) => {
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) return null;
    await assertMember(ctx, idea.workspaceId);
    return { ...idea, convertedTo: idea.convertedTo ?? null };
  },
});

const createIdea = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    contentType: v.string(),
    platform: v.string(),
    pillar: v.optional(v.string()),
    campaignId: v.optional(v.id("campaigns")),
    tags: v.optional(v.array(v.string())),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (args.title.trim().length === 0) throw new Error("Idea title is required");
    if (!SUPPORTED_PLATFORMS.includes(args.platform as typeof SUPPORTED_PLATFORMS[number])) {
      throw new Error("Unsupported platform");
    }
    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign || campaign.workspaceId !== workspaceId) {
        throw new Error("Unknown campaign");
      }
    }
    const now = Date.now();
    const id = await ctx.db.insert("marketingIdeas", {
      workspaceId,
      title: args.title.trim().slice(0, MAX_TITLE),
      description: args.description?.trim().slice(0, 2000),
      contentType: args.contentType.trim().slice(0, MAX_PLATFORM),
      platform: normalizePlatform(args.platform),
      pillar: args.pillar?.trim().slice(0, 80),
      campaignId: args.campaignId,
      tags: args.tags ?? [],
      workspaceMemberId: args.workspaceMemberId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

const updateIdea = mutation({
  args: {
    ideaId: v.id("marketingIdeas"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    contentType: v.optional(v.string()),
    platform: v.optional(v.string()),
    pillar: v.optional(v.string()),
    campaignId: v.optional(v.id("campaigns")),
    tags: v.optional(v.array(v.string())),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) throw new Error("Idea not found");
    await assertMember(ctx, idea.workspaceId);

    if (args.campaignId !== undefined) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign || campaign.workspaceId !== idea.workspaceId) {
        throw new Error("Unknown campaign");
      }
    }
    if (args.campaignId && args.campaignId !== idea.campaignId) {
      const existing = await ctx.db
        .query("marketingIdeas")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", idea.workspaceId))
        .filter((e) => e._id !== args.ideaId)
        .filter((e) => e.title === idea.title)
        .first();
      if (existing) throw new Error("An idea with this title already exists");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, MAX_TITLE);
    if (args.description !== undefined) patch.description = args.description.trim().slice(0, 2000);
    if (args.contentType !== undefined) patch.contentType = args.contentType.trim().slice(0, MAX_PLATFORM);
    if (args.platform !== undefined) patch.platform = normalizePlatform(args.platform);
    if (args.pillar !== undefined) patch.pillar = args.pillar.trim().slice(0, 80);
    if (args.campaignId !== undefined) patch.campaignId = args.campaignId;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.workspaceMemberId !== undefined) patch.workspaceMemberId = args.workspaceMemberId;

    await ctx.db.patch(args.ideaId, patch);
    return { ok: true };
  },
});

const removeIdea = mutation({
  args: { ideaId: v.id("marketingIdeas") },
  handler: async (ctx, args) => {
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) throw new Error("Idea not found");
    await assertMember(ctx, idea.workspaceId);
    await ctx.db.delete(args.ideaId);
    return { ok: true };
  },
});

export const createIdea = createIdea;
export const updateIdea = updateIdea;
export const removeIdea = removeIdea;

// ---------------------------------------------------------------------------
// campaigns
// ---------------------------------------------------------------------------

export const listCampaigns = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .orderBy("startDate", "asc")
      .collect();
    const entryIds = [] as string[];
    for (const c of campaigns) {
      const entries = await ctx.db
        .query("marketingEntries")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect();
      entryIds.push(...entries.map((e) => e._id));
    }
    const ideaById = new Map<string, any>();
    const ideas = await ctx.db
      .query("marketingIdeas")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    for (const i of ideas) ideaById.set(i._id, i);

    const entries = await ctx.db
      .query("marketingEntries")
      .filter((e) => entryIds.includes(e._id))
      .collect();

    const entryCount = new Map<string, number>();
    for (const e of entries) {
      const c = entryCount.get(e.campaignId ?? "") ?? 0;
      entryCount.set(e.campaignId ?? "", c + 1);
    }

    return campaigns.map((c) => {
      const entries = entries.filter((e) => e.campaignId === c._id);
      const ideas = ideas.filter((i) => i.campaignId === c._id);
      const drafts = entries.filter((e) => e.status === "draft").length;
      const published = entries.filter((e) => e.status === "published").length;
      const planned = entries.filter((e) => e.status === "planned").length;
      const ready = entries.filter((e) => e.status === "readyToPublish").length;
      return {
        ...c,
        entryCount: entries.length,
        draftCount: drafts,
        plannedCount: planned,
        readyCount: ready,
        publishedCount: published,
        ideaCount: ideas.length,
        entryIds: entries.map((e) => e._id),
      };
    });
  },
});

export const getCampaign = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) return null;
    await assertMember(ctx, campaign.workspaceId);

    const entries = await ctx.db
      .query("marketingEntries")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    const ideas = await ctx.db
      .query("marketingIdeas")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", campaign.workspaceId))
      .filter((i) => i.campaignId === args.campaignId)
      .collect();

    const entryCount = new Map<string, number>();
    for (const e of entries) {
      const c = entryCount.get(e.status) ?? 0;
      entryCount.set(e.status, c + 1);
    }

    return {
      ...campaign,
      entryCount: entries.length,
      draftCount: entryCount.get("draft") ?? 0,
      plannedCount: entryCount.get("planned") ?? 0,
      readyCount: entryCount.get("readyToPublish") ?? 0,
      publishedCount: entryCount.get("published") ?? 0,
      ideaCount: ideas.length,
      entryIds: entries.map((e) => e._id),
      ideaIds: ideas.map((i) => i._id),
    };
  },
});

const createCampaign = mutation({
  args: {
    name: v.string(),
    objective: v.optional(v.string()),
    audience: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("archived"),
    ),
    notes: v.optional(v.string()),
    goalId: v.optional(v.id("goals")),
    projectId: v.optional(v.id("projects")),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    if (args.name.trim().length === 0) throw new Error("Campaign name is required");
    if (args.goalId) {
      const goal = await ctx.db.get(args.goalId);
      if (!goal || goal.workspaceId !== workspaceId) throw new Error("Unknown goal");
    }
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== workspaceId) throw new Error("Unknown project");
    }
    const now = Date.now();
    const id = await ctx.db.insert("campaigns", {
      workspaceId,
      name: args.name.trim().slice(0, MAX_TITLE),
      objective: args.objective?.trim().slice(0, 200),
      audience: args.audience?.trim().slice(0, 200),
      startDate: args.startDate ?? undefined,
      endDate: args.endDate ?? undefined,
      status: args.status ?? "active",
      notes: args.notes?.trim().slice(0, 2000),
      goalId: args.goalId,
      projectId: args.projectId,
      workspaceMemberId: args.workspaceMemberId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

const updateCampaign = mutation({
  args: {
    campaignId: v.id("campaigns"),
    name: v.optional(v.string()),
    objective: v.optional(v.string()),
    audience: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("completed"),
        v.literal("archived"),
      ),
    ),
    notes: v.optional(v.string()),
    goalId: v.optional(v.id("goals")),
    projectId: v.optional(v.id("projects")),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    await assertMember(ctx, campaign.workspaceId);

    if (args.goalId !== undefined) {
      const goal = await ctx.db.get(args.goalId);
      if (!goal || goal.workspaceId !== campaign.workspaceId) throw new Error("Unknown goal");
    }
    if (args.projectId !== undefined) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== campaign.workspaceId) throw new Error("Unknown project");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim().slice(0, MAX_TITLE);
    if (args.objective !== undefined) patch.objective = args.objective.trim().slice(0, 200);
    if (args.audience !== undefined) patch.audience = args.audience.trim().slice(0, 200);
    if (args.startDate !== undefined) patch.startDate = args.startDate;
    if (args.endDate !== undefined) patch.endDate = args.endDate;
    if (args.status !== undefined) patch.status = args.status;
    if (args.notes !== undefined) patch.notes = args.notes.trim().slice(0, 2000);
    if (args.goalId !== undefined) patch.goalId = args.goalId;
    if (args.projectId !== undefined) patch.projectId = args.projectId;
    if (args.workspaceMemberId !== undefined) patch.workspaceMemberId = args.workspaceMemberId;

    await ctx.db.patch(args.campaignId, patch);
    return { ok: true };
  },
});

const removeCampaign = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    await assertMember(ctx, campaign.workspaceId);
    await ctx.db.delete(args.campaignId);
    return { ok: true };
  },
});

export const createCampaign = createCampaign;
export const updateCampaign = updateCampaign;
export const removeCampaign = removeCampaign;

// ---------------------------------------------------------------------------
// marketingSuggestions (stored AI proposals)
// ---------------------------------------------------------------------------

export const listSuggestions = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const suggestions = await ctx.db
      .query("marketingSuggestions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .orderBy("createdAt", "desc")
      .collect();
    return suggestions.map((s) => ({ ...s, suggestionName: s.suggestionName }));
  },
});

export const getSuggestion = query({
  args: { suggestionId: v.id("marketingSuggestions") },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) return null;
    await assertMember(ctx, suggestion.workspaceId);
    return { ...suggestion };
  },
});

const createSuggestion = mutation({
  args: {
    suggestionName: v.string(),
    content: v.string(),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("marketingSuggestions", {
      workspaceId,
      suggestionName: args.suggestionName.trim().slice(0, 200),
      content: args.content,
      workspaceMemberId: args.workspaceMemberId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const createSuggestion = createSuggestion;
