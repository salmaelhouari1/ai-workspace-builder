import { CommandBar } from "@/components/CommandBar";
import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import {
  isNavActive,
  navGroups,
  routeTitle,
  typeDisplay,
  type NavEntry,
} from "@/lib/modules";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

const SIDEBAR_KEY = "ocivo.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

function NavItem({
  entry,
  active,
  badge,
  collapsed = false,
  onNavigate,
}: {
  entry: NavEntry;
  active: boolean;
  badge?: number;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = entry.icon;

  if (collapsed) {
    return (
      <Link
        to={entry.to}
        onClick={onNavigate}
        title={entry.label}
        aria-label={entry.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative mx-auto flex size-10 items-center justify-center rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-card text-foreground shadow-[inset_2px_0_0_var(--primary)]"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-foreground",
        )}
      >
        <Icon className="size-[18px]" />
        {badge !== undefined && badge > 0 && (
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
        )}
      </Link>
    );
  }

  return (
    <Link
      to={entry.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-card text-foreground shadow-[inset_2px_0_0_var(--primary)]"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="truncate">{entry.label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
            active
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export default function AppShell({ businessType }: { businessType: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const workspace = useQuery(api.workspaces.getForMe);
  const badges = useQuery(api.workspaces.navBadges);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const { group, title } = routeTitle(location.pathname);
  const groups = navGroups();

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      // Private mode / storage disabled — the preference just won't persist.
    }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The sheet closes from its own onNavigate handlers, so no route effect is
  // needed here (and no effect-driven state update on every navigation).
  const badgeFor = (entry: NavEntry) =>
    entry.badge === "inbox"
      ? badges?.inbox
      : entry.badge === "tasks"
        ? badges?.tasks
        : undefined;

  const userInitial = (user?.name ?? user?.email ?? "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const groupsFor = (collapsedMode: boolean, onNavigate?: () => void) => (
    <nav className="flex flex-col gap-4" aria-label="Main">
      {groups.map((navGroup, index) => (
        <div key={navGroup.key} className="flex flex-col gap-0.5">
          {collapsedMode ? (
            index > 0 && (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
            )
          ) : (
            <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              {navGroup.label}
            </p>
          )}
          {navGroup.entries.map((entry) => (
            <NavItem
              key={entry.key}
              entry={entry}
              active={isNavActive(entry, location.pathname)}
              badge={badgeFor(entry)}
              collapsed={collapsedMode}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="app-shell flex h-dvh overflow-hidden bg-background">
      {/* ---------- Desktop sidebar ---------- */}
      <aside
        className={cn(
          "no-print hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-[72px]" : "w-[264px]",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center gap-2.5 border-b border-sidebar-border/70",
            collapsed ? "justify-center px-2" : "px-4",
          )}
        >
          <Link
            to="/app"
            aria-label="OCIVO overview"
            className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark className="size-8 shrink-0" />
            {!collapsed && <Wordmark />}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-4">
          {!collapsed && (
            <div className="mb-4 rounded-xl border border-sidebar-border/80 bg-background/40 px-3 py-2.5">
              <p className="truncate text-[13px] font-semibold leading-tight">
                {workspace?.name ?? "Your workspace"}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {typeDisplay(businessType)} workspace
              </p>
            </div>
          )}
          {groupsFor(collapsed)}
        </div>

        <div className="border-t border-sidebar-border p-2.5">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="size-4" />
              </button>
              <Link
                to="/app/settings"
                className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary"
                aria-label="Account settings"
                title={user?.name ?? "Account"}
              >
                {userInitial}
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
                {userInitial}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-medium">
                  {user?.name ?? "You"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {user?.email ?? "Signed in"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                title="Sign out"
                aria-label="Sign out"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/70 px-3 backdrop-blur md:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] bg-sidebar p-0">
              <SheetHeader className="border-b border-sidebar-border/70 px-4 py-4">
                <SheetTitle className="flex items-center gap-2.5 text-left">
                  <BrandMark className="size-8" />
                  <span className="min-w-0">
                    <Wordmark />
                    <span className="block truncate text-[11px] font-normal text-muted-foreground">
                      {workspace?.name ?? "Your workspace"}
                    </span>
                  </span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-2.5 py-4">
                {groupsFor(false, () => setMenuOpen(false))}
              </div>
              <div className="border-t border-sidebar-border/70 p-3">
                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    await signOut();
                    navigate("/");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Breadcrumb (desktop) / page title (mobile) */}
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            {group && (
              <>
                <span className="hidden text-muted-foreground md:inline">
                  {group}
                </span>
                <ChevronRight className="hidden size-3.5 text-muted-foreground/50 md:inline" />
              </>
            )}
            <span className="truncate font-medium">{title}</span>
          </div>

          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="ml-auto hidden items-center gap-2 rounded-lg border border-border/80 bg-card/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card md:flex md:w-64 lg:w-80"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search or run a command</span>
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5 md:ml-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Search"
              onClick={() => setCmdOpen(true)}
            >
              <Search className="size-5" />
            </Button>
            <Button
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => navigate("/app/ai")}
            >
              <Sparkles className="size-4" />
              <span className="hidden sm:inline">Ask OCIVO</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex size-8 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Account menu"
                >
                  {userInitial}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  {user?.name ?? user?.email ?? "Account"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/app/business-profile")}
                >
                  <UserRound className="mr-2 size-4" />
                  Business profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/settings")}>
                  <Settings className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    await signOut();
                    navigate("/");
                  }}
                >
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {/* ---------- Mobile bottom nav ---------- */}
        <nav className="no-print flex shrink-0 border-t border-border/70 bg-card/90 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur md:hidden">
          {[
            { key: "overview", label: "Overview", to: "/app" },
            { key: "marketing", label: "Planner", to: "/app/marketing" },
            { key: "tasks", label: "Tasks", to: "/app/tasks" },
            { key: "projects", label: "Projects", to: "/app/projects" },
            { key: "ai", label: "AI", to: "/app/ai" },
          ].map((item) => {
            const entry = groups
              .flatMap((g) => g.entries)
              .find((e) => e.key === item.key);
            if (!entry) return null;
            const active = isNavActive(entry, location.pathname);
            const Icon = entry.icon;
            const badge =
              item.key === "tasks"
                ? badges?.tasks
                : item.key === "inbox"
                  ? badges?.inbox
                  : undefined;
            return (
              <Link
                key={item.key}
                to={item.to}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10.5px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {badge !== undefined && badge > 0 && (
                    <span className="absolute -right-2 -top-1 size-2 rounded-full bg-ai" />
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <CommandBar open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
