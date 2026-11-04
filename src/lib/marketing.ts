/**
 * Marketing Planner channels — one source of truth for the backend
 * validation, the planner dropdowns/labels and the assistant.
 *
 * A channel is a *planning* label only: OCIVO never publishes content or
 * sends email from here.
 */
export const MARKETING_PLATFORMS = [
  "instagram",
  "tiktok",
  "linkedin",
  "facebook",
  "pinterest",
  "email",
  "other",
] as const;

export type MarketingPlatform = (typeof MARKETING_PLATFORMS)[number];

export const MARKETING_PLATFORM_LABEL: Record<MarketingPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  pinterest: "Pinterest",
  email: "Email",
  other: "Other",
};

export function isMarketingPlatform(value: string): value is MarketingPlatform {
  return (MARKETING_PLATFORMS as readonly string[]).includes(value);
}

/** Trim + lower-case a channel and reject anything the planner can't store. */
export function requireMarketingPlatform(raw: string): MarketingPlatform {
  const key = raw.trim().toLowerCase();
  if (!isMarketingPlatform(key)) throw new Error("Unsupported platform");
  return key;
}

/** Display label for any stored channel value (tolerating legacy rows). */
export function marketingPlatformLabel(platform: string): string {
  return isMarketingPlatform(platform)
    ? MARKETING_PLATFORM_LABEL[platform]
    : platform.charAt(0).toUpperCase() + platform.slice(1);
}
