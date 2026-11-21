import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  decryptSecret,
  encryptSecret,
  randomHex,
} from "./lib/crypto";
import { shouldRefreshToken, tokenExpiresAt } from "./lib/token";
import { InstagramApiError, isInstagramAuthError } from "./lib/meta";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function seedWorkspace(
  t: T,
  name = "Northlight Studio",
  email = "owner@example.com",
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name, email });
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      businessType: "general",
      ownerId: userId,
      modules: [],
      onboardedAt: Date.now(),
      createdAt: Date.now(),
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
    });
    return { userId, workspaceId };
  });
}

async function insertConnection(
  t: T,
  workspaceId: Awaited<ReturnType<typeof seedWorkspace>>["workspaceId"],
  userId: Awaited<ReturnType<typeof seedWorkspace>>["userId"],
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("integrationConnections", {
      workspaceId,
      provider: "instagram",
      providerAccountId: "17841400000000000",
      appScopedUserId: "app-scoped-1",
      username: "northlight",
      accountType: "Business",
      scopes: [
        "instagram_business_basic",
        "instagram_business_manage_insights",
      ],
      status: "connected",
      connectedBy: userId,
      connectedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

describe("credential protection", () => {
  test("tokens round-trip through AES-GCM and tampering is rejected", async () => {
    const secret = randomHex(32);
    const token = "IGQVJ-secret-access-token";
    const encrypted = await encryptSecret(token, secret);
    expect(encrypted).not.toContain(token);
    await expect(decryptSecret(encrypted, secret)).resolves.toBe(token);
    const tampered = `${encrypted.slice(0, -2)}AA`;
    await expect(decryptSecret(tampered, secret)).rejects.toThrow();
    await expect(encryptSecret(token, "too-short")).rejects.toThrow();
  });

  test("OAuth state is one-time, bound and expiring", async () => {
    const t = setup();
    const { userId, workspaceId } = await seedWorkspace(t);
    await t.mutation(internal.integrations.saveOAuthState, {
      workspaceId,
      userId,
      stateHash: "state-one",
      expiresAt: Date.now() + 60_000,
    });

    const consumed = await t.mutation(
      internal.integrations.consumeOAuthState,
      { stateHash: "state-one" },
    );
    expect(consumed.workspaceId).toBe(workspaceId);
    expect(consumed.userId).toBe(userId);

    await expect(
      t.mutation(internal.integrations.consumeOAuthState, {
        stateHash: "state-one",
      }),
    ).rejects.toThrow("already used");

    await t.run(async (ctx) => {
      await ctx.db.insert("integrationOAuthStates", {
        workspaceId,
        userId,
        provider: "instagram",
        stateHash: "state-expired",
        expiresAt: Date.now() - 1,
        createdAt: Date.now() - 1_000,
      });
    });
    await expect(
      t.mutation(internal.integrations.consumeOAuthState, {
        stateHash: "state-expired",
      }),
    ).rejects.toThrow("expired");
  });
});

describe("token lifecycle helpers", () => {
  test("refresh is proactive, 24h-safe and expiry-aware", () => {
    const now = Date.UTC(2026, 10, 8);
    const day = 86_400_000;
    expect(shouldRefreshToken(now + 6 * day, now - 2 * day, now)).toBe(true);
    expect(shouldRefreshToken(now + 20 * day, now - 2 * day, now)).toBe(false);
    expect(shouldRefreshToken(now + 6 * day, now - 0.5 * day, now)).toBe(false);
    expect(shouldRefreshToken(undefined, now - 2 * day, now)).toBe(false);
    expect(tokenExpiresAt(3600, now) - now).toBe(3_600_000);
    expect(tokenExpiresAt(undefined, now) - now).toBe(60 * day);
  });

  test("auth errors are distinguished from other API failures", () => {
    expect(isInstagramAuthError(new InstagramApiError("expired", 401))).toBe(true);
    expect(
      isInstagramAuthError(new InstagramApiError("rate limit", 429, "4")),
    ).toBe(false);
    expect(isInstagramAuthError(new Error("network"))).toBe(false);
  });
});

describe("analytics storage and calculations", () => {
  test("sync storage is idempotent and keeps unavailable metrics null", async () => {
    const t = setup();
    const { userId, workspaceId } = await seedWorkspace(t);
    const connectionId = await insertConnection(t, workspaceId, userId);
    const now = Date.now();
    const payload = {
      connectionId,
      daily: [
        {
          date: "2026-11-08",
          followers: null,
          reach: 120,
          views: null,
          interactions: null,
          accountsEngaged: null,
          profileVisits: null,
          follows: null,
          unfollows: null,
          mediaCount: 1,
          capturedAt: now,
        },
      ],
      periods: [
        {
          periodKey: "30d",
          window: "current" as const,
          periodStart: now - 30 * 86_400_000,
          periodEnd: now,
          capturedAt: now,
          reach: 120,
          views: null,
          interactions: null,
          accountsEngaged: null,
          profileVisits: null,
          follows: null,
          unfollows: null,
          followerChange: null,
          followersEnd: null,
          mediaCount: 1,
        },
      ],
      media: [
        {
          mediaId: "media-1",
          mediaType: "VIDEO",
          mediaProductType: "REELS",
          caption: "Measured reel",
          permalink: "https://instagram.example/post",
          thumbnailUrl: undefined,
          timestamp: now,
          likeCount: 10,
          commentsCount: null,
          reach: 120,
          views: null,
          saves: null,
          shares: null,
          profileVisits: null,
          follows: null,
          interactions: 10,
          capturedAt: now,
        },
      ],
      audience: [],
    };

    await t.mutation(internal.analytics.storeData, payload);
    await t.mutation(internal.analytics.storeData, payload);

    const rows = await t.run(async (ctx) => ({
      daily: await ctx.db.query("analyticsAccountDaily").collect(),
      periods: await ctx.db.query("analyticsPeriods").collect(),
      media: await ctx.db.query("analyticsMedia").collect(),
    }));
    expect(rows.daily).toHaveLength(1);
    expect(rows.periods).toHaveLength(1);
    expect(rows.media).toHaveLength(1);
    expect(rows.daily[0].views).toBeNull();
    expect(rows.media[0].commentsCount).toBeNull();
  });

  test("another workspace cannot see or link analytics rows", async () => {
    const t = setup();
    const first = await seedWorkspace(t, "Northlight", "a@example.com");
    const second = await seedWorkspace(t, "Other", "b@example.com");
    const firstUser = t.withIdentity({ subject: first.userId });
    const secondUser = t.withIdentity({ subject: second.userId });
    const connectionId = await insertConnection(
      t,
      first.workspaceId,
      first.userId,
    );
    const now = Date.now();
    await t.mutation(internal.analytics.storeData, {
      connectionId,
      daily: [],
      periods: [
        {
          periodKey: "30d",
          window: "current",
          periodStart: now - 30 * 86_400_000,
          periodEnd: now,
          capturedAt: now,
          reach: 500,
          views: 600,
          interactions: 40,
          accountsEngaged: 30,
          profileVisits: null,
          follows: null,
          unfollows: null,
          followerChange: null,
          followersEnd: 100,
          mediaCount: 1,
        },
      ],
      media: [
        {
          mediaId: "private-media",
          mediaType: "IMAGE",
          mediaProductType: "FEED",
          timestamp: now,
          likeCount: null,
          commentsCount: null,
          reach: null,
          views: null,
          saves: null,
          shares: null,
          profileVisits: null,
          follows: null,
          interactions: null,
          capturedAt: now,
        },
      ],
      audience: [],
    });

    const firstDashboard = await firstUser.query(api.analytics.dashboard, {
      period: "30d",
    });
    const secondDashboard = await secondUser.query(api.analytics.dashboard, {
      period: "30d",
    });
    expect(firstDashboard?.snapshot?.period.metrics.reach).toBe(500);
    expect(secondDashboard?.connection).toBeNull();
    expect(secondDashboard?.snapshot).toBeNull();

    const media = await t.run(async (ctx) =>
      ctx.db.query("analyticsMedia").first(),
    );
    const entryId = await secondUser.mutation(api.marketing.create, {
      title: "Other workspace plan",
      contentType: "post",
      platform: "instagram",
      body: "Body",
      status: "published",
    });
    await expect(
      secondUser.mutation(api.analytics.linkMedia, {
        mediaId: media!._id,
        marketingEntryId: entryId,
      }),
    ).rejects.toThrow("workspace");
  });
});

describe("connection lifecycle", () => {
  test("a failed reconnect preserves a healthy existing connection", async () => {
    const t = setup();
    const { userId, workspaceId } = await seedWorkspace(t);
    const connectionId = await insertConnection(t, workspaceId, userId);
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, {
        accessTokenCiphertext: "encrypted-token",
        tokenExpiresAt: Date.now() + 60 * 86_400_000,
      });
    });

    await t.mutation(internal.integrations.recordOAuthFailure, {
      workspaceId,
      userId,
      message: "The user denied the new authorization request",
    });

    const row = await t.run((ctx) => ctx.db.get(connectionId));
    expect(row?.status).toBe("connected");
    expect(row?.accessTokenCiphertext).toBe("encrypted-token");
    const activity = await t.run(async (ctx) =>
      ctx.db.query("activityLog").collect(),
    );
    expect(activity.some((item) => item.action === "integration.instagram.failed")).toBe(
      true,
    );
  });

  test("an unexpected sync failure terminates the running run", async () => {
    const t = setup();
    const { userId, workspaceId } = await seedWorkspace(t);
    await insertConnection(t, workspaceId, userId);
    const started = await t.mutation(internal.integrations.beginSync, {
      workspaceId,
      trigger: "manual",
    });
    expect(started.busy).toBe(false);
    if (started.busy) throw new Error("expected a running sync");

    await t.mutation(internal.integrations.failSyncRun, {
      syncRunId: started.syncRunId,
      message: "Synthetic unexpected failure",
    });

    const state = await t.run(async (ctx) => ({
      run: await ctx.db.get(started.syncRunId),
      connection: await ctx.db.get(started.connectionId),
    }));
    expect(state.run?.status).toBe("error");
    expect(state.run?.finishedAt).not.toBeUndefined();
    expect(state.connection?.lastSyncStatus).toBe("error");
  });

  test("connecting a different account makes the new connection authoritative", async () => {
    const t = setup();
    const { userId, workspaceId } = await seedWorkspace(t);
    const firstId = await insertConnection(t, workspaceId, userId);

    const secondId = await t.mutation(internal.integrations.saveConnection, {
      workspaceId,
      userId,
      providerAccountId: "17841400000000001",
      appScopedUserId: "app-scoped-2",
      username: "second_account",
      accountType: "Creator",
      accessTokenCiphertext: "ciphertext-placeholder",
      tokenExpiresAt: Date.now() + 60 * 86_400_000,
      scopes: [
        "instagram_business_basic",
        "instagram_business_manage_insights",
      ],
    });

    const status = await t
      .withIdentity({ subject: userId })
      .query(api.integrations.status);
    expect(status.connection?.username).toBe("second_account");

    const rows = await t.run(async (ctx) => ({
      first: await ctx.db.get(firstId),
      second: await ctx.db.get(secondId),
    }));
    expect(rows.first?.status).toBe("disconnected");
    expect(rows.first?.accessTokenCiphertext).toBeUndefined();
    expect(rows.second?.status).toBe("connected");
  });
});

describe("recommendation actions", () => {
  test("a recommendation can become an existing task and is marked actioned", async () => {
    const t = setup();
    const { userId, workspaceId } = await seedWorkspace(t);
    const connectionId = await insertConnection(t, workspaceId, userId);
    const recommendationId = await t.run(async (ctx) =>
      ctx.db.insert("intelligenceRecommendations", {
        workspaceId,
        connectionId,
        periodKey: "30d",
        fingerprint: "test-1",
        title: "Make more room for Reels",
        explanation: "Reels had higher average reach.",
        evidence: [{ label: "Average reach", value: "900" }],
        confidence: "medium",
        suggestedAction: "Plan one Reels experiment.",
        potentialBenefit: "Hypothesis: reach may improve. Not a guarantee.",
        status: "new",
        source: "deterministic",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const user = t.withIdentity({ subject: userId });
    const result = await user.mutation(api.recommendations.act, {
      recommendationId,
      action: "createTask",
    });
    expect(result.route).toBe("/app/tasks");
    const tasks = await user.query(api.tasks.list, {});
    expect(tasks[0].title).toBe("Make more room for Reels");
    const row = await t.run((ctx) => ctx.db.get(recommendationId));
    expect(row?.status).toBe("actioned");
    expect(row?.actionedAt).toBeGreaterThan(0);
  });
});

describe("account deletion", () => {
  test("removes marketing, integration, analytics, reports and recommendations", async () => {
    const t = setup();
    const { userId, workspaceId } = await seedWorkspace(t, "Delete Me");
    const connectionId = await insertConnection(t, workspaceId, userId);
    const now = Date.now();
    let attachedStorageId: Id<"_storage"> | null = null;

    await t.run(async (ctx) => {
      await ctx.db.insert("campaigns", {
        workspaceId,
        name: "Campaign",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("marketingEntries", {
        workspaceId,
        title: "Post",
        contentType: "post",
        platform: "instagram",
        body: "Body",
        status: "published",
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("marketingIdeas", {
        workspaceId,
        title: "Idea",
        contentType: "post",
        platform: "instagram",
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("marketingSuggestions", {
        workspaceId,
        suggestionName: "Suggestion",
        content: "Content",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("analyticsPeriods", {
        workspaceId,
        connectionId,
        provider: "instagram",
        periodKey: "30d",
        window: "current",
        periodStart: now - 1_000,
        periodEnd: now,
        capturedAt: now,
        reach: null,
        views: null,
        interactions: null,
        accountsEngaged: null,
        profileVisits: null,
        follows: null,
        unfollows: null,
        followerChange: null,
        followersEnd: null,
        mediaCount: null,
      });
      await ctx.db.insert("analyticsSyncRuns", {
        workspaceId,
        connectionId,
        provider: "instagram",
        trigger: "manual",
        status: "success",
        startedAt: now,
        createdAt: now,
      });
      const mediaId = await ctx.db.insert("analyticsMedia", {
        workspaceId,
        connectionId,
        provider: "instagram",
        mediaId: "media-delete",
        mediaType: "IMAGE",
        timestamp: now,
        likeCount: null,
        commentsCount: null,
        reach: null,
        views: null,
        saves: null,
        shares: null,
        profileVisits: null,
        follows: null,
        interactions: null,
        capturedAt: now,
        updatedAt: now,
      });
      const entry = await ctx.db.query("marketingEntries").first();
      if (entry) {
        const storageId = await ctx.storage.store(
          new Blob(["attached"], { type: "image/png" }),
        );
        attachedStorageId = storageId;
        await ctx.db.insert("marketingUploads", {
          workspaceId,
          userId,
          storageId,
          name: "attached.png",
          contentType: "image/png",
          createdAt: now,
        });
        await ctx.db.patch(entry._id, {
          attachments: [
            { storageId, name: "attached.png", contentType: "image/png" },
          ],
        });
        await ctx.db.insert("analyticsContentLinks", {
          workspaceId,
          connectionId,
          mediaId,
          marketingEntryId: entry._id,
          matchSource: "manual",
          linkedBy: userId,
          createdAt: now,
          updatedAt: now,
        });
      }
      await ctx.db.insert("intelligenceReports", {
        workspaceId,
        connectionId,
        reportType: "weekly",
        periodKey: "7d",
        title: "Report",
        periodStart: now - 1_000,
        periodEnd: now,
        dataFreshnessAt: now,
        snapshot: "{}",
        snapshotHash: "hash",
        content: "# Report",
        source: "deterministic",
        generatedBy: userId,
        createdAt: now,
      });
      await ctx.db.insert("intelligenceRecommendations", {
        workspaceId,
        connectionId,
        periodKey: "30d",
        fingerprint: "delete-me",
        title: "Recommendation",
        explanation: "Explanation",
        evidence: [],
        confidence: "low",
        suggestedAction: "Action",
        potentialBenefit: "Hypothesis",
        status: "new",
        source: "deterministic",
        createdAt: now,
        updatedAt: now,
      });
    });

    const orphanStorageId = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(["orphan"], { type: "image/png" }),
      );
      await ctx.db.insert("marketingUploads", {
        workspaceId,
        userId,
        storageId,
        name: "orphan.png",
        contentType: "image/png",
        createdAt: now,
      });
      return storageId;
    });

    const user = t.withIdentity({ subject: userId });
    await user.mutation(api.account.deleteMe, { confirmName: "Delete Me" });

    const remaining = await t.run(async (ctx) => ({
      workspace: await ctx.db.get(workspaceId),
      connections: await ctx.db.query("integrationConnections").collect(),
      entries: await ctx.db.query("marketingEntries").collect(),
      campaigns: await ctx.db.query("campaigns").collect(),
      media: await ctx.db.query("analyticsMedia").collect(),
      periods: await ctx.db.query("analyticsPeriods").collect(),
      reports: await ctx.db.query("intelligenceReports").collect(),
      recommendations: await ctx.db
        .query("intelligenceRecommendations")
        .collect(),
      runs: await ctx.db.query("analyticsSyncRuns").collect(),
      uploads: await ctx.db.query("marketingUploads").collect(),
      orphanFile: await ctx.db.system.get("_storage", orphanStorageId),
      attachedFile: attachedStorageId
        ? await ctx.db.system.get("_storage", attachedStorageId)
        : null,
      user: await ctx.db.get(userId),
    }));
    expect(remaining.workspace).toBeNull();
    expect(remaining.user).toBeNull();
    expect(remaining.connections).toHaveLength(0);
    expect(remaining.entries).toHaveLength(0);
    expect(remaining.campaigns).toHaveLength(0);
    expect(remaining.media).toHaveLength(0);
    expect(remaining.periods).toHaveLength(0);
    expect(remaining.reports).toHaveLength(0);
    expect(remaining.recommendations).toHaveLength(0);
    expect(remaining.runs).toHaveLength(0);
    expect(remaining.uploads).toHaveLength(0);
    expect(remaining.orphanFile).toBeNull();
    expect(attachedStorageId).not.toBeNull();
    expect(remaining.attachedFile).toBeNull();
  });
});
