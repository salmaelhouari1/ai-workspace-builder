/**
 * Application navigation.
 *
 * The sidebar is grouped the way the workspace is used: day-to-day work under
 * WORKSPACE, the material you refer back to under RESOURCES, the assistant on
 * its own, and configuration last. Calendar, goals and the inbox stay in the
 * workspace group because they are working tools, not settings.
 */

import {
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
  Home,
  Inbox,
  ListChecks,
  Megaphone,
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
  /** Short description used by the command bar. */
  hint?: string;
  /** Extra paths that should also mark this entry active (e.g. details). */
  matches?: string[];
}

export interface NavGroup {
  key: string;
  label: string;
  entries: NavEntry[];
}

export const ROUTES = {
  overview: "/app",
  marketing: "/app/marketing",
  projects: "/app/projects",
  tasks: "/app/tasks",
  calendar: "/app/calendar",
  goals: "/app/goals",
  inbox: "/app/inbox",
  documents: "/app/documents",
  businessProfile: "/app/business-profile",
  ai: "/app/ai",
  settings: "/app/settings",
} as const;

const ENTRIES: Record<string, NavEntry> = {
  overview: {
    key: "overview",
    label: "Overview",
    to: ROUTES.overview,
    icon: Home,
    hint: "Your workspace at a glance",
  },
  marketing: {
    key: "marketing",
    label: "Marketing Planner",
    to: ROUTES.marketing,
    icon: Megaphone,
    hint: "Content calendar, ideas and campaigns",
  },
  projects: {
    key: "projects",
    label: "Projects",
    to: ROUTES.projects,
    icon: FolderKanban,
    hint: "Client and product work",
    matches: ["/app/projects/"],
  },
  tasks: {
    key: "tasks",
    label: "Tasks",
    to: ROUTES.tasks,
    icon: ListChecks,
    badge: "tasks",
    hint: "Everything on your plate",
  },
  calendar: {
    key: "calendar",
    label: "Calendar",
    to: ROUTES.calendar,
    icon: CalendarDays,
    hint: "Your week across work and content",
  },
  goals: {
    key: "goals",
    label: "Goals",
    to: ROUTES.goals,
    icon: Target,
    hint: "Outcomes you're tracking",
  },
  inbox: {
    key: "inbox",
    label: "Inbox",
    to: ROUTES.inbox,
    icon: Inbox,
    badge: "inbox",
    hint: "Quick captures waiting for review",
  },
  documents: {
    key: "documents",
    label: "Documents & Notes",
    to: ROUTES.documents,
    icon: FileText,
    hint: "Notes, briefs and reference material",
    matches: ["/app/documents/"],
  },
  businessProfile: {
    key: "businessProfile",
    label: "Business Profile",
    to: ROUTES.businessProfile,
    icon: Building2,
    hint: "What OCIVO knows about your business",
  },
  ai: {
    key: "ai",
    label: "AI Assistant",
    to: ROUTES.ai,
    icon: Sparkles,
    hint: "Ask, plan and draft with OCIVO",
  },
  settings: {
    key: "settings",
    label: "Settings",
    to: ROUTES.settings,
    icon: Settings,
    hint: "Account, team and preferences",
  },
};

export function navGroups(): NavGroup[] {
  return [
    {
      key: "workspace",
      label: "Workspace",
      entries: [
        ENTRIES.overview,
        ENTRIES.marketing,
        ENTRIES.projects,
        ENTRIES.tasks,
        ENTRIES.calendar,
        ENTRIES.goals,
        ENTRIES.inbox,
      ],
    },
    {
      key: "resources",
      label: "Resources",
      entries: [ENTRIES.documents, ENTRIES.businessProfile],
    },
    {
      key: "intelligence",
      label: "Intelligence",
      entries: [ENTRIES.ai],
    },
    {
      key: "preferences",
      label: "Preferences",
      entries: [ENTRIES.settings],
    },
  ];
}

/** Flat list for the command bar and route titles. */
export function allNavEntries(): NavEntry[] {
  return navGroups().flatMap((group) => group.entries);
}

/** True when `pathname` belongs to this entry (and not a parent route). */
export function isNavActive(entry: NavEntry, pathname: string): boolean {
  if (entry.to === "/app") return pathname === "/app";
  if (pathname === entry.to || pathname.startsWith(`${entry.to}/`)) return true;
  return (entry.matches ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

/** Route title for the header and document title. */
export function routeTitle(pathname: string): {
  group: string | null;
  title: string;
} {
  for (const group of navGroups()) {
    for (const entry of group.entries) {
      if (isNavActive(entry, pathname)) {
        return { group: group.label, title: entry.label };
      }
    }
  }
  if (pathname.startsWith("/app/projects/")) {
    return { group: "Workspace", title: "Project" };
  }
  if (pathname.startsWith("/app/documents/")) {
    return { group: "Resources", title: "Document" };
  }
  return { group: null, title: "OCIVO" };
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
