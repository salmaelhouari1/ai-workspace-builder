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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
