import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { currentUserWorkspace, requireWorkspace } from "./lib/auth";
import { logActivity } from "./lib/activity";

const provider = "instagram" as const;

async function ownerCheck(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
) {
  const workspace = await ctx.db.get(workspaceId);
  return workspace?.ownerId === userId;
}

async function latestConnection(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
) {
  const rows = await ctx.db
    .query("integrationConnections")
    .withIndex("by_workspace_provider", (q) =>
      q.eq("workspaceId", workspaceId).eq("provider", provider),
    )
    .collect();
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows[0] ?? null;
}

/** Safe access metadata used by server actions. No secrets. */
export const access = query({
  args: {},
  handler: async (ctx) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) return null;
    const isOwner = await ownerCheck(
      ctx,
      session.workspaceId,
      session.userId,
    );
    return { ...session, isOwner, canManage: isOwner };
  },
});

/** Sanitized connection status. Access tokens are never included. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) {
      return { isOwner: false, canManage: false, connection: null, hasData: false };
    }
    const [connection, isOwner, samplePeriod] = await Promise.all([
      latestConnection(ctx, session.workspaceId),
      ownerCheck(ctx, session.workspaceId, session.userId),
      ctx.db
        .query("analyticsPeriods")
        .withIndex("by_workspace_period", (q) =>
          q.eq("workspaceId", session.workspaceId),
        )
        .first(),
    ]);

    if (!connection) {
      return {
        isOwner,
        canManage: isOwner,
        connection: null,
        hasData: Boolean(samplePeriod),
      };
    }

    const expired =
      connection.status === "connected" &&
      connection.tokenExpiresAt !== undefined &&
      connection.tokenExpiresAt < Date.now();

    return {
      isOwner,
      canManage: isOwner,
      hasData: Boolean(samplePeriod),
      connection: {
        id: connection._id,
        provider: connection.provider,
        username: connection.username ?? null,
        accountType: connection.accountType ?? null,
        profilePictureUrl: connection.profilePictureUrl ?? null,
        status: expired ? "needsReauth" : connection.status,
        statusMessage: expired
          ? "The Instagram access token expired. Reconnect to resume collection."
          : (connection.statusMessage ?? null),
        scopes: connection.scopes,
        connectedAt: connection.connectedAt,
        lastSyncedAt: connection.lastSyncedAt ?? null,
        lastSyncStatus: connection.lastSyncStatus ?? null,
        lastSyncError: connection.lastSyncError ?? null,
        tokenExpiresAt: connection.tokenExpiresAt ?? null,
      },
    };
  },
});

/** Internal: one-time OAuth state binding. */
export const saveOAuthState = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    stateHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("integrationOAuthStates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const row of existing) {
      if (row.expiresAt < Date.now() || row.usedAt) {
        await ctx.db.delete(row._id);
      }
    }
    return await ctx.db.insert("integrationOAuthStates", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      provider,
      stateHash: args.stateHash,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

/** Internal: atomically consume the state. Replays and expired states fail. */
export const consumeOAuthState = internalMutation({
  args: { stateHash: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("integrationOAuthStates")
      .withIndex("by_state_hash", (q) => q.eq("stateHash", args.stateHash))
      .first();
    if (!state) throw new Error("Invalid or unknown OAuth state");
    if (state.provider !== provider) throw new Error("OAuth provider mismatch");
    if (state.usedAt) throw new Error("OAuth state was already used");
    if (state.expiresAt < Date.now()) throw new Error("OAuth state expired");
    await ctx.db.patch(state._id, { usedAt: Date.now() });
    return {
      workspaceId: state.workspaceId,
      userId: state.userId,
    };
  },
});

/** Internal: action-side owner check for connect/sync/disconnect operations. */
export const requireOwnerForAction = query({
  args: {},
  handler: async (ctx) => {
    const session = await currentUserWorkspace(ctx);
    if (!session) throw new Error("Not authenticated");
    const workspace = await ctx.db.get(session.workspaceId);
    if (!workspace || workspace.ownerId !== session.userId) {
      throw new Error("Only the workspace owner can manage integrations");
    }
    return session;
  },
});

/** Internal: active connections for the scheduled sync action. */
export const activeConnectionsForSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("integrationConnections")
      .withIndex("by_status", (q) => q.eq("status", "connected"))
      .take(100);
    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      connectionId: row._id,
    }));
  },
});

/** Internal: encrypted connection material, used only by server actions. */
export const connectionForSync = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const connection = await latestConnection(ctx, args.workspaceId);
    if (!connection || connection.status === "disconnected") return null;
    return connection;
  },
});

/** Internal: persist the result of a completed OAuth exchange. */
export const saveConnection = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    providerAccountId: v.string(),
    appScopedUserId: v.optional(v.string()),
    username: v.optional(v.string()),
    accountType: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    accessTokenCiphertext: v.string(),
    tokenExpiresAt: v.number(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("integrationConnections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("provider", provider),
      )
      .collect();
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    const sameAccount = rows.find(
      (row) => row.providerAccountId === args.providerAccountId,
    );
    const now = Date.now();
    if (sameAccount) {
      await ctx.db.patch(sameAccount._id, {
        appScopedUserId: args.appScopedUserId,
        username: args.username,
        accountType: args.accountType,
        profilePictureUrl: args.profilePictureUrl,
        accessTokenCiphertext: args.accessTokenCiphertext,
        tokenExpiresAt: args.tokenExpiresAt,
        scopes: args.scopes,
        status: "connected",
        statusMessage: undefined,
        connectedBy: args.userId,
        connectedAt: now,
        updatedAt: now,
      });
      for (const row of rows) {
        if (row._id !== sameAccount._id && row.status === "connected") {
          await ctx.db.patch(row._id, {
            status: "disconnected",
            statusMessage: "Replaced by a newer connection",
            accessTokenCiphertext: undefined,
            // Keep the active connection unambiguous when timestamps tie.
            updatedAt: now - 1,
          });
        }
      }
      return sameAccount._id;
    }

    // A different account is a new connection. Existing analytics stay with
    // the old connection until the owner explicitly deletes them.
    for (const row of rows) {
      if (row.status === "connected") {
        await ctx.db.patch(row._id, {
          status: "disconnected",
          statusMessage: "Replaced by a newer connection",
          accessTokenCiphertext: undefined,
          // The new row must sort above the superseded connection.
          updatedAt: now - 1,
        });
      }
    }
    return await ctx.db.insert("integrationConnections", {
      workspaceId: args.workspaceId,
      provider,
      providerAccountId: args.providerAccountId,
      appScopedUserId: args.appScopedUserId,
      username: args.username,
      accountType: args.accountType,
      profilePictureUrl: args.profilePictureUrl,
      accessTokenCiphertext: args.accessTokenCiphertext,
      tokenExpiresAt: args.tokenExpiresAt,
      scopes: args.scopes,
      status: "connected",
      connectedBy: args.userId,
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Internal: proactive token refresh persistence. */
export const updateToken = internalMutation({
  args: {
    connectionId: v.id("integrationConnections"),
    accessTokenCiphertext: v.string(),
    tokenExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      accessTokenCiphertext: args.accessTokenCiphertext,
      tokenExpiresAt: args.tokenExpiresAt,
      status: "connected",
      statusMessage: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const markNeedsReauth = internalMutation({
  args: {
    connectionId: v.id("integrationConnections"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      status: "needsReauth",
      statusMessage: args.message.slice(0, 300),
      accessTokenCiphertext: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const markSyncError = internalMutation({
  args: {
    connectionId: v.id("integrationConnections"),
    syncRunId: v.id("analyticsSyncRuns"),
    message: v.string(),
    needsReauth: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.connectionId, {
      lastSyncStatus: "error",
      lastSyncError: args.message.slice(0, 500),
      ...(args.needsReauth
        ? {
            status: "needsReauth" as const,
            accessTokenCiphertext: undefined,
          }
        : {}),
      updatedAt: now,
    });
    await ctx.db.patch(args.syncRunId, {
      status: "error",
      finishedAt: now,
      error: args.message.slice(0, 500),
    });
  },
});

export const beginSync = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    trigger: v.union(
      v.literal("initial"),
      v.literal("manual"),
      v.literal("scheduled"),
      v.literal("reconnect"),
    ),
  },
  handler: async (ctx, args) => {
    const connection = await latestConnection(ctx, args.workspaceId);
    if (!connection || connection.status === "disconnected") {
      throw new Error("No Instagram account is connected");
    }
    if (connection.status === "needsReauth") {
      throw new Error("Instagram needs to be reconnected");
    }
    const recent = await ctx.db
      .query("analyticsSyncRuns")
      .withIndex("by_connection_started", (q) =>
        q.eq("connectionId", connection._id),
      )
      .order("desc")
      .take(1);
    if (
      recent[0]?.status === "running" &&
      Date.now() - recent[0].startedAt < 15 * 60 * 1000
    ) {
      return { busy: true as const, connectionId: connection._id };
    }
    const now = Date.now();
    const syncRunId = await ctx.db.insert("analyticsSyncRuns", {
      workspaceId: args.workspaceId,
      connectionId: connection._id,
      provider,
      trigger: args.trigger,
      status: "running",
      startedAt: now,
      createdAt: now,
    });
    await ctx.db.patch(connection._id, {
      lastSyncStatus: "running",
      lastSyncError: undefined,
      updatedAt: now,
    });
    return { busy: false as const, connectionId: connection._id, syncRunId };
  },
});

export const finishSync = internalMutation({
  args: {
    connectionId: v.id("integrationConnections"),
    syncRunId: v.id("analyticsSyncRuns"),
    status: v.union(v.literal("success"), v.literal("partial")),
    metricsStored: v.number(),
    dataAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.connectionId, {
      lastSyncedAt: args.dataAt,
      lastSyncStatus: args.status,
      lastSyncError: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(args.syncRunId, {
      status: args.status,
      metricsStored: args.metricsStored,
      finishedAt: now,
    });
  },
});

/** Internal: OAuth callback failure recorded against the workspace. */
export const recordOAuthFailure = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await latestConnection(ctx, args.workspaceId);
    const now = Date.now();
    if (connection) {
      await ctx.db.patch(connection._id, {
        status: "error",
        statusMessage: args.message.slice(0, 300),
        updatedAt: now,
      });
    } else {
      // We do not create a fake connection just to hold an error. The OAuth
      // failure is logged in the workspace activity trail instead.
      await logActivity(ctx, {
        workspaceId: args.workspaceId,
        actor: "user",
        action: "integration.instagram.failed",
        detail: `Instagram connection failed: ${args.message.slice(0, 180)}`,
        route: "/app/settings",
      });
    }
    return { ok: true as const, userId: args.userId };
  },
});

/** Public: owner-only normal disconnect. Tokens are removed; history stays. */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, workspaceId } = await requireWorkspace(ctx);
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace || workspace.ownerId !== userId) {
      throw new Error("Only the workspace owner can disconnect Instagram");
    }
    const connection = await latestConnection(ctx, workspaceId);
    if (!connection) return { ok: true as const };
    await ctx.db.patch(connection._id, {
      status: "disconnected",
      statusMessage: "Disconnected by the workspace owner. Stored analytics were kept.",
      accessTokenCiphertext: undefined,
      tokenExpiresAt: undefined,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, {
      workspaceId,
      actor: "user",
      action: "integration.instagram.disconnected",
      detail: `Disconnected @${connection.username ?? "Instagram account"}. Stored analytics were kept.`,
      route: "/app/settings",
    });
    return { ok: true as const };
  },
});

async function connectionsForMetaUser(
  ctx: MutationCtx,
  appScopedUserId: string | null,
  providerAccountId: string | null,
) {
  const byProvider = providerAccountId
    ? await ctx.db
        .query("integrationConnections")
        .withIndex("by_provider_account", (q) =>
          q.eq("provider", provider).eq("providerAccountId", providerAccountId),
        )
        .collect()
    : [];
  const byApp = appScopedUserId
    ? await ctx.db
        .query("integrationConnections")
        .withIndex("by_provider_app_scoped", (q) =>
          q.eq("provider", provider).eq("appScopedUserId", appScopedUserId),
        )
        .collect()
    : [];
  return [...new Map([...byProvider, ...byApp].map((row) => [row._id, row])).values()];
}

/** Internal: Meta deauthorization callback. Revoke the token, keep history. */
export const deauthorizeProviderAccount = internalMutation({
  args: {
    providerAccountId: v.optional(v.string()),
    appScopedUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connections = await connectionsForMetaUser(
      ctx,
      args.appScopedUserId ?? null,
      args.providerAccountId ?? null,
    );
    for (const connection of connections) {
      await ctx.db.patch(connection._id, {
        status: "disconnected",
        statusMessage: "Instagram revoked access.",
        accessTokenCiphertext: undefined,
        tokenExpiresAt: undefined,
        updatedAt: Date.now(),
      });
    }
    return { count: connections.length };
  },
});

async function deleteConnectionAnalytics(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  connectionId: Id<"integrationConnections">,
) {
  const daily = await ctx.db
    .query("analyticsAccountDaily")
    .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of daily) {
    if (row.connectionId === connectionId) await ctx.db.delete(row._id);
  }

  const periods = await ctx.db
    .query("analyticsPeriods")
    .withIndex("by_workspace_period", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of periods) {
    if (row.connectionId === connectionId) await ctx.db.delete(row._id);
  }

  const media = await ctx.db
    .query("analyticsMedia")
    .withIndex("by_workspace_timestamp", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of media) {
    if (row.connectionId === connectionId) await ctx.db.delete(row._id);
  }

  const links = await ctx.db
    .query("analyticsContentLinks")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of links) {
    if (row.connectionId === connectionId) await ctx.db.delete(row._id);
  }

  const runs = await ctx.db
    .query("analyticsSyncRuns")
    .withIndex("by_workspace_started", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of runs) {
    if (row.connectionId === connectionId) await ctx.db.delete(row._id);
  }

  const audience = await ctx.db
    .query("analyticsAudience")
    .withIndex("by_workspace_captured", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of audience) {
    if (row.connectionId === connectionId) await ctx.db.delete(row._id);
  }

  const reports = await ctx.db
    .query("intelligenceReports")
    .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of reports) {
    if (row.connectionId === connectionId) await ctx.db.delete(row._id);
  }

  const insights = await ctx.db
    .query("intelligenceInsights")
    .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of insights) {
    if (row.connectionId === connectionId) await ctx.db.delete(row._id);
  }

  const recommendations = await ctx.db
    .query("intelligenceRecommendations")
    .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of recommendations) {
    if (row.connectionId === connectionId) await ctx.db.delete(row._id);
  }
}

/**
 * Internal: Meta data deletion callback. Hard-deletes provider data for the
 * affected connection, including stored analytics and generated reports.
 */
export const deleteProviderAccountData = internalMutation({
  args: {
    providerAccountId: v.optional(v.string()),
    appScopedUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connections = await connectionsForMetaUser(
      ctx,
      args.appScopedUserId ?? null,
      args.providerAccountId ?? null,
    );
    for (const connection of connections) {
      await deleteConnectionAnalytics(
        ctx,
        connection.workspaceId,
        connection._id,
      );
      await ctx.db.delete(connection._id);
    }
    return { count: connections.length };
  },
});
