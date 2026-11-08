import { describe, expect, test } from "vitest";
import {
  buildDeterministicReport,
  buildMetricChanges,
  buildRecommendationSeeds,
  engagementRate,
  percentChange,
  suggestPlannerEntries,
  summarizeFormats,
  type AnalyticsSnapshot,
  type MediaMetric,
} from "../lib/analytics";

const now = Date.UTC(2026, 10, 8);
const DAY = 86_400_000;

function media(
  overrides: Partial<MediaMetric> & Pick<MediaMetric, "id">,
): MediaMetric {
  const { id, ...rest } = overrides;
  return {
    id,
    mediaId: overrides.mediaId ?? id,
    mediaType: "VIDEO",
    mediaProductType: "REELS",
    caption: "Educational reel",
    permalink: null,
    thumbnailUrl: null,
    timestamp: now - DAY,
    likeCount: 10,
    commentsCount: 2,
    reach: 100,
    views: 150,
    saves: 5,
    shares: 1,
    profileVisits: null,
    follows: null,
    interactions: 18,
    marketingEntryId: null,
    marketingEntryTitle: null,
    ...rest,
  };
}

function snapshot(overrides?: Partial<AnalyticsSnapshot>): AnalyticsSnapshot {
  const current = {
    followers: 1200,
    reach: 1000,
    views: 1500,
    interactions: 80,
    accountsEngaged: 70,
    profileVisits: 20,
    follows: 30,
    unfollows: 10,
    followerChange: 20,
    mediaCount: 4,
  };
  const previous = {
    ...current,
    reach: 800,
    views: 1200,
    interactions: 60,
  };
  return {
    workspace: {
      name: "Northlight Studio",
      businessType: "freelance",
      mainGoal: "Book two retainers",
      audience: "Independent brands",
      marketingGoals: "Build a steady pipeline",
      marketingPriorities: "Portfolio first",
      goals: [],
    },
    connection: {
      username: "northlight",
      accountType: "Business",
      lastSyncedAt: now,
      dataFreshnessAt: now,
    },
    period: {
      key: "30d",
      label: "Last 30 days",
      start: now - 30 * DAY,
      end: now,
      metrics: current,
      previous,
      changes: buildMetricChanges(current, previous),
    },
    daily: [
      {
        date: "2026-10-10",
        followers: 1100,
        reach: 100,
        views: null,
        interactions: null,
      },
      {
        date: "2026-11-08",
        followers: 1200,
        reach: 150,
        views: null,
        interactions: null,
      },
    ],
    media: {
      top: [
        media({
          id: "m1",
          caption: "A save-worthy educational reel",
          reach: 900,
          interactions: 60,
          saves: 25,
        }),
      ],
      lowest: [
        media({
          id: "m2",
          caption: "A quiet image post",
          mediaType: "IMAGE",
          mediaProductType: "FEED",
          reach: 50,
          interactions: 3,
        }),
      ],
      formats: [],
      recent: [],
      total: 4,
      unlinked: 2,
    },
    audience: { country: [], age: [], gender: [] },
    dataGaps: [],
    generatedAt: new Date(now).toISOString(),
    ...overrides,
  };
}

describe("deterministic analytics", () => {
  test("missing values stay null instead of becoming zero", () => {
    expect(percentChange(null, 100)).toBeNull();
    expect(percentChange(100, 0)).toBeNull();
    expect(engagementRate(null, 100)).toBeNull();
    expect(engagementRate(10, 0)).toBeNull();
    expect(percentChange(80, 100)).toBeCloseTo(-20);
    expect(engagementRate(20, 100)).toBeCloseTo(20);
  });

  test("period changes distinguish no comparison from a flat period", () => {
    const changes = buildMetricChanges(
      {
        followers: 100,
        reach: 0,
        views: null,
        interactions: null,
        accountsEngaged: null,
        profileVisits: null,
        follows: null,
        unfollows: null,
        followerChange: null,
        mediaCount: 0,
      },
      {
        followers: 100,
        reach: 0,
        views: 50,
        interactions: 2,
        accountsEngaged: null,
        profileVisits: null,
        follows: null,
        unfollows: null,
        followerChange: null,
        mediaCount: 0,
      },
    );
    expect(changes.followers.percent).toBe(0);
    expect(changes.reach.percent).toBeNull();
    expect(changes.views.absolute).toBeNull();
  });

  test("format comparison ignores unmeasured posts but preserves null metrics", () => {
    const formats = summarizeFormats([
      media({ id: "r1", reach: 100, interactions: 10 }),
      media({ id: "r2", reach: 300, interactions: 20 }),
      media({
        id: "p1",
        mediaType: "IMAGE",
        mediaProductType: "FEED",
        reach: null,
        interactions: null,
      }),
    ]);
    const reels = formats.find((format) => format.label === "Reels");
    const posts = formats.find((format) => format.label === "Feed posts");
    expect(reels?.count).toBe(2);
    expect(reels?.avgReach).toBe(200);
    expect(reels?.avgInteractions).toBe(15);
    expect(posts?.avgReach).toBeNull();
    expect(posts?.engagementRate).toBeNull();
  });

  test("recommendations only appear when measured evidence supports them", () => {
    const base = snapshot();
    const formats = summarizeFormats([
      media({ id: "r1", reach: 400, interactions: 30 }),
      media({ id: "r2", reach: 350, interactions: 25 }),
      media({
        id: "p1",
        mediaType: "IMAGE",
        mediaProductType: "FEED",
        reach: 50,
        interactions: 4,
      }),
      media({
        id: "p2",
        mediaType: "IMAGE",
        mediaProductType: "FEED",
        reach: 45,
        interactions: 3,
      }),
    ]);
    const seeds = buildRecommendationSeeds({
      period: base.period,
      media: { formats, total: 4, unlinked: 0 },
      businessGoal: base.workspace.mainGoal,
    });
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds[0].evidence.length).toBeGreaterThan(0);
    expect(seeds[0].potentialBenefit.toLowerCase()).toContain("hypothesis");

    const emptySeeds = buildRecommendationSeeds({
      period: {
        ...base.period,
        metrics: {
          followers: null,
          reach: null,
          views: null,
          interactions: null,
          accountsEngaged: null,
          profileVisits: null,
          follows: null,
          unfollows: null,
          followerChange: null,
          mediaCount: null,
        },
        previous: {
          followers: null,
          reach: null,
          views: null,
          interactions: null,
          accountsEngaged: null,
          profileVisits: null,
          follows: null,
          unfollows: null,
          followerChange: null,
          mediaCount: null,
        },
        changes: buildMetricChanges(
          {
            followers: null,
            reach: null,
            views: null,
            interactions: null,
            accountsEngaged: null,
            profileVisits: null,
            follows: null,
            unfollows: null,
            followerChange: null,
            mediaCount: null,
          },
          {
            followers: null,
            reach: null,
            views: null,
            interactions: null,
            accountsEngaged: null,
            profileVisits: null,
            follows: null,
            unfollows: null,
            followerChange: null,
            mediaCount: null,
          },
        ),
      },
      media: { formats: [], total: 0, unlinked: 0 },
    });
    expect(emptySeeds).toHaveLength(0);
  });

  test("the deterministic report labels missing data and keeps evidence", () => {
    const base = snapshot({
      period: {
        ...snapshot().period,
        metrics: {
          ...snapshot().period.metrics,
          reach: null,
          followers: null,
        },
      },
      dataGaps: ["Reach is unavailable for this period."],
    });
    const report = buildDeterministicReport(base, "weekly");
    expect(report).toContain("**Reach:** Unavailable");
    expect(report).toContain("Reach is unavailable for this period.");
    expect(report).toContain("Evidence:");
    expect(report).toContain("not causation");
    expect(report).not.toContain("Reach: 0");
  });

  test("planner suggestions are explainable and never confirm a link", () => {
    const suggestions = suggestPlannerEntries(
      {
        caption: "Spring collection behind the scenes",
        timestamp: now,
      },
      [
        {
          id: "p1",
          title: "Spring collection behind the scenes",
          platform: "instagram",
          status: "published",
          scheduledAt: now,
          body: "Behind the scenes of the spring shoot.",
        },
        {
          id: "p2",
          title: "Unrelated newsletter",
          platform: "instagram",
          status: "published",
          scheduledAt: now - 20 * DAY,
          body: "Something else entirely.",
        },
      ],
    );
    expect(suggestions[0].id).toBe("p1");
    expect(suggestions[0].reason).toContain("shared");
    expect(suggestions.every((item) => item.score <= 0.95)).toBe(true);
  });
});
