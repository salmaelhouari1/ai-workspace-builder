import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

/** A fresh backend with one workspace and one signed-in owner. */
async function seedWorkspace(t: T) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Nadia",
      email: "nadia@example.com",
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Northlight Studio",
      businessType: "freelance",
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

async function seeded() {
  const t = setup();
  const { userId, workspaceId } = await seedWorkspace(t);
  const user = t.withIdentity({ subject: userId });
  return { t, userId, workspaceId, user };
}

describe("business profile", () => {
  test("saves every section and exposes it to the assistant context", async () => {
    const { t, user, workspaceId } = await seeded();

    await user.mutation(api.workspaces.update, {
      name: "Northlight Studio",
      industry: "Brand photography",
      website: "https://northlight.example",
      prompt: "A two-person studio photographing independent brands.",
      productsServices: "Brand shoots, product photography, monthly retainers.",
      audienceDescription: "Independent fashion and homeware brands.",
      customerNeeds: "Consistent visuals without an in-house photographer.",
      targetCustomerType: "B2B",
      brandVoice: "Warm, direct, never salesy.",
      brandColors: ["Forest green", "Cream"],
      preferredVocabulary: "craft, texture, natural light",
      avoidWords: "hustle, grind, synergy",
      brandGuidelines: "Always credit the stylist. Keep captions under 120 words.",
      marketingGoals: "Book two retainers per quarter.",
      preferredPlatforms: ["instagram", "linkedin", "not-a-platform"],
      marketingPriorities: "Portfolio first, then referrals.",
      mainGoal: "Fill the spring calendar",
    });

    const stored = await t.run((ctx) => ctx.db.get(workspaceId));
    expect(stored?.industry).toBe("Brand photography");
    expect(stored?.brandColors).toEqual(["Forest green", "Cream"]);
    expect(stored?.preferredPlatforms).toEqual(["instagram", "linkedin"]);
    expect(stored?.avoidWords).toBe("hustle, grind, synergy");

    const context = await user.query(api.context.workspaceContext, {});
    expect(context?.workspace.profile).toMatchObject({
      industry: "Brand photography",
      website: "https://northlight.example",
      description: "A two-person studio photographing independent brands.",
      productsServices:
        "Brand shoots, product photography, monthly retainers.",
      audienceDescription: "Independent fashion and homeware brands.",
      customerNeeds:
        "Consistent visuals without an in-house photographer.",
      targetCustomerType: "B2B",
      brandVoice: "Warm, direct, never salesy.",
      brandColors: ["Forest green", "Cream"],
      preferredVocabulary: "craft, texture, natural light",
      avoidWords: "hustle, grind, synergy",
      marketingGoals: "Book two retainers per quarter.",
      preferredPlatforms: ["instagram", "linkedin"],
      marketingPriorities: "Portfolio first, then referrals.",
    });
  });

  test("empty fields clear instead of storing blank strings", async () => {
    const { t, user, workspaceId } = await seeded();
    await user.mutation(api.workspaces.update, { industry: "Design" });
    await user.mutation(api.workspaces.update, { industry: "   " });
    const stored = await t.run((ctx) => ctx.db.get(workspaceId));
    expect(stored?.industry).toBeUndefined();
  });
});

describe("onboarding sample data", () => {
  test("seeded records are marked as samples and stay editable", async () => {
    const t = setup();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { name: "Iris", email: "iris@example.com" }),
    );
    const user = t.withIdentity({ subject: userId });

    const { workspaceId } = await user.mutation(api.workspaces.create, {
      prompt: "I run a small interior design studio with two clients.",
      name: "Iris Interiors",
      mainGoal: "Book three new clients",
    });
    expect(workspaceId).toBeTruthy();

    const projects = await user.query(api.projects.list, {});
    const goals = await user.query(api.goals.list, {});
    const documents = await user.query(api.documents.list, {});
    const tasks = await user.query(api.tasks.list, {});

    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((p) => p.isSample)).toBe(true);
    expect(goals.every((g) => g.isSample)).toBe(true);
    expect(documents.every((d) => d.isSample)).toBe(true);
    expect(tasks.every((task) => task.isSample && task.source === "generated")).toBe(
      true,
    );

    // Generated records are based on the answers given, and remain real rows
    // the user can rename or delete.
    const overview = documents.find((d) => d.category === "Overview");
    expect(overview?.title).toBe("Business overview");
    expect(overview?.content).toContain("Iris Interiors");
    await user.mutation(api.projects.update, {
      projectId: projects[0]._id,
      name: "My renamed project",
    });
    await user.mutation(api.projects.remove, { projectId: projects[0]._id });
    const remaining = await user.query(api.projects.list, {});
    expect(remaining.some((p) => p._id === projects[0]._id)).toBe(false);
  });
});

describe("calendar records", () => {
  test("dated tasks and scheduled posts are the same rows the calendar shows", async () => {
    const { user } = await seeded();
    const dueDate = Date.UTC(2026, 4, 12);

    const taskId = await user.mutation(api.tasks.create, {
      title: "Send the spring proposal",
      dueDate,
      priority: "high",
    });
    const entryId = await user.mutation(api.marketing.create, {
      title: "Spring launch post",
      contentType: "post",
      platform: "instagram",
      body: "Spring is here.",
      status: "planned",
      scheduledAt: dueDate,
    });

    const tasks = await user.query(api.tasks.list, {});
    const entries = await user.query(api.marketing.list, {});

    expect(tasks.find((task) => task._id === taskId)?.dueDate).toBe(dueDate);
    expect(entries.find((entry) => entry._id === entryId)?.scheduledAt).toBe(
      dueDate,
    );

    // A date change updates the one planner record; nothing is duplicated.
    const newDate = Date.UTC(2026, 4, 14);
    await user.mutation(api.marketing.update, {
      entryId,
      scheduledAt: newDate,
    });
    const updated = await user.query(api.marketing.list, {});
    expect(updated.find((entry) => entry._id === entryId)?.scheduledAt).toBe(
      newDate,
    );
    const allTasks = await user.query(api.tasks.list, {});
    expect(
      allTasks.filter((task) => task.title === "Spring launch post"),
    ).toHaveLength(0);
  });
});

describe("documents", () => {
  test("notes persist through create, edit and delete", async () => {
    const { user } = await seeded();
    const documentId = await user.mutation(api.documents.create, {
      title: "Client brief",
      content: "# Brief\n\nFirst draft.",
      category: "Notes",
    });

    await user.mutation(api.documents.update, {
      documentId,
      content: "# Brief\n\nFinal version.",
    });
    const saved = await user.query(api.documents.get, { documentId });
    expect(saved?.content).toContain("Final version.");

    await user.mutation(api.documents.remove, { documentId });
    const afterDelete = await user.query(api.documents.get, { documentId });
    expect(afterDelete).toBeNull();
  });
});

describe("core workspace flows", () => {
  test("projects can be created, edited and deleted", async () => {
    const { user } = await seeded();
    const projectId = await user.mutation(api.projects.create, {
      name: "Website refresh",
      description: "Rebuild the portfolio.",
    });

    let projects = await user.query(api.projects.list, {});
    expect(projects.map((p) => p.name)).toContain("Website refresh");

    await user.mutation(api.projects.update, {
      projectId,
      name: "Website rebuild",
      status: "active",
      deadline: Date.UTC(2026, 5, 1),
    });
    projects = await user.query(api.projects.list, {});
    const edited = projects.find((p) => p._id === projectId);
    expect(edited?.name).toBe("Website rebuild");
    expect(edited?.status).toBe("active");

    await user.mutation(api.projects.remove, { projectId });
    projects = await user.query(api.projects.list, {});
    expect(projects.some((p) => p._id === projectId)).toBe(false);
  });

  test("tasks can be created and completed", async () => {
    const { user } = await seeded();
    const taskId = await user.mutation(api.tasks.create, {
      title: "Send the invoice",
      priority: "high",
    });
    expect((await user.query(api.tasks.list, {}))[0].status).toBe("todo");

    await user.mutation(api.tasks.toggle, { taskId, done: true });
    const completed = (await user.query(api.tasks.list, {})).find(
      (task) => task._id === taskId,
    );
    expect(completed?.status).toBe("done");
    expect(completed?.completedAt).toBeGreaterThan(0);
  });

  test("Quick Capture only creates records after the reviewed entries are confirmed", async () => {
    const { user } = await seeded();
    const itemId = await user.mutation(api.inbox.add, {
      raw: "Call Sam Friday, and she likes dark green.",
    });

    // Capturing alone creates no task or note.
    expect(await user.query(api.tasks.list, {})).toHaveLength(0);
    expect(await user.query(api.documents.list, {})).toHaveLength(0);

    const result = await user.mutation(api.inbox.process, {
      itemId,
      entries: [
        { kind: "task", title: "Call Sam", include: true },
        { kind: "note", title: "Sam likes dark green", include: true },
      ],
    });
    expect(result.createdTasks).toBe(1);
    expect(result.createdNotes).toBe(1);
    expect((await user.query(api.tasks.list, {}))[0].title).toBe("Call Sam");
    expect((await user.query(api.documents.list, {}))[0].title).toBe(
      "Sam likes dark green",
    );

    await expect(
      user.mutation(api.inbox.process, {
        itemId,
        entries: [{ kind: "task", title: "Call Sam again", include: true }],
      }),
    ).rejects.toThrow("already processed");
  });
});

describe("assistant context", () => {
  test("includes projects, tasks, goals, notes and marketing alongside the profile", async () => {
    const { user } = await seeded();
    await user.mutation(api.workspaces.update, {
      industry: "Ceramics",
      brandVoice: "Calm and tactile.",
    });
    const projectId = await user.mutation(api.projects.create, {
      name: "Spring collection",
      description: "Six new pieces for the spring market.",
    });
    await user.mutation(api.tasks.create, {
      title: "Photograph the mugs",
      projectId,
      priority: "medium",
    });
    await user.mutation(api.goals.create, {
      title: "Sell out the first drop",
      target: 100,
      current: 12,
      unit: "%",
    });
    await user.mutation(api.documents.create, {
      title: "Glaze notes",
      content: "Matte oatmeal glaze.",
      category: "Notes",
    });
    await user.mutation(api.marketing.create, {
      title: "Kiln reveal reel",
      contentType: "reel",
      platform: "instagram",
      body: "Behind the kiln.",
      status: "draft",
    });

    const context = await user.query(api.context.workspaceContext, {});
    expect(context?.workspace.profile.industry).toBe("Ceramics");
    expect(context?.workspace.profile.brandVoice).toBe("Calm and tactile.");
    expect(context?.projects.map((p) => p.name)).toContain("Spring collection");
    expect(context?.tasks.map((task) => task.title)).toContain(
      "Photograph the mugs",
    );
    expect(context?.goals.map((g) => g.title)).toContain(
      "Sell out the first drop",
    );
    expect(context?.documents.map((d) => d.title)).toContain("Glaze notes");
    expect(context?.marketing.entries.map((e) => e.title)).toContain(
      "Kiln reveal reel",
    );
  });
});

describe("AI proposals require confirmation", () => {
  test("nothing is written until the confirmed proposal is applied", async () => {
    const { user } = await seeded();
    const before = await user.query(api.tasks.list, {});
    expect(before).toHaveLength(0);

    await user.mutation(api.proposals.apply, {
      proposal: {
        kind: "createTasks",
        tasks: [
          {
            title: "Draft the May newsletter",
            dueDate: Date.UTC(2026, 4, 20),
            priority: "medium",
          },
        ],
      },
    });

    const after = await user.query(api.tasks.list, {});
    expect(after).toHaveLength(1);
    expect(after[0].title).toBe("Draft the May newsletter");
  });
});
