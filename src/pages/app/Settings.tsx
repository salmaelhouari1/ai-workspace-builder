import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { typeDisplay } from "@/lib/modules";
import { CookieSettingsLink } from "@/components/CookieConsent";
import { InstagramConnection } from "@/components/InstagramConnection";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bot,
  Building2,
  LogOut,
  ShieldAlert,
  Sparkles,
  UserRound,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * Self-service account deletion (described on /data-deletion).
 *
 * Owners delete the entire workspace; non-owner members leave the workspace
 * and delete their own account. Both flows go through the same hard cascade
 * mutation — there is no export step before deletion.
 */
function DangerZone({ workspaceName }: { workspaceName: string }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const deleteMe = useMutation(api.account.deleteMe);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const deleteAccount = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteMe({ confirmName: confirmText });
      toast.success("Account deleted", {
        description: "Your data was removed permanently. Goodbye.",
      });
      await signOut();
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg.replace(/^.*Error:\s*/, "") || "Couldn't delete the account",
      );
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 rounded-2xl border border-destructive/30 bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <ShieldAlert className="size-4" />
        Danger zone
      </h2>
      {open ? (
        <div className="mt-4">
          <p className="text-sm leading-relaxed">
            This permanently deletes{" "}
            <strong>{workspaceName}</strong> and every project, task, goal,
            document, inbox entry, marketing plan, AI conversation, connected
            integration token, analytics record and report in it — plus your
            account and sign-in records. This cannot be undone, and there is no
            export step.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Type the workspace name to confirm:
          </p>
          <Input
            className="mt-2"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={workspaceName}
            autoComplete="off"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || confirmText.trim() !== workspaceName}
              onClick={() => void deleteAccount()}
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setOpen(false);
                setConfirmText("");
              }}
              disabled={busy}
            >
              Keep my account
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-snug text-muted-foreground">
            Delete your account and everything in this workspace. Details on
            the{" "}
            <a
              href="/data-deletion"
              className="underline hover:text-foreground"
            >
              Data Deletion page
            </a>
            .
          </p>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:text-destructive"
            onClick={() => setOpen(true)}
          >
            Delete account…
          </Button>
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const workspace = useQuery(api.workspaces.getForMe);
  const activity = useQuery(api.activity.recent);
  const team = useQuery(api.team.list);
  const addTeamMember = useMutation(api.team.add);
  const removeTeamMember = useMutation(api.team.remove);

  const [emailDraft, setEmailDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const submitMember = async () => {
    const email = emailDraft.trim();
    if (!email || adding) return;
    setAdding(true);
    try {
      await addTeamMember({ email });
      setEmailDraft("");
      toast.success("Added to your team", {
        description: `${email} can now be assigned tasks.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg.replace(/^.*Error:\s*/, "") || "Couldn't add that person",
      );
    } finally {
      setAdding(false);
    }
  };

  if (workspace === undefined || workspace === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-6 h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-12 pt-8 md:px-8">
      <header>
        <h1 className="font-display text-3xl tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Small on purpose — your time is for working, not configuring.
        </p>
      </header>

      {/* The profile itself lives on its own page — one source of truth. */}
      <section className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4 text-primary" />
          Business profile
          <Badge
            variant="secondary"
            className="ml-auto text-[10px] font-medium"
          >
            {typeDisplay(workspace.businessType)}
          </Badge>
        </h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{workspace.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {workspace.mainGoal ?? "No main goal set yet"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate("/app/business-profile")}
          >
            <Building2 className="size-3.5" />
            Edit business profile
          </Button>
        </div>
      </section>

      {/* Integrations — official Instagram read-only connection */}
      <InstagramConnection className="mt-5" />

      {/* Team */}
      <section className="mt-5 rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" />
          Team
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            add emails · assign tasks to them
          </span>
        </h2>

        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submitMember();
          }}
        >
          <Input
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="teammate@company.com"
            className="h-9 min-w-[200px] flex-1"
          />
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!emailDraft.trim() || adding}
          >
            <UserPlus className="size-3.5" />
            {adding ? "Adding…" : "Add"}
          </Button>
        </form>

        {team === undefined ? (
          <div className="mt-3">
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : team.length <= 1 ? (
          <p className="mt-3 rounded-xl border border-dashed px-3.5 py-4 text-center text-sm text-muted-foreground">
            Just you so far. Add a teammate’s email above to start assigning
            tasks to them.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {team.map((person) => (
              <li
                key={person.email}
                className="flex items-center gap-3 rounded-xl border border-border/60 px-3.5 py-2.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
                  {(person.name ?? person.email).trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium">
                    {person.name ?? person.email}
                  </p>
                  {person.name && (
                    <p className="truncate text-xs text-muted-foreground">
                      {person.email}
                    </p>
                  )}
                </div>
                {person.role === "owner" ? (
                  <Badge variant="secondary" className="text-[10px]">
                    You
                  </Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${person.email}`}
                    onClick={() => {
                      if (!person.teamMemberId) return;
                      void removeTeamMember({
                        teamMemberId: person.teamMemberId,
                      }).then(
                        () => toast.success(`${person.email} removed`),
                        () => toast.error("Couldn't remove them"),
                      );
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Account */}
      <section className="mt-5 rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserRound className="size-4 text-primary" />
          Account
        </h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {user?.name ?? "Signed in"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email ?? "Session"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </section>

      {/* Danger zone — self-service account + workspace deletion */}
      <DangerZone workspaceName={workspace.name} />

      {/* Activity */}
      <section className="mt-5 rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-primary" />
          Activity log
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            every AI change is recorded
          </span>
        </h2>
        <div className="mt-3 space-y-2">
          {activity === undefined ? (
            <>
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </>
          ) : activity.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing yet — changes will appear here.
            </p>
          ) : (
            <ul className="space-y-2">
              {activity.map((entry) => (
                <li
                  key={entry._id}
                  className="flex items-start gap-3 rounded-xl border border-border/60 px-3.5 py-2.5"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                      entry.actor === "ai"
                        ? "bg-ai/15 text-ai-deep"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {entry.actor === "ai" ? (
                      <Sparkles className="size-3.5" />
                    ) : (
                      <UserRound className="size-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{entry.detail}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {entry.actor === "ai" ? "OCIVO" : "You"} ·{" "}
                      {new Date(entry.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

<footer className="mt-5">
      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Bot className="size-3.5" />
        OCIVO — your workspace builds itself.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <a href="/privacy" className="hover:text-foreground">Privacy Policy</a>
        <a href="/terms" className="hover:text-foreground">Terms</a>
        <a href="/cookies" className="hover:text-foreground">Cookie Policy</a>
        <a href="/acceptable-use" className="hover:text-foreground">Acceptable Use</a>
        <a href="/ai-disclaimer" className="hover:text-foreground">AI Disclaimer</a>
        <a href="/data-deletion" className="hover:text-foreground">Data Deletion</a>
        <CookieSettingsLink className="hover:text-foreground" />
      </div>
    </footer>
    </div>
  );
}
