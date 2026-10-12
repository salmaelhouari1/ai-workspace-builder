/**
 * Adaptive navigation (spec §5): the sidebar reflects what the user's
 * business actually is. A freelancer sees client-oriented labels, a creator
 * sees content-oriented labels — same MVP modules, different lens.
 */

import {
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
  projects: "Projects",
  documents: "Documents",
  goals: "Goals",
  ai: "AI Assistant",
  settings: "Settings",
};

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  inbox: Inbox,
  tasks: ListChecks,
  projects: FolderKanban,
  documents: FileText,
  goals: Target,
  ai: Sparkles,
  settings: Settings,
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

const ORDER = ["home", "inbox", "tasks", "projects", "documents", "goals", "ai"];

const ROUTES: Record<string, string> = {
  home: "/app",
  inbox: "/app/inbox",
  tasks: "/app/tasks",
  projects: "/app/projects",
  documents: "/app/documents",
  goals: "/app/goals",
  ai: "/app/ai",
  settings: "/app/settings",
};

export function navEntries(businessType?: string): NavEntry[] {
  const overrides = TYPE_LABELS[businessType ?? "general"] ?? {};
  return ORDER.map((key) => ({
    key,
    label: overrides[key] ?? DEFAULT_LABELS[key],
    to: ROUTES[key],
    icon: ICONS[key],
    badge: BADGES[key],
  }));
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
