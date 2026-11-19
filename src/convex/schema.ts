import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const taskStatusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
);
export type TaskStatus = Infer<typeof taskStatusValidator>;

export const priorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);
export type Priority = Infer<typeof priorityValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // Recorded when the user accepts the Terms during registration;
      // never set retroactively for accounts created before this field.
      termsAcceptedVersion: v.optional(v.string()),
      termsAcceptedAt: v.optional(v.number()),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ------------------------------------------------------------------
    // OCIVO — AI-native workspace
    // Every user-owned row carries a workspaceId; all access is scoped
    // through the membership check in lib/auth.ts.
    // ------------------------------------------------------------------

    workspaces: defineTable({
      name: v.string(),
      // Detected or chosen business archetype, e.g. "freelance",
      // "ecommerce", "saas", "creator", "agency", "general".
      businessType: v.string(),
      // The natural-language description the user gave during onboarding.
      prompt: v.optional(v.string()),
      mainGoal: v.optional(v.string()),
      teamSize: v.optional(v.string()),
      stage: v.optional(v.string()),
      // Business Profile — everything the AI knows about the business.
      industry: v.optional(v.string()),
      website: v.optional(v.string()),
      productsServices: v.optional(v.string()),
      audienceDescription: v.optional(v.string()),
      customerNeeds: v.optional(v.string()),
      targetCustomerType: v.optional(v.string()),
      brandVoice: v.optional(v.string()),
      brandColors: v.optional(v.array(v.string())),
      preferredVocabulary: v.optional(v.string()),
      avoidWords: v.optional(v.string()),
      brandGuidelines: v.optional(v.string()),
      marketingGoals: v.optional(v.string()),
      preferredPlatforms: v.optional(v.array(v.string())),
      marketingPriorities: v.optional(v.string()),
      ownerId: v.id("users"),
      // Adaptive navigation: which modules this business actually sees.
      modules: v.array(v.string()),
      onboardedAt: v.number(),
      createdAt: v.number(),
    }).index("by_owner", ["ownerId"]),

    workspaceMembers: defineTable({
      workspaceId: v.id("workspaces"),
      userId: v.id("users"),
      role: v.string(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_user", ["userId", "workspaceId"]),

    // People the workspace owner added by email so tasks can be assigned
    // to them. userId/name are filled in when the email already belongs to
    // an OCIVO account — otherwise the email alone is enough to assign.
    teamMembers: defineTable({
      workspaceId: v.id("workspaces"),
      email: v.string(),
      name: v.optional(v.string()),
      userId: v.optional(v.id("users")),
      role: v.string(), // "member" (owner is derived from workspaces.ownerId)
      createdAt: v.number(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_email", ["workspaceId", "email"]),

    projects: defineTable({
      workspaceId: v.id("workspaces"),
      name: v.string(),
      description: v.optional(v.string()),
      status: v.union(
        v.literal("planned"),
        v.literal("active"),
        v.literal("paused"),
        v.literal("done"),
      ),
      priority: priorityValidator,
      deadline: v.optional(v.number()),
      // Seeded onboarding example — clearly marked in the UI, fully editable.
      isSample: v.optional(v.boolean()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_workspace_status", ["workspaceId", "status"]),

    tasks: defineTable({
      workspaceId: v.id("workspaces"),
      title: v.string(),
      description: v.optional(v.string()),
      status: taskStatusValidator,
      priority: priorityValidator,
      // Start of day timestamp (UTC-normalised by the client) — no time.
      dueDate: v.optional(v.number()),
      // Optional wall-clock label parsed from natural language, e.g. "10:00".
      dueTime: v.optional(v.string()),
      projectId: v.optional(v.id("projects")),
      // Subtasks: a task may live under exactly one parent task.
      parentId: v.optional(v.id("tasks")),
      tags: v.array(v.string()),
      // Who this task is assigned to (a team member's email — works even
      // before that person has an account). Name is a display snapshot.
      assigneeEmail: v.optional(v.string()),
      assigneeName: v.optional(v.string()),
      // Per-task notes/comments — "just in case that didn't go correctly".
      comments: v.optional(
        v.array(
          v.object({
            id: v.string(),
            text: v.string(),
            author: v.string(),
            createdAt: v.number(),
          }),
        ),
      ),
      // The AI's "why this matters now" explanation shown on Home.
      reason: v.optional(v.string()),
      source: v.optional(v.string()), // "manual" | "ai" | "inbox" | "generated"
      isSample: v.optional(v.boolean()),
      createdAt: v.number(),
      updatedAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_workspace_status", ["workspaceId", "status"])
      .index("by_project", ["projectId"])
      .index("by_parent", ["parentId"]),

    goals: defineTable({
      workspaceId: v.id("workspaces"),
      title: v.string(),
      description: v.optional(v.string()),
      target: v.optional(v.number()),
      current: v.optional(v.number()),
      unit: v.optional(v.string()), // "€", "$", "%", "clients"…
      deadline: v.optional(v.number()),
      status: v.union(v.literal("active"), v.literal("done")),
      // Projects that contribute real progress to this goal — completed vs
      // total tasks across them drives the progress bar when no manual
      // current/target is set. Optional so existing goals stay valid.
      projectIds: v.optional(v.array(v.id("projects"))),
      isSample: v.optional(v.boolean()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_workspace", ["workspaceId"]),

    inboxItems: defineTable({
      workspaceId: v.id("workspaces"),
      raw: v.string(),
      kind: v.union(
        v.literal("task"),
        v.literal("note"),
        v.literal("link"),
        v.literal("idea"),
      ),
      title: v.string(),
      detail: v.optional(v.string()),
      dueDate: v.optional(v.number()),
      url: v.optional(v.string()),
      projectId: v.optional(v.id("projects")),
      status: v.union(
        v.literal("pending"),
        v.literal("saved"),
        v.literal("dismissed"),
      ),
      createdAt: v.number(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_workspace_status", ["workspaceId", "status"]),

    documents: defineTable({
      workspaceId: v.id("workspaces"),
      title: v.string(),
      // Lightweight markdown (headings, lists, checkboxes, quotes, code,
      // callouts) — rendered by src/components/markdown.tsx.
      content: v.string(),
      category: v.string(), // "Overview", "Notes", "Processes", "Marketing"…
      projectId: v.optional(v.id("projects")),
      isSample: v.optional(v.boolean()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_workspace_category", ["workspaceId", "category"]),

    aiConversations: defineTable({
      workspaceId: v.id("workspaces"),
      title: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_workspace", ["workspaceId"]),

    aiMessages: defineTable({
      conversationId: v.id("aiConversations"),
      workspaceId: v.id("workspaces"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      // Clickable citations back into the workspace, e.g. a project or task.
      references: v.optional(
        v.array(
          v.object({
            label: v.string(),
            kind: v.string(),
            route: v.string(),
          }),
        ),
      ),
      createdAt: v.number(),
    }).index("by_conversation", ["conversationId"]),

    activityLog: defineTable({
      workspaceId: v.id("workspaces"),
      actor: v.union(v.literal("user"), v.literal("ai")),
      action: v.string(),
      detail: v.string(),
      route: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_workspace", ["workspaceId"]),

    marketingEntries: defineTable({
      workspaceId: v.id("workspaces"),
      title: v.string(),
      // Content type: post, article, thread, script, ad, newsletter…
      contentType: v.string(),
      platform: v.string(), // "instagram" | "tiktok" | "linkedin" | "facebook" | "pinterest" | "email" | "other"
      // Markdown caption / body.
      body: v.string(),
      hook: v.optional(v.string()),
      callToAction: v.optional(v.string()),
      // Optional creative brief / asset reference (e.g. a document id).
      creativeBrief: v.optional(v.string()),
      // Image/video attachments held in Convex file storage. Planning only —
      // nothing is ever uploaded to a social platform from here.
      attachments: v.optional(
        v.array(
          v.object({
            storageId: v.id("_storage"),
            name: v.string(),
            contentType: v.string(),
          }),
        ),
      ),
      // One of the five lifecycle statuses (statuses are the single source
      // of truth for the planner).
      status: v.union(
        v.literal("idea"),
        v.literal("draft"),
        v.literal("planned"),
        v.literal("readyToPublish"),
        v.literal("published"),
      ),
      // ISO-8601 local date-time for scheduling. A planned/ready draft uses
      // this to show up on the calendar.
      scheduledAt: v.optional(v.number()),
      // Which campaign this entry belongs to (NULL = standalone).
      campaignId: v.optional(v.id("campaigns")),
      // The content pillar this entry serves — a business-chosen lens
      // (e.g. "education", "product" , "offer").
      pillar: v.optional(v.string()),
      // Free-form tags.
      tags: v.array(v.string()),
      // Who the content is for, a short audience descriptor used by the AI.
      audience: v.optional(v.string()),
      // Owner + timestamp for optimistic UI, filtering and reports.
      workspaceMemberId: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_workspace_status", ["workspaceId", "status"])
      .index("by_campaign", ["campaignId"]),

    marketingIdeas: defineTable({
      workspaceId: v.id("workspaces"),
      title: v.string(),
      description: v.optional(v.string()),
      // Content type the idea should become.
      contentType: v.string(),
      platform: v.string(),
      pillar: v.optional(v.string()),
      campaignId: v.optional(v.id("campaigns")),
      tags: v.array(v.string()),
      workspaceMemberId: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      // When an idea is converted into a draft, this links to the new
      // marketingEntry; null means it is still an idea only.
      convertedTo: v.optional(v.id("marketingEntries")),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_campaign", ["campaignId"])
      .index("by_workspace_status", ["workspaceId", "convertedTo"]),

    campaigns: defineTable({
      workspaceId: v.id("workspaces"),
      name: v.string(),
      objective: v.optional(v.string()), // e.g. launch, awareness, retention
      audience: v.optional(v.string()),
      // ISO-8601 local date-time.
      startDate: v.optional(v.number()),
      endDate: v.optional(v.number()),
      status: v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("completed"),
        v.literal("archived"),
      ),
      notes: v.optional(v.string()),
      // Link to an existing workspace goal so progress can be derived.
      goalId: v.optional(v.id("goals")),
      // Link to an existing workspace project so the campaign can live in
      // ProjectDetail.
      projectId: v.optional(v.id("projects")),
      workspaceMemberId: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_workspace_status", ["workspaceId", "status"]),

    marketingSuggestions: defineTable({
      workspaceId: v.id("workspaces"),
      // Deterministic counter so the AI can show "keep sync" later.
      suggestionName: v.string(),
      // The user-approved proposal, stored as Markdown.
      content: v.string(),
      workspaceMemberId: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_workspace", ["workspaceId"]),

    // Upload ownership proof. Convex storage IDs are opaque handles, not
    // workspace-scoped permissions; every attachment must be registered here
    // before the app will read, attach or delete its bytes.
    marketingUploads: defineTable({
      workspaceId: v.id("workspaces"),
      userId: v.id("users"),
      storageId: v.id("_storage"),
      name: v.string(),
      contentType: v.string(),
      createdAt: v.number(),
    })
      .index("by_workspace_storage", ["workspaceId", "storageId"])
      .index("by_workspace", ["workspaceId"])
      .index("by_storage", ["storageId"]),

    // ------------------------------------------------------------------
    // Marketing intelligence — additive, provider-agnostic.
    // Access tokens only ever live here as ciphertext. Public queries return
    // a sanitized connection object and never this row.
    // ------------------------------------------------------------------

    integrationConnections: defineTable({
      workspaceId: v.id("workspaces"),
      provider: v.string(), // "instagram" first; future providers use the same row shape
      providerAccountId: v.string(),
      // App-scoped ID returned by /me. Meta deauthorization/deletion
      // callbacks may identify the user with this value instead.
      appScopedUserId: v.optional(v.string()),
      username: v.optional(v.string()),
      accountType: v.optional(v.string()),
      profilePictureUrl: v.optional(v.string()),
      accessTokenCiphertext: v.optional(v.string()),
      tokenExpiresAt: v.optional(v.number()),
      scopes: v.array(v.string()),
      status: v.union(
        v.literal("connected"),
        v.literal("needsReauth"),
        v.literal("error"),
        v.literal("disconnected"),
      ),
      statusMessage: v.optional(v.string()),
      connectedBy: v.id("users"),
      connectedAt: v.number(),
      lastSyncedAt: v.optional(v.number()),
      lastSyncStatus: v.optional(
        v.union(
          v.literal("running"),
          v.literal("success"),
          v.literal("partial"),
          v.literal("error"),
        ),
      ),
      lastSyncError: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_workspace_provider", ["workspaceId", "provider"])
      .index("by_provider_account", ["provider", "providerAccountId"])
      .index("by_provider_app_scoped", ["provider", "appScopedUserId"])
      .index("by_status", ["status"]),

    integrationOAuthStates: defineTable({
      workspaceId: v.id("workspaces"),
      userId: v.id("users"),
      provider: v.string(),
      // Only a SHA-256 hash of the state leaves the action.
      stateHash: v.string(),
      expiresAt: v.number(),
      usedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_state_hash", ["stateHash"])
      .index("by_workspace", ["workspaceId"]),

    analyticsAccountDaily: defineTable({
      workspaceId: v.id("workspaces"),
      connectionId: v.id("integrationConnections"),
      provider: v.string(),
      date: v.string(), // UTC YYYY-MM-DD
      followers: v.union(v.number(), v.null()),
      reach: v.union(v.number(), v.null()),
      views: v.union(v.number(), v.null()),
      interactions: v.union(v.number(), v.null()),
      accountsEngaged: v.union(v.number(), v.null()),
      profileVisits: v.union(v.number(), v.null()),
      follows: v.union(v.number(), v.null()),
      unfollows: v.union(v.number(), v.null()),
      mediaCount: v.union(v.number(), v.null()),
      capturedAt: v.number(),
    })
      .index("by_workspace_date", ["workspaceId", "date"])
      .index("by_connection_date", ["connectionId", "date"]),

    analyticsPeriods: defineTable({
      workspaceId: v.id("workspaces"),
      connectionId: v.id("integrationConnections"),
      provider: v.string(),
      periodKey: v.string(), // "7d" | "30d" | "90d"
      window: v.union(v.literal("current"), v.literal("previous")),
      periodStart: v.number(),
      periodEnd: v.number(),
      capturedAt: v.number(),
      reach: v.union(v.number(), v.null()),
      views: v.union(v.number(), v.null()),
      interactions: v.union(v.number(), v.null()),
      accountsEngaged: v.union(v.number(), v.null()),
      profileVisits: v.union(v.number(), v.null()),
      follows: v.union(v.number(), v.null()),
      unfollows: v.union(v.number(), v.null()),
      followerChange: v.union(v.number(), v.null()),
      followersEnd: v.union(v.number(), v.null()),
      mediaCount: v.union(v.number(), v.null()),
    })
      .index("by_workspace_period", ["workspaceId", "periodKey"])
      .index("by_connection_period", ["connectionId", "periodKey", "window"]),

    analyticsMedia: defineTable({
      workspaceId: v.id("workspaces"),
      connectionId: v.id("integrationConnections"),
      provider: v.string(),
      mediaId: v.string(),
      mediaType: v.string(),
      mediaProductType: v.optional(v.string()),
      caption: v.optional(v.string()),
      permalink: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      timestamp: v.number(),
      likeCount: v.union(v.number(), v.null()),
      commentsCount: v.union(v.number(), v.null()),
      reach: v.union(v.number(), v.null()),
      views: v.union(v.number(), v.null()),
      saves: v.union(v.number(), v.null()),
      shares: v.union(v.number(), v.null()),
      profileVisits: v.union(v.number(), v.null()),
      follows: v.union(v.number(), v.null()),
      interactions: v.union(v.number(), v.null()),
      capturedAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_workspace_timestamp", ["workspaceId", "timestamp"])
      .index("by_connection_media", ["connectionId", "mediaId"]),

    analyticsContentLinks: defineTable({
      workspaceId: v.id("workspaces"),
      connectionId: v.id("integrationConnections"),
      mediaId: v.id("analyticsMedia"),
      marketingEntryId: v.id("marketingEntries"),
      matchSource: v.union(v.literal("manual"), v.literal("suggested")),
      confidence: v.optional(v.number()),
      linkedBy: v.id("users"),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_workspace", ["workspaceId"])
      .index("by_workspace_entry", ["workspaceId", "marketingEntryId"])
      .index("by_media", ["mediaId"]),

    analyticsSyncRuns: defineTable({
      workspaceId: v.id("workspaces"),
      connectionId: v.id("integrationConnections"),
      provider: v.string(),
      trigger: v.union(
        v.literal("initial"),
        v.literal("manual"),
        v.literal("scheduled"),
        v.literal("reconnect"),
      ),
      status: v.union(
        v.literal("running"),
        v.literal("success"),
        v.literal("partial"),
        v.literal("error"),
      ),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
      metricsStored: v.optional(v.number()),
      error: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_workspace_started", ["workspaceId", "startedAt"])
      .index("by_connection_started", ["connectionId", "startedAt"]),

    analyticsAudience: defineTable({
      workspaceId: v.id("workspaces"),
      connectionId: v.id("integrationConnections"),
      provider: v.string(),
      capturedAt: v.number(),
      timeframe: v.string(),
      breakdown: v.union(
        v.literal("age"),
        v.literal("country"),
        v.literal("gender"),
        v.literal("city"),
      ),
      values: v.array(
        v.object({
          label: v.string(),
          value: v.number(),
        }),
      ),
    })
      .index("by_workspace_captured", ["workspaceId", "capturedAt"])
      .index("by_connection", ["connectionId"]),

    intelligenceReports: defineTable({
      workspaceId: v.id("workspaces"),
      connectionId: v.id("integrationConnections"),
      reportType: v.union(
        v.literal("weekly"),
        v.literal("monthly"),
        v.literal("content"),
        v.literal("audience"),
        v.literal("improvement"),
      ),
      periodKey: v.string(),
      title: v.string(),
      periodStart: v.number(),
      periodEnd: v.number(),
      dataFreshnessAt: v.number(),
      snapshot: v.string(),
      snapshotHash: v.string(),
      content: v.string(),
      source: v.union(v.literal("ai"), v.literal("deterministic")),
      generatedBy: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_workspace_created", ["workspaceId", "createdAt"])
      .index("by_workspace_type", ["workspaceId", "reportType"]),

    intelligenceInsights: defineTable({
      workspaceId: v.id("workspaces"),
      connectionId: v.id("integrationConnections"),
      reportId: v.optional(v.id("intelligenceReports")),
      periodKey: v.string(),
      kind: v.union(
        v.literal("observation"),
        v.literal("interpretation"),
        v.literal("opportunity"),
        v.literal("recommendation"),
        v.literal("limitation"),
      ),
      title: v.string(),
      body: v.string(),
      evidence: v.string(),
      confidence: v.optional(
        v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
      ),
      createdAt: v.number(),
    }).index("by_workspace_created", ["workspaceId", "createdAt"]),

    intelligenceRecommendations: defineTable({
      workspaceId: v.id("workspaces"),
      connectionId: v.id("integrationConnections"),
      periodKey: v.string(),
      fingerprint: v.string(),
      title: v.string(),
      explanation: v.string(),
      evidence: v.array(
        v.object({
          label: v.string(),
          value: v.string(),
        }),
      ),
      confidence: v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
      ),
      suggestedAction: v.string(),
      // Always framed as a hypothesis, never a guaranteed outcome.
      potentialBenefit: v.string(),
      status: v.union(
        v.literal("new"),
        v.literal("saved"),
        v.literal("dismissed"),
        v.literal("actioned"),
      ),
      source: v.union(v.literal("ai"), v.literal("deterministic")),
      actionRoute: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      actionedAt: v.optional(v.number()),
    })
      .index("by_workspace_status", ["workspaceId", "status"])
      .index("by_workspace_created", ["workspaceId", "createdAt"])
      .index("by_workspace_fingerprint", ["workspaceId", "fingerprint"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
