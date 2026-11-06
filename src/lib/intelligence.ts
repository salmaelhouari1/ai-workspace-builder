import {
  Eye,
  Heart,
  Instagram,
  Linkedin,
  Music2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Intelligence is modelled around normalized sources and metrics, not around
 * one social network. A new provider only needs a connection adapter that
 * returns this shape; the dashboard, reports and recommendations stay shared.
 */
export type IntelligenceSourceId = "instagram" | "linkedin" | "tiktok";

export type SourceAvailability = "available" | "planned";

export interface IntelligenceSourceDefinition {
  id: IntelligenceSourceId;
  label: string;
  description: string;
  icon: LucideIcon;
  availability: SourceAvailability;
}

export const INTELLIGENCE_SOURCES: IntelligenceSourceDefinition[] = [
  {
    id: "instagram",
    label: "Instagram",
    description: "Professional account reach, content and audience insights",
    icon: Instagram,
    availability: "available",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    description: "Company page and post performance",
    icon: Linkedin,
    availability: "planned",
  },
  {
    id: "tiktok",
    label: "TikTok",
    description: "Organic video and audience performance",
    icon: Music2,
    availability: "planned",
  },
];

export type IntelligencePeriodId = "7d" | "30d" | "90d";

export const INTELLIGENCE_PERIODS: {
  id: IntelligencePeriodId;
  label: string;
  shortLabel: string;
}[] = [
  { id: "7d", label: "Last 7 days", shortLabel: "7D" },
  { id: "30d", label: "Last 30 days", shortLabel: "30D" },
  { id: "90d", label: "Last 90 days", shortLabel: "90D" },
];

export interface MetricDefinition {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** Core cross-platform metrics. Provider adapters map their fields into these. */
export const INTELLIGENCE_METRICS: MetricDefinition[] = [
  {
    key: "reach",
    label: "Reach",
    description: "Unique accounts that saw your content in this period",
    icon: Users,
  },
  {
    key: "views",
    label: "Views",
    description: "Times your content was viewed",
    icon: Eye,
  },
  {
    key: "interactions",
    label: "Interactions",
    description: "Likes, comments, saves and shares",
    icon: Heart,
  },
  {
    key: "followerChange",
    label: "Follower change",
    description: "Net new followers during the period",
    icon: UserPlus,
  },
];
