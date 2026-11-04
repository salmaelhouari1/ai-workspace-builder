import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

/** A fresh backend with one workspace and one signed-in member. */
async function seedWorkspace(t: T) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Salma",
      email: "salma@example.com",
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Atelier",
      businessType: "freelance",
      ownerId: userId,
      modules: [],
      onboardedAt: Date.now(),
      createdAt: Date.now(),
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "admin",
    });
    return { userId, workspaceId };
  });
}

async function seeded() {
  const t = setup();
  const { userId, workspaceId } = await seedWorkspace(t);
  const user = t.withIdentity({ subject: userId });
  return { t, userId, workspaceId, user };
}

function entryArgs(
  overrides: Partial<{
    title: string;
    contentType: string;
    platform: string;
    body: string;
    status: "idea" | "draft" | "planned" | "readyToPublish" | "published";
    campaignId: Id<"campaigns">;
  }> = {},
) {
  return {
    title: "Launch teaser",
    contentType: "post",
    platform: "instagram",
    body: "A short caption.",
    status: "draft" as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Platform validation — create and update must reject the same inputs.
// ---------------------------------------------------------------------------

describe("platform validation", () => {
  test("create normalizes casing and whitespace", async () => {
    const { t, user } = await seeded();
    const entryId = await user.mutation(
      api.marketing.create,
      entryArgs({ platform: "  Instagram " }),
    );
    const doc = await t.run((ctx) => ctx.db.get(entryId));
    expect(doc?.platform).toBe("instagram");
  });

  test("create rejects an unsupported platform", async () => {
    const { user } = await seeded();
    await expect(
      user.mutation(api.marketing.create, entryArgs({ platform: "twitter" })),
    ).rejects.toThrow("Unsupported platform");
  });

  test('update rejects an unsupported platform instead of coercing to "other"', async () => {
    const { t, user } = await seeded();
    const entryId = await user.mutation(api.marketing.create, entryArgs());
    await expect(
      user.mutation(api.marketing.update, {
        entryId,
        platform: "twitter",
      }),
    ).rejects.toThrow("Unsupported platform");
    const doc = await t.run((ctx) => ctx.db.get(entryId));
    expect(doc?.platform).toBe("instagram");
  });

  test("createIdea and updateIdea enforce the same rule", async () => {
    const { t, user } = await seeded();
    await expect(
      user.mutation(api.marketing.createIdea, {
        title: "Story idea",
        contentType: "post",
        platform: "myspace",
      }),
    ).rejects.toThrow("Unsupported platform");

    const ideaId = await user.mutation(api.marketing.createIdea, {
      title: "Story idea",
      contentType: "post",
      platform: "instagram",
    });
    await expect(
      user.mutation(api.marketing.updateIdea, {
        ideaId,
        platform: "myspace",
      }),
    ).rejects.toThrow("Unsupported platform");
    const doc = await t.run((ctx) => ctx.db.get(ideaId));
    expect(doc?.platform).toBe("instagram");
  });
});

// ---------------------------------------------------------------------------
// Blank titles/names are rejected on update, not just on create.
// ---------------------------------------------------------------------------

describe("blank text on update", () => {
  test("updateEntry rejects a blank title", async () => {
    const { user } = await seeded();
    const entryId = await user.mutation(api.marketing.create, entryArgs());
    await expect(
      user.mutation(api.marketing.update, { entryId, title: "   " }),
    ).rejects.toThrow("Title is required");
  });

  test("updateIdea rejects a blank title", async () => {
    const { user } = await seeded();
    const ideaId = await user.mutation(api.marketing.createIdea, {
      title: "Story idea",
      contentType: "post",
      platform: "instagram",
    });
    await expect(
      user.mutation(api.marketing.updateIdea, { ideaId, title: "" }),
    ).rejects.toThrow("Idea title is required");
  });

  test("updateCampaign rejects a blank name", async () => {
    const { user } = await seeded();
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Spring launch",
      status: "active",
    });
    await expect(
      user.mutation(api.marketing.updateCampaign, {
        campaignId,
        name: "  ",
      }),
    ).rejects.toThrow("Campaign name is required");
  });
});

// ---------------------------------------------------------------------------
// Duplicate guards evaluate the *proposed* title, and only on change.
// ---------------------------------------------------------------------------

describe("duplicate guards", () => {
  test("renaming onto an existing title in the same campaign is rejected", async () => {
    const { user } = await seeded();
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Spring launch",
      status: "active",
    });
    await user.mutation(api.marketing.create, entryArgs({ title: "Alpha", campaignId }));
    const second = await user.mutation(
      api.marketing.create,
      entryArgs({ title: "Beta", campaignId }),
    );
    await expect(
      user.mutation(api.marketing.update, { entryId: second, title: "Alpha" }),
    ).rejects.toThrow("already exists under the campaign");
  });

  test("editing a field without changing title or campaign succeeds", async () => {
    const { t, user } = await seeded();
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Spring launch",
      status: "active",
    });
    const entryId = await user.mutation(
      api.marketing.create,
      entryArgs({ campaignId }),
    );
    await user.mutation(api.marketing.update, { entryId, body: "New body." });
    const doc = await t.run((ctx) => ctx.db.get(entryId));
    expect(doc?.body).toBe("New body.");
    expect(doc?.title).toBe("Launch teaser");
  });

  test("renaming an idea onto an existing idea title is rejected", async () => {
    const { user } = await seeded();
    await user.mutation(api.marketing.createIdea, {
      title: "Carousel about sizing",
      contentType: "post",
      platform: "instagram",
    });
    const second = await user.mutation(api.marketing.createIdea, {
      title: "Reel about packaging",
      contentType: "video",
      platform: "tiktok",
    });
    await expect(
      user.mutation(api.marketing.updateIdea, {
        ideaId: second,
        title: "Carousel about sizing",
      }),
    ).rejects.toThrow("An idea with this title already exists");
  });

  test("an identical create moments apart is rejected as a double submit", async () => {
    const { user } = await seeded();
    await user.mutation(api.marketing.create, entryArgs());
    await expect(
      user.mutation(api.marketing.create, entryArgs()),
    ).rejects.toThrow("possible duplicate submission");
  });
});

// ---------------------------------------------------------------------------
// Campaign date range validation (create and update, incl. null clears).
// ---------------------------------------------------------------------------

describe("campaign dates", () => {
  test("create rejects an end date before the start date", async () => {
    const { user } = await seeded();
    await expect(
      user.mutation(api.marketing.createCampaign, {
        name: "Backwards",
        status: "active",
        startDate: 20_000,
        endDate: 10_000,
      }),
    ).rejects.toThrow("The end date can't be before the start date");
  });

  test("update validates the effective range after clears", async () => {
    const { t, user } = await seeded();
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Dated",
      status: "active",
      startDate: 10_000,
      endDate: 20_000,
    });
    await expect(
      user.mutation(api.marketing.updateCampaign, { campaignId, endDate: 5_000 }),
    ).rejects.toThrow("The end date can't be before the start date");

    // Clearing the end date makes a later start date valid again.
    await user.mutation(api.marketing.updateCampaign, {
      campaignId,
      endDate: null,
      startDate: 30_000,
    });
    const doc = await t.run((ctx) => ctx.db.get(campaignId));
    expect(doc?.startDate).toBe(30_000);
    expect(doc?.endDate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Deleting a campaign/goal/project never leaves dangling references.
// ---------------------------------------------------------------------------

describe("unlink on delete", () => {
  test("removeCampaign unlinks entries and ideas before deleting", async () => {
    const { t, user } = await seeded();
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Spring launch",
      status: "active",
    });
    const entryId = await user.mutation(
      api.marketing.create,
      entryArgs({ title: "Linked content", campaignId }),
    );
    const ideaId = await user.mutation(api.marketing.createIdea, {
      title: "Linked idea",
      contentType: "post",
      platform: "instagram",
      campaignId,
    });

    await user.mutation(api.marketing.removeCampaign, { campaignId });

    const { campaign, entry, idea } = await t.run(async (ctx) => ({
      campaign: await ctx.db.get(campaignId),
      entry: await ctx.db.get(entryId),
      idea: await ctx.db.get(ideaId),
    }));
    expect(campaign).toBeNull();
    expect(entry?.campaignId).toBeUndefined();
    expect(idea?.campaignId).toBeUndefined();
  });

  test("removing a goal clears campaigns.goalId", async () => {
    const { t, user, workspaceId } = await seeded();
    const goalId = await t.run((ctx) =>
      ctx.db.insert("goals", {
        workspaceId,
        title: "Grow revenue",
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Goal-linked",
      status: "active",
      goalId,
    });

    await user.mutation(api.goals.remove, { goalId });

    const campaign = await t.run((ctx) => ctx.db.get(campaignId));
    expect(campaign).not.toBeNull();
    expect(campaign?.goalId).toBeUndefined();
  });

  test("removing a project clears campaigns.projectId", async () => {
    const { t, user, workspaceId } = await seeded();
    const projectId = await t.run((ctx) =>
      ctx.db.insert("projects", {
        workspaceId,
        name: "Website relaunch",
        status: "planned",
        priority: "medium",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Project-linked",
      status: "active",
      projectId,
    });

    await user.mutation(api.projects.remove, { projectId });

    const campaign = await t.run((ctx) => ctx.db.get(campaignId));
    expect(campaign).not.toBeNull();
    expect(campaign?.projectId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Ownership and null-clear semantics.
// ---------------------------------------------------------------------------

describe("ownership and clearing", () => {
  test("a client cannot overwrite the stored owner", async () => {
    const { t, user, userId } = await seeded();
    const entryId = await user.mutation(api.marketing.create, entryArgs());
    const spoof = {
      entryId,
      body: "Spoofed body.",
      workspaceMemberId: "someone-else",
    };
    try {
      await user.mutation(api.marketing.update, spoof as never);
    } catch {
      // Rejecting the extra field outright is fine too.
    }
    const doc = await t.run((ctx) => ctx.db.get(entryId));
    expect(doc?.workspaceMemberId).toBe(userId);
  });

  test("campaignId: null unlinks an entry from its campaign", async () => {
    const { t, user } = await seeded();
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Spring launch",
      status: "active",
    });
    const entryId = await user.mutation(
      api.marketing.create,
      entryArgs({ campaignId }),
    );
    await user.mutation(api.marketing.update, { entryId, campaignId: null });
    const doc = await t.run((ctx) => ctx.db.get(entryId));
    expect(doc?.campaignId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// list joins campaign names from a single workspace-scoped query.
// ---------------------------------------------------------------------------

describe("list campaign join", () => {
  test("returns campaignName for linked entries and null for standalone", async () => {
    const { user } = await seeded();
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Spring launch",
      status: "active",
    });
    await user.mutation(
      api.marketing.create,
      entryArgs({ title: "Linked", campaignId }),
    );
    await user.mutation(
      api.marketing.create,
      entryArgs({ title: "Standalone", platform: "tiktok" }),
    );

    const rows = await user.query(api.marketing.list, {});
    expect(rows.find((r) => r.title === "Linked")?.campaignName).toBe(
      "Spring launch",
    );
    expect(rows.find((r) => r.title === "Standalone")?.campaignName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Email is a first-class planner channel.
// ---------------------------------------------------------------------------

describe("email channel", () => {
  test("create and update accept email and normalize it", async () => {
    const { t, user } = await seeded();
    const entryId = await user.mutation(
      api.marketing.create,
      entryArgs({ platform: " Email " }),
    );
    const created = await t.run((ctx) => ctx.db.get(entryId));
    expect(created?.platform).toBe("email");

    await user.mutation(api.marketing.update, { entryId, platform: "EMAIL" });
    const updated = await t.run((ctx) => ctx.db.get(entryId));
    expect(updated?.platform).toBe("email");
  });

  test("ideas accept email too", async () => {
    const { t, user } = await seeded();
    const ideaId = await user.mutation(api.marketing.createIdea, {
      title: "Welcome sequence",
      contentType: "Newsletter",
      platform: "email",
    });
    const doc = await t.run((ctx) => ctx.db.get(ideaId));
    expect(doc?.platform).toBe("email");
  });

  test("email is not coerced away by an unrelated update", async () => {
    const { t, user } = await seeded();
    const entryId = await user.mutation(
      api.marketing.create,
      entryArgs({ platform: "email", contentType: "Newsletter" }),
    );
    await user.mutation(api.marketing.update, {
      entryId,
      body: "New copy for the send.",
    });
    const doc = await t.run((ctx) => ctx.db.get(entryId));
    expect(doc?.platform).toBe("email");
    expect(doc?.contentType).toBe("Newsletter");
  });
});

// ---------------------------------------------------------------------------
// Assistant proposals write to the planner only after confirmation.
// ---------------------------------------------------------------------------

describe("marketing proposals", () => {
  test("createMarketingEntries adds content under an existing campaign", async () => {
    const { t, user, userId } = await seeded();
    const campaignId = await user.mutation(api.marketing.createCampaign, {
      name: "Newsletter relaunch",
      status: "active",
    });

    const result = await user.mutation(api.proposals.apply, {
      proposal: {
        kind: "createMarketingEntries",
        campaignId,
        campaignLabel: "Newsletter relaunch",
        entries: [
          {
            title: "Welcome email",
            platform: "email",
            contentType: "Newsletter",
            status: "planned",
            scheduledAt: 1_700_000_000_000,
          },
          {
            title: "Teaser post",
            platform: "instagram",
            contentType: "Post",
            status: "draft",
          },
        ],
      },
    });

    expect(result.summary).toContain("2 content items");
    expect(result.route).toBe("/app/marketing");

    const rows = await t.run((ctx) =>
      ctx.db.query("marketingEntries").collect(),
    );
    expect(rows).toHaveLength(2);
    const email = rows.find((r) => r.platform === "email");
    expect(email?.campaignId).toBe(campaignId);
    expect(email?.scheduledAt).toBe(1_700_000_000_000);
    // The owner comes from the session, not from the proposal.
    expect(email?.workspaceMemberId).toBe(userId);
  });

  test("createMarketingEntries rejects an unsupported channel", async () => {
    const { user } = await seeded();
    await expect(
      user.mutation(api.proposals.apply, {
        proposal: {
          kind: "createMarketingEntries",
          entries: [
            {
              title: "Cross-post",
              platform: "twitter",
              contentType: "Post",
              status: "draft",
            },
          ],
        },
      }),
    ).rejects.toThrow("Unsupported platform");
  });

  test("a campaign from another workspace cannot be targeted", async () => {
    const { t, user } = await seeded();
    const otherWorkspace = await t.run(async (ctx) => {
      const stranger = await ctx.db.insert("users", {
        name: "Elsewhere",
        email: "elsewhere@example.com",
      });
      return await ctx.db.insert("campaigns", {
        workspaceId: await ctx.db.insert("workspaces", {
          name: "Other",
          businessType: "general",
          ownerId: stranger,
          modules: [],
          onboardedAt: Date.now(),
          createdAt: Date.now(),
        }),
        name: "Not yours",
        status: "active" as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      user.mutation(api.proposals.apply, {
        proposal: {
          kind: "createMarketingEntries",
          campaignId: otherWorkspace,
          entries: [
            {
              title: "Sneaky",
              platform: "email",
              contentType: "Newsletter",
              status: "draft",
            },
          ],
        },
      }),
    ).rejects.toThrow("Campaign not found in this workspace");
  });

  test("createMarketingCampaign stores the campaign and its items", async () => {
    const { t, user } = await seeded();
    const result = await user.mutation(api.proposals.apply, {
      proposal: {
        kind: "createMarketingCampaign",
        name: "Black Friday",
        objective: "Sales",
        startDate: 1_700_000_000_000,
        endDate: 1_700_500_000_000,
        entries: [
          {
            title: "Early access email",
            platform: "email",
            contentType: "Newsletter",
            status: "planned",
          },
          {
            title: "Countdown reel",
            platform: "tiktok",
            contentType: "Reel",
            status: "draft",
          },
        ],
      },
    });

    expect(result.summary).toBe(
      'Created campaign "Black Friday" with 2 content items.',
    );

    const campaigns = await t.run((ctx) =>
      ctx.db.query("campaigns").collect(),
    );
    expect(campaigns).toHaveLength(1);
    const entries = await t.run((ctx) =>
      ctx.db.query("marketingEntries").collect(),
    );
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.campaignId === campaigns[0]._id)).toBe(true);
  });

  test("createMarketingCampaign rejects a backwards date range", async () => {
    const { user } = await seeded();
    await expect(
      user.mutation(api.proposals.apply, {
        proposal: {
          kind: "createMarketingCampaign",
          name: "Backwards",
          startDate: 20_000,
          endDate: 10_000,
          entries: [],
        },
      }),
    ).rejects.toThrow("The end date can't be before the start date");
  });
});
