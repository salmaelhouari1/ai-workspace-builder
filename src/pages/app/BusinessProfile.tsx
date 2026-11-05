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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  MARKETING_PLATFORMS,
  marketingPlatformLabel,
} from "@/lib/marketing";
import { TYPE_DISPLAY, typeDisplay } from "@/lib/modules";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  Bot,
  Building2,
  Compass,
  Megaphone,
  Palette,
  Settings,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const STAGES = ["Idea", "Getting started", "Running", "Growing"];
const TEAM_SIZES = ["Just me", "2–5", "6–10", "10+"];
const CUSTOMER_TYPES = ["B2C", "B2B", "Both", "Other"];

type ProfileForm = {
  name: string;
  industry: string;
  website: string;
  description: string;
  productsServices: string;
  businessType: string;
  teamSize: string;
  stage: string;
  audienceDescription: string;
  customerNeeds: string;
  targetCustomerType: string;
  brandVoice: string;
  brandColors: string;
  preferredVocabulary: string;
  avoidWords: string;
  brandGuidelines: string;
  mainGoal: string;
  marketingGoals: string;
  marketingPriorities: string;
  preferredPlatforms: string[];
};

const EMPTY_FORM: ProfileForm = {
  name: "",
  industry: "",
  website: "",
  description: "",
  productsServices: "",
  businessType: "general",
  teamSize: "Just me",
  stage: "Getting started",
  audienceDescription: "",
  customerNeeds: "",
  targetCustomerType: "",
  brandVoice: "",
  brandColors: "",
  preferredVocabulary: "",
  avoidWords: "",
  brandGuidelines: "",
  mainGoal: "",
  marketingGoals: "",
  marketingPriorities: "",
  preferredPlatforms: [],
};

/** Fields that count toward the completeness indicator. */
const COMPLETENESS_KEYS: (keyof ProfileForm)[] = [
  "name",
  "industry",
  "website",
  "description",
  "productsServices",
  "audienceDescription",
  "customerNeeds",
  "targetCustomerType",
  "brandVoice",
  "brandColors",
  "preferredVocabulary",
  "avoidWords",
  "brandGuidelines",
  "mainGoal",
  "marketingGoals",
  "preferredPlatforms",
  "marketingPriorities",
];

const SECTIONS = [
  { value: "business", label: "Business", icon: Building2 },
  { value: "audience", label: "Audience", icon: Users },
  { value: "brand", label: "Brand", icon: Palette },
  { value: "marketing", label: "Marketing", icon: Megaphone },
] as const;

/**
 * Business Profile — the single place where the workspace describes itself.
 * Everything here is real workspace data the assistant reads as context;
 * Settings keeps account, team and deletion, so the two never overlap.
 */
export default function BusinessProfile() {
  const navigate = useNavigate();
  const workspace = useQuery(api.workspaces.getForMe);
  const updateWorkspace = useMutation(api.workspaces.update);

  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("business");

  // Sync from the record while the user isn't editing (adjust-state-in-render).
  const [syncedWorkspace, setSyncedWorkspace] = useState(workspace);
  if (workspace !== syncedWorkspace) {
    setSyncedWorkspace(workspace);
    if (workspace && !dirty) {
      setForm({
        name: workspace.name,
        industry: workspace.industry ?? "",
        website: workspace.website ?? "",
        description: workspace.prompt ?? "",
        productsServices: workspace.productsServices ?? "",
        businessType: workspace.businessType,
        teamSize: workspace.teamSize ?? "Just me",
        stage: workspace.stage ?? "Getting started",
        audienceDescription: workspace.audienceDescription ?? "",
        customerNeeds: workspace.customerNeeds ?? "",
        targetCustomerType: workspace.targetCustomerType ?? "",
        brandVoice: workspace.brandVoice ?? "",
        brandColors: (workspace.brandColors ?? []).join(", "),
        preferredVocabulary: workspace.preferredVocabulary ?? "",
        avoidWords: workspace.avoidWords ?? "",
        brandGuidelines: workspace.brandGuidelines ?? "",
        mainGoal: workspace.mainGoal ?? "",
        marketingGoals: workspace.marketingGoals ?? "",
        marketingPriorities: workspace.marketingPriorities ?? "",
        preferredPlatforms: workspace.preferredPlatforms ?? [],
      });
    }
  }

  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const togglePlatform = (platform: string) => {
    set(
      "preferredPlatforms",
      form.preferredPlatforms.includes(platform)
        ? form.preferredPlatforms.filter((p) => p !== platform)
        : [...form.preferredPlatforms, platform],
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkspace({
        name: form.name.trim() || undefined,
        industry: form.industry,
        website: form.website,
        prompt: form.description,
        productsServices: form.productsServices,
        businessType: form.businessType,
        teamSize: form.teamSize,
        stage: form.stage,
        audienceDescription: form.audienceDescription,
        customerNeeds: form.customerNeeds,
        targetCustomerType: form.targetCustomerType,
        brandVoice: form.brandVoice,
        brandColors: form.brandColors
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        preferredVocabulary: form.preferredVocabulary,
        avoidWords: form.avoidWords,
        brandGuidelines: form.brandGuidelines,
        mainGoal: form.mainGoal,
        marketingGoals: form.marketingGoals,
        marketingPriorities: form.marketingPriorities,
        preferredPlatforms: form.preferredPlatforms,
      });
      setDirty(false);
      toast.success("Business profile saved", {
        description: "The assistant will use it in its next answer.",
      });
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

  const filled = COMPLETENESS_KEYS.filter((key) => {
    const value = form[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value.trim());
  }).length;
  const completeness = Math.round(
    (filled / COMPLETENESS_KEYS.length) * 100,
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="size-4 text-primary" />
                Your business context
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Everything saved here is available to the AI Assistant. Empty
                fields are left out — OCIVO won't fill them in for you.
              </p>
            </div>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {completeness}% complete
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.max(completeness, 2)}%` }}
            />
          </div>

          <Tabs value={tab} onValueChange={setTab} className="mt-5">
            <div className="max-w-full overflow-x-auto pb-0.5">
              <TabsList className="w-max">
                {SECTIONS.map((section) => (
                  <TabsTrigger
                    key={section.value}
                    value={section.value}
                    className="gap-1.5"
                  >
                    <section.icon className="size-3.5" />
                    {section.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* ---------------- Business information ---------------- */}
            <TabsContent value="business" className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-name">Business name</Label>
                  <Input
                    id="profile-name"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-industry">Industry</Label>
                  <Input
                    id="profile-industry"
                    value={form.industry}
                    placeholder="e.g. Interior design"
                    onChange={(e) => set("industry", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="profile-website">Website</Label>
                <Input
                  id="profile-website"
                  value={form.website}
                  placeholder="https://…"
                  onChange={(e) => set("website", e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="profile-description">
                  Business description
                </Label>
                <Textarea
                  id="profile-description"
                  rows={4}
                  value={form.description}
                  placeholder="What you do, who you help and what makes you different."
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="profile-products">Products and services</Label>
                <Textarea
                  id="profile-products"
                  rows={3}
                  value={form.productsServices}
                  placeholder="e.g. Brand identity packages, website design, monthly retainers"
                  onChange={(e) => set("productsServices", e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Business type</Label>
                  <Select
                    value={form.businessType}
                    onValueChange={(v) => set("businessType", v)}
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
                    value={form.teamSize}
                    onValueChange={(v) => set("teamSize", v)}
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
                      onClick={() => set("stage", option)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        form.stage === option
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border/80 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ---------------- Target audience ---------------- */}
            <TabsContent value="audience" className="mt-4 space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-audience">Audience description</Label>
                <Textarea
                  id="profile-audience"
                  rows={4}
                  value={form.audienceDescription}
                  placeholder="Who you serve — their role, situation and what they're trying to achieve."
                  onChange={(e) => set("audienceDescription", e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="profile-needs">
                  Customer needs and interests
                </Label>
                <Textarea
                  id="profile-needs"
                  rows={4}
                  value={form.customerNeeds}
                  placeholder="The problems they bring you, questions they ask and topics they care about."
                  onChange={(e) => set("customerNeeds", e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label>Target customer type</Label>
                <Select
                  value={form.targetCustomerType || "unset"}
                  onValueChange={(v) =>
                    set("targetCustomerType", v === "unset" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not set</SelectItem>
                    {CUSTOMER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* ---------------- Brand identity ---------------- */}
            <TabsContent value="brand" className="mt-4 space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-voice">Brand voice and tone</Label>
                <Textarea
                  id="profile-voice"
                  rows={3}
                  value={form.brandVoice}
                  placeholder="e.g. Warm and direct. Confident without jargon. Short sentences."
                  onChange={(e) => set("brandVoice", e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  The assistant uses this whenever it drafts copy for you.
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="profile-colors">Brand colors</Label>
                <Input
                  id="profile-colors"
                  value={form.brandColors}
                  placeholder="Forest green, cream, terracotta"
                  onChange={(e) => set("brandColors", e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Separate colors with commas.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-vocabulary">
                    Preferred vocabulary
                  </Label>
                  <Textarea
                    id="profile-vocabulary"
                    rows={3}
                    value={form.preferredVocabulary}
                    placeholder="Words and phrases that sound like you"
                    onChange={(e) => set("preferredVocabulary", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-avoid">Words to avoid</Label>
                  <Textarea
                    id="profile-avoid"
                    rows={3}
                    value={form.avoidWords}
                    placeholder="Clichés, jargon or claims you never use"
                    onChange={(e) => set("avoidWords", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="profile-guidelines">Brand guidelines</Label>
                <Textarea
                  id="profile-guidelines"
                  rows={4}
                  value={form.brandGuidelines}
                  placeholder="Formatting rules, tone notes, things every caption should include…"
                  onChange={(e) => set("brandGuidelines", e.target.value)}
                />
              </div>
            </TabsContent>

            {/* ---------------- Marketing objectives ---------------- */}
            <TabsContent value="marketing" className="mt-4 space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-goal">Main goal right now</Label>
                <Input
                  id="profile-goal"
                  value={form.mainGoal}
                  placeholder="e.g. Launch the new service in March"
                  onChange={(e) => set("mainGoal", e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="profile-marketing-goals">
                  Main marketing goals
                </Label>
                <Textarea
                  id="profile-marketing-goals"
                  rows={3}
                  value={form.marketingGoals}
                  placeholder="e.g. Book 5 discovery calls a month, grow the newsletter to 500 readers"
                  onChange={(e) => set("marketingGoals", e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label className="flex items-center gap-1.5">
                  <Target className="size-3.5 text-primary" />
                  Preferred social media platforms
                </Label>
                <div className="flex flex-wrap gap-2">
                  {MARKETING_PLATFORMS.map((platform) => {
                    const active = form.preferredPlatforms.includes(platform);
                    return (
                      <button
                        key={platform}
                        type="button"
                        aria-pressed={active}
                        onClick={() => togglePlatform(platform)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/80 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        {marketingPlatformLabel(platform)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Used to suggest where content should go. The planner still
                  supports every channel.
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="profile-priorities">Marketing priorities</Label>
                <Textarea
                  id="profile-priorities"
                  rows={3}
                  value={form.marketingPriorities}
                  placeholder="What matters most over the next few months — and what can wait."
                  onChange={(e) => set("marketingPriorities", e.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">
              {dirty
                ? "Unsaved changes — saving updates the assistant's context."
                : "All changes saved. The assistant reads this profile directly."}
            </p>
            <Button
              onClick={() => void save()}
              disabled={!dirty || saving || !form.name.trim()}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
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
