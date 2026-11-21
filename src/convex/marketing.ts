import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertMember, requireWorkspace } from "./lib/auth";
import { requireMarketingPlatform } from "../lib/marketing";

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
const MAX_ATTACHMENTS = 6;

const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  contentType: v.string(),
});

type Attachment = {
  storageId: Id<"_storage">;
  name: string;
  contentType: string;
};

function isMediaType(contentType: string): boolean {
  const value = contentType.trim().toLowerCase();
  return value.startsWith("image/") || value.startsWith("video/");
}

/**
 * Attachments are planning assets: images and short videos only, at most six
 * per entry. Anything else is dropped rather than stored as a dead file.
 */
function normalizedAttachments(list: Attachment[] | undefined): Attachment[] {
  return (list ?? [])
    .filter((a) => isMediaType(a.contentType))
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({
      storageId: a.storageId,
      name: a.name.trim().slice(0, 160) || "Attachment",
      contentType: a.contentType.trim().toLowerCase().slice(0, 80),
    }));
}

async function registeredUpload(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  storageId: Id<"_storage">,
) {
  return await ctx.db
    .query("marketingUploads")
    .withIndex("by_workspace_storage", (q) =>
      q.eq("workspaceId", workspaceId).eq("storageId", storageId),
    )
    .first();
}

/** Never read, attach or delete bytes that were not uploaded to this workspace. */
async function assertWorkspaceAttachments(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  attachments: Attachment[],
  existing?: { attachments?: Attachment[] },
) {
  const existingIds = new Set(
    (existing?.attachments ?? []).map((attachment) => attachment.storageId),
  );
  for (const attachment of attachments) {
    if (existingIds.has(attachment.storageId)) continue;
    if (!(await registeredUpload(ctx, workspaceId, attachment.storageId))) {
      throw new ConvexError("That attachment does not belong to this workspace");
    }
  }
}

async function deleteWorkspaceAttachments(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  attachments: Attachment[],
) {
  // Only files registered to this workspace may be deleted. Legacy entry
  // records predate the registry and cannot prove ownership, so their bytes
  // are deliberately left untouched rather than risking cross-workspace
  // deletion from a record created under the old unrestricted API.
  const seen = new Set<Id<"_storage">>();
  for (const attachment of attachments) {
    if (seen.has(attachment.storageId)) continue;
    seen.add(attachment.storageId);
    const upload = await registeredUpload(ctx, workspaceId, attachment.storageId);
    if (!upload) continue;
    await ctx.storage.delete(attachment.storageId);
    await ctx.db.delete(upload._id);
  }
}

/** One-time upload URL for a planner attachment (image or video). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireWorkspace(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Bind an uploaded file to the caller's workspace before it can be previewed
 * or attached. The one-time upload URL proves upload intent; this row proves
 * which workspace owns the resulting storage ID.
 */
export const registerUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, workspaceId } = await requireWorkspace(ctx);
    const contentType = args.contentType.trim().toLowerCase().slice(0, 80);
    if (!isMediaType(contentType)) {
      throw new ConvexError("Attachments must be an image or video");
    }
    const name = args.name.trim().slice(0, 160) || "Attachment";
    const existing = await registeredUpload(ctx, workspaceId, args.storageId);
    if (existing) return { storageId: existing.storageId };

    const elsewhere = await ctx.db
      .query("marketingUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (elsewhere && elsewhere.workspaceId !== workspaceId) {
      throw new ConvexError("That upload belongs to another workspace");
    }

    // The client supplies `contentType`, but the authoritative value is what
    // Convex recorded when the bytes were uploaded. Never trust the client's
    // MIME type for media validation or preview rendering.
    const stored = await ctx.db.system.get("_storage", args.storageId);
    if (!stored) throw new ConvexError("Uploaded file was not found");
    const storedContentType =
      stored.contentType?.trim().toLowerCase().slice(0, 80) ?? "";
    if (!isMediaType(storedContentType)) {
      throw new ConvexError("Attachments must be an image or video");
    }
    await ctx.db.insert("marketingUploads", {
      workspaceId,
      userId,
      storageId: args.storageId,
      name,
      contentType: storedContentType,
      createdAt: Date.now(),
    });
    return { storageId: args.storageId };
  },
});

/** Signed URL for previewing an attachment registered to this workspace. */
export const attachmentUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const upload = await ctx.db
      .query("marketingUploads")
      .withIndex("by_workspace_storage", (q) =>
        q.eq("workspaceId", workspaceId).eq("storageId", args.storageId),
      )
      .first();

    if (!upload) {
      // Existing planner records predate the upload registry. They remain
      // readable only when the storage ID is attached to an entry in this
      // same workspace.
      const entries = await ctx.db
        .query("marketingEntries")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      const linked = entries.some((entry) =>
        (entry.attachments ?? []).some(
          (attachment) => attachment.storageId === args.storageId,
        ),
      );
      if (!linked) {
        throw new ConvexError("That attachment does not belong to this workspace");
      }
    }
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Channels live in ../lib/marketing so the planner UI and the assistant
 * validate against exactly the same list. Creates and updates share this, so
 * both reject the same inputs instead of one coercing to "other".
 */

// ---------------------------------------------------------------------------
// marketingEntries
// ---------------------------------------------------------------------------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const [entries, campaigns] = await Promise.all([
      ctx.db
        .query("marketingEntries")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
      ctx.db
        .query("campaigns")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
    ]);
    const campaignById = new Map(campaigns.map((c) => [c._id, c]));
    entries.sort((a, b) => (b.scheduledAt ?? 0) - (a.scheduledAt ?? 0));
    return entries.map((e) => ({
      ...e,
      scheduledAt: e.scheduledAt ?? null,
      campaignName: e.campaignId
        ? campaignById.get(e.campaignId)?.name ?? null
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
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const { userId, workspaceId } = await requireWorkspace(ctx);
    if (args.title.trim().length === 0) throw new Error("Title is required");
    const platform = requireMarketingPlatform(args.platform);
    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign || campaign.workspaceId !== workspaceId) {
        throw new Error("Unknown campaign");
      }
    }
    const now = Date.now();
    const title = args.title.trim().slice(0, MAX_TITLE);
    // Verify ownership before deleting rejected files or saving any reference.
    await assertWorkspaceAttachments(ctx, workspaceId, args.attachments ?? []);
    const attachments = normalizedAttachments(args.attachments);
    const keptAttachments = new Set(attachments.map((a) => a.storageId));
    await deleteWorkspaceAttachments(
      ctx,
      workspaceId,
      (args.attachments ?? []).filter(
        (attachment) => !keptAttachments.has(attachment.storageId),
      ),
    );
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
      platform,
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
      attachments,
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
    // Full replacement list — omitted keeps the current attachments.
    attachments: v.optional(v.array(attachmentValidator)),
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
    if (args.title !== undefined && args.title.trim().length === 0) {
      throw new Error("Title is required");
    }
    const nextTitle = (args.title ?? entry.title).trim().slice(0, MAX_TITLE);
    const nextCampaignId =
      args.campaignId === undefined
        ? entry.campaignId
        : args.campaignId ?? undefined;
    // Duplicate guard — evaluated against the proposed title and target
    // campaign, and only when either of them actually changes.
    if (
      (nextTitle !== entry.title || nextCampaignId !== entry.campaignId) &&
      nextCampaignId
    ) {
      const campaignId = nextCampaignId;
      const siblings = await ctx.db
        .query("marketingEntries")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .collect();
      const existing = siblings.find(
        (e) => e._id !== args.entryId && e.title === nextTitle,
      );
      if (existing) throw new Error("A content entry with this title already exists under the campaign");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, MAX_TITLE);
    if (args.contentType !== undefined) patch.contentType = args.contentType.trim().slice(0, MAX_PLATFORM);
    if (args.platform !== undefined)
      patch.platform = requireMarketingPlatform(args.platform);
    if (args.body !== undefined) patch.body = args.body;
    if (args.hook !== undefined) patch.hook = args.hook.trim().slice(0, MAX_TITLE);
    if (args.callToAction !== undefined) patch.callToAction = args.callToAction.trim().slice(0, MAX_TITLE);
    if (args.creativeBrief !== undefined) patch.creativeBrief = args.creativeBrief.trim().slice(0, 2000);
    if (args.status !== undefined) patch.status = args.status;
    if (args.scheduledAt !== undefined) patch.scheduledAt = args.scheduledAt ?? undefined;
    if (args.pillar !== undefined) patch.pillar = args.pillar.trim().slice(0, 80);
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.audience !== undefined) patch.audience = args.audience.trim().slice(0, 160);
    if (args.campaignId !== undefined) patch.campaignId = args.campaignId ?? undefined;
    if (args.attachments !== undefined) {
      await assertWorkspaceAttachments(
        ctx,
        entry.workspaceId,
        args.attachments,
        entry,
      );
      const next = normalizedAttachments(args.attachments);
      patch.attachments = next;
      // Files removed from the entry (or rejected by validation) are deleted
      // from storage so a workspace never keeps orphaned media. Only files
      // proven to belong to this workspace are eligible for deletion.
      const kept = new Set(next.map((a) => a.storageId));
      await deleteWorkspaceAttachments(
        ctx,
        entry.workspaceId,
        [...(entry.attachments ?? []), ...args.attachments].filter(
          (attachment) => !kept.has(attachment.storageId),
        ),
      );
    }

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
    await deleteWorkspaceAttachments(
      ctx,
      entry.workspaceId,
      entry.attachments ?? [],
    );
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
  },
  handler: async (ctx, args) => {
    const { userId, workspaceId } = await requireWorkspace(ctx);
    if (args.title.trim().length === 0) throw new Error("Idea title is required");
    const platform = requireMarketingPlatform(args.platform);
    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign || campaign.workspaceId !== workspaceId) {
        throw new Error("Unknown campaign");
      }
    }
    const now = Date.now();
    const title = args.title.trim().slice(0, MAX_TITLE);
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
      platform,
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
    if (args.title !== undefined && args.title.trim().length === 0) {
      throw new Error("Idea title is required");
    }
    // Duplicate guard — evaluated against the proposed title, and only when
    // the title actually changes.
    const nextTitle = (args.title ?? idea.title).trim().slice(0, MAX_TITLE);
    if (nextTitle !== idea.title) {
      const siblings = await ctx.db
        .query("marketingIdeas")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", idea.workspaceId))
        .collect();
      const existing = siblings.find(
        (i) => i._id !== args.ideaId && i.title === nextTitle,
      );
      if (existing) throw new Error("An idea with this title already exists");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim().slice(0, MAX_TITLE);
    if (args.description !== undefined) patch.description = args.description.trim().slice(0, 2000);
    if (args.contentType !== undefined) patch.contentType = args.contentType.trim().slice(0, MAX_PLATFORM);
    if (args.platform !== undefined)
      patch.platform = requireMarketingPlatform(args.platform);
    if (args.pillar !== undefined) patch.pillar = args.pillar.trim().slice(0, 80);
    if (args.campaignId !== undefined) patch.campaignId = args.campaignId ?? undefined;
    if (args.tags !== undefined) patch.tags = args.tags;

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
    const ideas = await ctx.db
      .query("marketingIdeas")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
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
  },
  handler: async (ctx, args) => {
    const { userId, workspaceId } = await requireWorkspace(ctx);
    if (args.name.trim().length === 0) throw new Error("Campaign name is required");
    if (args.startDate && args.endDate && args.endDate < args.startDate) {
      throw new Error("The end date can't be before the start date");
    }
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
    if (args.name !== undefined && args.name.trim().length === 0) {
      throw new Error("Campaign name is required");
    }
    // Validate the effective date range (after applying any clears).
    const nextStart =
      args.startDate !== undefined ? args.startDate ?? undefined : campaign.startDate;
    const nextEnd =
      args.endDate !== undefined ? args.endDate ?? undefined : campaign.endDate;
    if (nextStart !== undefined && nextEnd !== undefined && nextEnd < nextStart) {
      throw new Error("The end date can't be before the start date");
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
    // Unlink content and ideas first so no record keeps a dangling reference.
    const [entries, ideas] = await Promise.all([
      ctx.db
        .query("marketingEntries")
        .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
        .collect(),
      ctx.db
        .query("marketingIdeas")
        .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
        .collect(),
    ]);
    for (const e of entries) {
      await ctx.db.patch(e._id, { campaignId: undefined });
    }
    for (const i of ideas) {
      await ctx.db.patch(i._id, { campaignId: undefined });
    }
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


