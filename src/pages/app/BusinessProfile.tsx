import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { TYPE_DISPLAY, typeDisplay } from "@/lib/modules";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  Bot,
  Building2,
  Compass,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const STAGES = ["Idea", "Getting started", "Running", "Growing"];
const TEAM_SIZES = ["Just me", "2–5", "6–10", "10+"];

/**
 * Business Profile — the single place where the workspace describes itself.
 * Everything here is real workspace data the assistant reads as context;
 * Settings keeps account, team and deletion, so the two never overlap.
 */
export default function BusinessProfile() {
  const navigate = useNavigate();
  const workspace = useQuery(api.workspaces.getForMe);
  const updateWorkspace = useMutation(api.workspaces.update);

  const [name, setName] = useState("");
  const [mainGoal, setMainGoal] = useState("");
  const [brief, setBrief] = useState("");
  const [businessType, setBusinessType] = useState("general");
  const [teamSize, setTeamSize] = useState("Just me");
  const [stage, setStage] = useState("Getting started");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync from the record while the user isn't editing (adjust-state-in-render).
  const [syncedWorkspace, setSyncedWorkspace] = useState(workspace);
  if (workspace !== syncedWorkspace) {
    setSyncedWorkspace(workspace);
    if (workspace && !dirty) {
      setName(workspace.name);
      setMainGoal(workspace.mainGoal ?? "");
      setBrief(workspace.prompt ?? "");
      setBusinessType(workspace.businessType);
      setTeamSize(workspace.teamSize ?? "Just me");
      setStage(workspace.stage ?? "Getting started");
    }
  }

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkspace({
        name: name.trim() || undefined,
        mainGoal,
        prompt: brief,
        businessType,
        teamSize,
        stage,
      });
      setDirty(false);
      toast.success("Business profile updated");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save the changes");
    } finally {
      setSaving(false);
    }
  };

  if (workspace === undefined) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full" />
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (workspace === null) return null;

  const memberSince = new Date(workspace.createdAt).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-14 pt-6 md:px-8 md:pt-9">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Resources
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight">
            Business profile
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            What OCIVO knows about your business. It shapes the assistant, your
            content plan and how the workspace is organized.
          </p>
        </div>
        <Badge variant="secondary" className="text-[11px]">
          {typeDisplay(workspace.businessType)}
        </Badge>
      </header>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-3">
        {/* Profile form */}
        <section className="rounded-2xl border border-border/70 bg-card p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="size-4 text-primary" />
            The basics
          </h2>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="profile-name">Business name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="profile-goal">Main goal right now</Label>
              <Input
                id="profile-goal"
                value={mainGoal}
                placeholder="e.g. Launch the new service in March"
                onChange={(e) => {
                  setMainGoal(e.target.value);
                  setDirty(true);
                }}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="profile-brief">About your business</Label>
              <Textarea
                id="profile-brief"
                rows={5}
                value={brief}
                placeholder="What you sell, who it's for, how you sound…"
                onChange={(e) => {
                  setBrief(e.target.value);
                  setDirty(true);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                The assistant reads this before answering or drafting.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Business type</Label>
                <Select
                  value={businessType}
                  onValueChange={(v) => {
                    setBusinessType(v);
                    setDirty(true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_DISPLAY).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Team size</Label>
                <Select
                  value={teamSize}
                  onValueChange={(v) => {
                    setTeamSize(v);
                    setDirty(true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_SIZES.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Stage</Label>
              <div className="flex flex-wrap gap-2">
                {STAGES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setStage(option);
                      setDirty(true);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      stage === option
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/80 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
              <p className="text-xs text-muted-foreground">
                Changes feed the assistant's context immediately.
              </p>
              <Button
                onClick={() => void save()}
                disabled={!dirty || saving || !name.trim()}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </section>

        {/* Context cards */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Compass className="size-4 text-primary" />
              At a glance
            </h2>
            <dl className="mt-3 space-y-2.5 text-[13px] text-muted-foreground">
              <div className="flex items-baseline justify-between gap-3">
                <dt>Workspace</dt>
                <dd className="truncate font-medium text-foreground">
                  {workspace.name}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt>Business type</dt>
                <dd className="font-medium text-foreground">
                  {typeDisplay(workspace.businessType)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt>Stage</dt>
                <dd className="font-medium text-foreground">
                  {workspace.stage ?? "Getting started"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt>Team</dt>
                <dd className="font-medium text-foreground">
                  {workspace.teamSize ?? "Just me"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt>Member since</dt>
                <dd className="font-medium text-foreground">{memberSince}</dd>
              </div>
            </dl>
            {workspace.mainGoal && (
              <p className="mt-3 rounded-lg bg-muted/70 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Goal:</span>{" "}
                {workspace.mainGoal}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-ai/30 bg-[color-mix(in_oklab,var(--ai)_5%,var(--card))] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-ai-deep" />
              Put this to work
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              The assistant uses this profile to write in your voice and plan
              content around your goal.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => navigate("/app/ai")}
              >
                <Bot className="size-3.5" />
                Ask the assistant
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => navigate("/app/marketing")}
              >
                Plan content
                <ArrowUpRight className="size-3.5" />
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-primary" />
              People &amp; preferences
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              Invite teammates, manage your account and review the activity log
              in Settings.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 gap-1.5"
              onClick={() => navigate("/app/settings")}
            >
              <Settings className="size-3.5" />
              Open settings
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
