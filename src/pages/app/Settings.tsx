import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { TYPE_DISPLAY, typeDisplay } from "@/lib/modules";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bot,
  Building2,
  LogOut,
  Sparkles,
  UserRound,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const workspace = useQuery(api.workspaces.getForMe);
  const activity = useQuery(api.activity.recent);
  const updateWorkspace = useMutation(api.workspaces.update);
  const team = useQuery(api.team.list);
  const addTeamMember = useMutation(api.team.add);
  const removeTeamMember = useMutation(api.team.remove);

  const [name, setName] = useState("");
  const [mainGoal, setMainGoal] = useState("");
  const [businessType, setBusinessType] = useState("general");
  const [teamSize, setTeamSize] = useState("Just me");
  const [stage, setStage] = useState("Getting started");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (workspace && !dirty) {
      setName(workspace.name);
      setMainGoal(workspace.mainGoal ?? "");
      setBusinessType(workspace.businessType);
      setTeamSize(workspace.teamSize ?? "Just me");
      setStage(workspace.stage ?? "Getting started");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkspace({
        name: name.trim() || undefined,
        mainGoal,
        businessType,
        teamSize,
        stage,
      });
      setDirty(false);
      toast.success("Workspace updated");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save the changes");
    } finally {
      setSaving(false);
    }
  };

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

      {/* Workspace */}
      <section className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4 text-primary" />
          Workspace
          <Badge
            variant="secondary"
            className="ml-auto text-[10px] font-medium"
          >
            {typeDisplay(workspace.businessType)}
          </Badge>
        </h2>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ws-goal">Main goal</Label>
            <Input
              id="ws-goal"
              value={mainGoal}
              placeholder="e.g. Launch next month"
              onChange={(e) => {
                setMainGoal(e.target.value);
                setDirty(true);
              }}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Business type</Label>
              <select
                value={businessType}
                onChange={(e) => {
                  setBusinessType(e.target.value);
                  setDirty(true);
                }}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                {Object.entries(TYPE_DISPLAY).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Team size</Label>
              <select
                value={teamSize}
                onChange={(e) => {
                  setTeamSize(e.target.value);
                  setDirty(true);
                }}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                {["Just me", "2–5", "6–10", "10+"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Stage</Label>
            <div className="flex flex-wrap gap-2">
              {["Idea", "Getting started", "Running", "Growing"].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStage(s);
                    setDirty(true);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    stage === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/80 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || saving || !name.trim()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </section>

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

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Bot className="size-3.5" />
        OCIVO — your workspace builds itself.
      </p>
    </div>
  );
}
