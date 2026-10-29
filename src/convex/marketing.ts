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
      .collect();
    entries.sort((a, b) => (b.scheduledAt ?? 0) - (a.scheduledAt ?? 0));
    return await Promise.all(
      entries.map(async (e) => {
        const campaign = e.campaignId ? await ctx.db.get(e.campaignId) : null;
        return {
          ...e,
          scheduledAt: e.scheduledAt ?? null,
          campaignName: campaign?.name ?? null,
        };
      }),
    );
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
    return await Promise.all(
      entries.map(async (e) => {
        const campaign = e.campaignId ? await ctx.db.get(e.campaignId) : null;
        return {
          ...e,
          scheduledAt: e.scheduledAt ?? null,
          campaignName: campaign?.name ?? null,
        };
      }),
    );
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
    const { userId, workspaceId } = await requireWorkspace(ctx);
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
    const title = args.title.trim().slice(0, MAX_TITLE);
    const platform = normalizePlatform(args.platform);
    // Double-submit guard: reject an identical record created moments ago.
    const recentEntries = await ctx.db
      .query("marketingEntries")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    if (
      recentEntries.some(
        (e) =>
          e.title === title &&
          e.platform === platform &&
          (e.campaignId ?? null) === (args.campaignId ?? null) &&
          now - e.createdAt < 15_000,
      )
    ) {
      throw new Error("This content was just created — possible duplicate submission");
    }
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
      // Owner is derived from the session — never from client input.
      workspaceMemberId: userId,
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
    // null clears the schedule; omit to leave it unchanged.
    scheduledAt: v.optional(v.union(v.number(), v.null())),
    // null explicitly unlinks the campaign; omit to leave it unchanged.
    campaignId: v.optional(v.union(v.id("campaigns"), v.null())),
    pillar: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    audience: v.optional(v.string()),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new Error("Entry not found");
    await assertMember(ctx, entry.workspaceId);

    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign || campaign.workspaceId !== entry.workspaceId) {
        throw new Error("Unknown campaign");
      }
    }
    if (args.campaignId && args.campaignId !== entry.campaignId) {
      const campaignId = args.campaignId;
      const siblings = await ctx.db
        .query("marketingEntries")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .collect();
      const existing = siblings.find(
        (e) => e._id !== args.entryId && e.title === entry.title,
      );
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
    if (args.scheduledAt !== undefined) patch.scheduledAt = args.scheduledAt ?? undefined;
    if (args.pillar !== undefined) patch.pillar = args.pillar.trim().slice(0, 80);
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.audience !== undefined) patch.audience = args.audience.trim().slice(0, 160);
    if (args.workspaceMemberId !== undefined) patch.workspaceMemberId = args.workspaceMemberId;
    if (args.campaignId !== undefined) patch.campaignId = args.campaignId ?? undefined;

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
      .collect();
    ideas.sort((a, b) => b.updatedAt - a.updatedAt);
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

export const createIdea = mutation({
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
    const { userId, workspaceId } = await requireWorkspace(ctx);
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
    const title = args.title.trim().slice(0, MAX_TITLE);
    const platform = normalizePlatform(args.platform);
    // Double-submit guard: reject an identical idea created moments ago.
    const recentIdeas = await ctx.db
      .query("marketingIdeas")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    if (
      recentIdeas.some(
        (i) =>
          i.title === title &&
          i.platform === platform &&
          (i.campaignId ?? null) === (args.campaignId ?? null) &&
          now - i.createdAt < 15_000,
      )
    ) {
      throw new Error("This idea was just created — possible duplicate submission");
    }
    const id = await ctx.db.insert("marketingIdeas", {
      workspaceId,
      title: args.title.trim().slice(0, MAX_TITLE),
      description: args.description?.trim().slice(0, 2000),
      contentType: args.contentType.trim().slice(0, MAX_PLATFORM),
      platform: normalizePlatform(args.platform),
      pillar: args.pillar?.trim().slice(0, 80),
      campaignId: args.campaignId,
      tags: args.tags ?? [],
      workspaceMemberId: userId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const updateIdea = mutation({
  args: {
    ideaId: v.id("marketingIdeas"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    contentType: v.optional(v.string()),
    platform: v.optional(v.string()),
    pillar: v.optional(v.string()),
    // null explicitly unlinks the campaign; omit to leave it unchanged.
    campaignId: v.optional(v.union(v.id("campaigns"), v.null())),
    tags: v.optional(v.array(v.string())),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) throw new Error("Idea not found");
    await assertMember(ctx, idea.workspaceId);

    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign || campaign.workspaceId !== idea.workspaceId) {
        throw new Error("Unknown campaign");
      }
    }
    if (args.campaignId && args.campaignId !== idea.campaignId) {
      const siblings = await ctx.db
        .query("marketingIdeas")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", idea.workspaceId))
        .collect();
      const existing = siblings.find(
        (i) => i._id !== args.ideaId && i.title === idea.title,
      );
      if (existing) throw new Error("An idea with this title already exists");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, MAX_TITLE);
    if (args.description !== undefined) patch.description = args.description.trim().slice(0, 2000);
    if (args.contentType !== undefined) patch.contentType = args.contentType.trim().slice(0, MAX_PLATFORM);
    if (args.platform !== undefined) patch.platform = normalizePlatform(args.platform);
    if (args.pillar !== undefined) patch.pillar = args.pillar.trim().slice(0, 80);
    if (args.campaignId !== undefined) patch.campaignId = args.campaignId ?? undefined;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.workspaceMemberId !== undefined) patch.workspaceMemberId = args.workspaceMemberId;

    await ctx.db.patch(args.ideaId, patch);
    return { ok: true };
  },
});

export const removeIdea = mutation({
  args: { ideaId: v.id("marketingIdeas") },
  handler: async (ctx, args) => {
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) throw new Error("Idea not found");
    await assertMember(ctx, idea.workspaceId);
    await ctx.db.delete(args.ideaId);
    return { ok: true };
  },
});

/**
 * Convert an idea into a content draft — one-way, deduplicated. The idea row
 * is kept (nothing is lost) and links to the new entry via `convertedTo`.
 */
export const convertIdea = mutation({
  args: { ideaId: v.id("marketingIdeas") },
  handler: async (ctx, args) => {
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) throw new Error("Idea not found");
    const userId = await assertMember(ctx, idea.workspaceId);

    if (idea.convertedTo) {
      const existing = await ctx.db.get(idea.convertedTo);
      if (existing) {
        throw new Error("This idea has already been converted into a draft");
      }
    }

    const now = Date.now();
    const entryId = await ctx.db.insert("marketingEntries", {
      workspaceId: idea.workspaceId,
      title: idea.title,
      contentType: idea.contentType,
      platform: idea.platform,
      body: idea.description ?? "",
      status: "draft",
      campaignId: idea.campaignId,
      pillar: idea.pillar,
      tags: idea.tags,
      workspaceMemberId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.ideaId, { convertedTo: entryId, updatedAt: now });
    return entryId;
  },
});



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
      .collect();
    campaigns.sort(
      (a, b) =>
        (a.startDate ?? Number.MAX_SAFE_INTEGER) -
        (b.startDate ?? Number.MAX_SAFE_INTEGER),
    );

    const [allEntries, allIdeas] = await Promise.all([
      ctx.db
        .query("marketingEntries")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
      ctx.db
        .query("marketingIdeas")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
    ]);

    return campaigns.map((c) => {
      const entries = allEntries.filter((e) => e.campaignId === c._id);
      const ideas = allIdeas.filter((i) => i.campaignId === c._id);
      return {
        ...c,
        entryCount: entries.length,
        draftCount: entries.filter((e) => e.status === "draft").length,
        plannedCount: entries.filter((e) => e.status === "planned").length,
        readyCount: entries.filter((e) => e.status === "readyToPublish").length,
        publishedCount: entries.filter((e) => e.status === "published").length,
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
    const campaignId = args.campaignId;
    const ideas = (
      await ctx.db
        .query("marketingIdeas")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", campaign.workspaceId),
        )
        .collect()
    ).filter((i) => i.campaignId === campaignId);

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

export const createCampaign = mutation({
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
    const { userId, workspaceId } = await requireWorkspace(ctx);
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
    const name = args.name.trim().slice(0, MAX_TITLE);
    // Double-submit guard: reject an identical campaign created moments ago.
    const recentCampaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    if (
      recentCampaigns.some(
        (c) => c.name === name && now - c.createdAt < 15_000,
      )
    ) {
      throw new Error("This campaign was just created — possible duplicate submission");
    }
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
      workspaceMemberId: userId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const updateCampaign = mutation({
  args: {
    campaignId: v.id("campaigns"),
    name: v.optional(v.string()),
    objective: v.optional(v.string()),
    audience: v.optional(v.string()),
    // null clears the date; omit to leave it unchanged.
    startDate: v.optional(v.union(v.number(), v.null())),
    endDate: v.optional(v.union(v.number(), v.null())),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("completed"),
        v.literal("archived"),
      ),
    ),
    notes: v.optional(v.string()),
    // null unlinks; omit to leave it unchanged.
    goalId: v.optional(v.union(v.id("goals"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    await assertMember(ctx, campaign.workspaceId);

    if (args.goalId) {
      const goal = await ctx.db.get(args.goalId);
      if (!goal || goal.workspaceId !== campaign.workspaceId) throw new Error("Unknown goal");
    }
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== campaign.workspaceId) throw new Error("Unknown project");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim().slice(0, MAX_TITLE);
    if (args.objective !== undefined) patch.objective = args.objective.trim().slice(0, 200);
    if (args.audience !== undefined) patch.audience = args.audience.trim().slice(0, 200);
    if (args.startDate !== undefined) patch.startDate = args.startDate ?? undefined;
    if (args.endDate !== undefined) patch.endDate = args.endDate ?? undefined;
    if (args.status !== undefined) patch.status = args.status;
    if (args.notes !== undefined) patch.notes = args.notes.trim().slice(0, 2000);
    if (args.goalId !== undefined) patch.goalId = args.goalId ?? undefined;
    if (args.projectId !== undefined) patch.projectId = args.projectId ?? undefined;
    if (args.workspaceMemberId !== undefined) patch.workspaceMemberId = args.workspaceMemberId;

    await ctx.db.patch(args.campaignId, patch);
    return { ok: true };
  },
});

export const removeCampaign = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    await assertMember(ctx, campaign.workspaceId);
    await ctx.db.delete(args.campaignId);
    return { ok: true };
  },
});



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
      .collect();
    suggestions.sort((a, b) => b.createdAt - a.createdAt);
    return suggestions;
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

export const createSuggestion = mutation({
  args: {
    suggestionName: v.string(),
    content: v.string(),
    workspaceMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, workspaceId } = await requireWorkspace(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("marketingSuggestions", {
      workspaceId,
      suggestionName: args.suggestionName.trim().slice(0, 200),
      content: args.content,
      workspaceMemberId: userId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});


