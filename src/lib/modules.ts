/**
 * Adaptive navigation (spec §5): the sidebar reflects what the user's
 * business actually is. A freelancer sees client-oriented labels, a creator
 * sees content-oriented labels — same MVP modules, different lens.
 */

import {
  CalendarDays,
  FileText,
  FolderKanban,
  Home,
  Inbox,
  ListChecks,
  Settings,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

export interface NavEntry {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: "inbox" | "tasks";
}

const DEFAULT_LABELS: Record<string, string> = {
  home: "Home",
  inbox: "Inbox",
  tasks: "My Tasks",
  calendar: "Calendar",
  projects: "Projects",
  documents: "Documents",
  goals: "Goals",
  ai: "AI Assistant",
  marketing: "Marketing Planner",
  settings: "Settings",
};

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  inbox: Inbox,
  tasks: ListChecks,
  calendar: CalendarDays,
  projects: FolderKanban,
  documents: FileText,
  goals: Target,
  ai: Sparkles,
  marketing: Target,
  settings: Settings,
};

/** Always-on module entries (override the business-type labels for this key). */
const MARKETING_LABELS: Record<string, string> = {
  marketing: "Marketing Planner",
};

const MARKETING_ICONS: Record<string, LucideIcon> = {
  marketing: Target,
};

const MARKETING_ROUTES: Record<string, string> = {
  marketing: "/app/marketing",
};

const BADGES: Record<string, "inbox" | "tasks"> = {
  inbox: "inbox",
  tasks: "tasks",
};

const TYPE_LABELS: Record<string, Record<string, string>> = {
  freelance: {
    tasks: "Tasks",
    projects: "Client work",
    documents: "Docs & proposals",
    goals: "Targets",
  },
  ecommerce: {
    documents: "Catalog & notes",
    goals: "Revenue goals",
  },
  saas: {
    documents: "Specs & notes",
    tasks: "Tasks",
  },
  creator: {
    documents: "Content",
    projects: "Content & collabs",
    goals: "Audience goals",
  },
  agency: {
    projects: "Client work",
    documents: "Client docs",
    tasks: "Tasks",
  },
  general: {},
};

const ORDER = [
  "home",
  "inbox",
  "tasks",
  "calendar",
  "projects",
  "documents",
  "goals",
  "ai",
  "marketing",
];

const ROUTES: Record<string, string> = {
  home: "/app",
  inbox: "/app/inbox",
  tasks: "/app/tasks",
  calendar: "/app/calendar",
  projects: "/app/projects",
  documents: "/app/documents",
  goals: "/app/goals",
  ai: "/app/ai",
  marketing: "/app/marketing",
  settings: "/app/settings",
};

/** Always-on module entries — they override the business-type labels. */
/** Always-on module entries — they override the business-type labels. */
export function navEntries(businessType?: string): NavEntry[] {
  const overrides = TYPE_LABELS[businessType ?? "general"] ?? {};
  const result = ORDER.map((key) => ({
    key,
    label: overrides[key] ?? DEFAULT_LABELS[key],
    to: ROUTES[key],
    icon: ICONS[key],
    badge: BADGES[key],
  }));
  // The Marketing Planner module is always on — add it if it's not already there.
  if (!result.some((e) => e.key === "marketing")) {
    result.push({
      key: "marketing",
      label: "Marketing Planner",
      to: "/app/marketing",
      icon: Target,
      badge: undefined as any,
    });
  }
  return result;
}

export function settingsEntry(businessType?: string): NavEntry {
  const overrides = TYPE_LABELS[businessType ?? "general"] ?? {};
  return {
    key: "settings",
    label: overrides.settings ?? DEFAULT_LABELS.settings,
    to: ROUTES.settings,
    icon: ICONS.settings,
  };
}

export const TYPE_DISPLAY: Record<string, string> = {
  freelance: "Freelancer",
  ecommerce: "E-commerce",
  saas: "SaaS / startup",
  creator: "Creator",
  agency: "Agency",
  general: "Business",
};

export function typeDisplay(businessType?: string): string {
  return TYPE_DISPLAY[businessType ?? "general"] ?? "Business";
}
