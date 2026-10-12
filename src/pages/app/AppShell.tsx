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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { navEntries, settingsEntry, typeDisplay, type NavEntry } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Home,
  ListChecks,
  FolderKanban,
  Inbox,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

function useSectionTitle(pathname: string): string {
  return useMemo(() => {
    const map: Record<string, string> = {
      "/app": "Home",
      "/app/inbox": "Inbox",
      "/app/tasks": "My Tasks",
      "/app/projects": "Projects",
      "/app/documents": "Documents",
      "/app/goals": "Goals",
      "/app/ai": "AI Assistant",
      "/app/settings": "Settings",
    };
    if (map[pathname]) return map[pathname];
    if (pathname.startsWith("/app/projects/")) return "Project";
    if (pathname.startsWith("/app/documents/")) return "Document";
    return "OCIVO";
  }, [pathname]);
}

function NavItem({
  entry,
  active,
  badge,
  onNavigate,
}: {
  entry: NavEntry;
  active: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const Icon = entry.icon;
  return (
    <Link
      to={entry.to}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-sidebar-accent text-foreground shadow-[inset_2px_0_0_var(--primary)]"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="truncate">{entry.label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
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
  const badges = useQuery(api.workspaces.navBadges);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const title = useSectionTitle(location.pathname);

  const entries = useMemo(() => navEntries(businessType), [businessType]);
  const settings = useMemo(() => settingsEntry(businessType), [businessType]);

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

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const isActive = (to: string) =>
    to === "/app" ? location.pathname === "/app" : location.pathname.startsWith(to);

  const badgeFor = (entry: NavEntry) =>
    entry.badge === "inbox" ? badges?.inbox : entry.badge === "tasks" ? badges?.tasks : undefined;

  const sidebarNav = (
    <nav className="flex flex-col gap-1 px-3">
      {entries.map((entry) => (
        <NavItem
          key={entry.key}
          entry={entry}
          active={isActive(entry.to)}
          badge={badgeFor(entry)}
          onNavigate={() => setMenuOpen(false)}
        />
      ))}
    </nav>
  );

  const userInitial = (user?.name ?? user?.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <BrandMark className="size-8" />
          <div className="min-w-0 leading-tight">
            <Wordmark />
            <div className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {typeDisplay(businessType)}
            </div>
          </div>
        </div>

        <div className="mx-5 mb-3 rounded-xl border border-border/70 bg-card/70 px-3.5 py-2.5">
          <p className="truncate text-sm font-semibold text-foreground">
            {user?.name?.split(" ")[0] ? `${user.name.split(" ")[0]}'s workspace` : "Your workspace"}
          </p>
          <p className="text-xs text-muted-foreground">Built by OCIVO</p>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {sidebarNav}
          <div className="my-3 mx-5 border-t border-border/70" />
          <div className="px-3">
            <NavItem entry={settings} active={isActive(settings.to)} />
          </div>
        </div>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
              {userInitial}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{user?.name ?? "You"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email ?? "Signed in"}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              title="Sign out"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-card/60 px-3 backdrop-blur md:px-6">
          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetHeader className="border-b border-border/70 px-5 py-4">
                <SheetTitle className="flex items-center gap-2.5">
                  <BrandMark className="size-8" />
                  <Wordmark />
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 py-4">
                {sidebarNav}
                <div className="my-2 mx-5 border-t border-border/70" />
                <div className="px-3">
                  <NavItem entry={settings} active={isActive(settings.to)} onNavigate={() => setMenuOpen(false)} />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <span className="font-display text-lg tracking-tight md:hidden">{title}</span>

          {/* Search trigger */}
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="ml-auto hidden items-center gap-2 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent md:flex md:w-72 lg:w-80"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search or run a command</span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
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
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">
                  {user?.name ?? user?.email ?? "Account"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/app/settings")}>
                  <Settings className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/")}>
                  <UserRound className="mr-2 size-4" />
                  Landing page
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

        {/* ---------- Mobile bottom nav (spec §21) ---------- */}
        <nav className="flex shrink-0 border-t border-border/70 bg-card/90 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur md:hidden">
          {[
            { key: "home", label: "Home", to: "/app", icon: Home },
            { key: "tasks", label: "Tasks", to: "/app/tasks", icon: ListChecks },
            { key: "projects", label: "Projects", to: "/app/projects", icon: FolderKanban },
            { key: "inbox", label: "Inbox", to: "/app/inbox", icon: Inbox },
            { key: "ai", label: "AI", to: "/app/ai", icon: Sparkles },
          ].map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            const badge = item.key === "inbox" ? badges?.inbox : undefined;
            return (
              <Link
                key={item.key}
                to={item.to}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {badge !== undefined && badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 size-2 rounded-full bg-ai" />
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
