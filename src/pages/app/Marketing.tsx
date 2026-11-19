import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  MARKETING_PLATFORMS,
  marketingPlatformLabel,
} from "@/lib/marketing";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Film,
  ImageIcon,
  Lightbulb,
  Megaphone,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocation, useSearchParams } from "react-router";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const STATUSES = [
  "idea",
  "draft",
  "planned",
  "readyToPublish",
  "published",
] as const;
type Status = (typeof STATUSES)[number];

// The stored value stays `planned`; the workspace language is "Scheduled".
const STATUS_LABEL: Record<Status, string> = {
  idea: "Idea",
  draft: "Draft",
  planned: "Scheduled",
  readyToPublish: "Ready to publish",
  published: "Published",
};

const STATUS_CLASS: Record<Status, string> = {
  idea: "bg-muted text-muted-foreground",
  draft: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  planned: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  readyToPublish: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  published: "bg-primary/15 text-primary",
};

const PLATFORMS = MARKETING_PLATFORMS;

const CAMPAIGN_STATUSES = [
  "active",
  "paused",
  "completed",
  "archived",
] as const;
type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

const TONES = [
  "Professional",
  "Friendly",
  "Bold",
  "Playful",
  "Educational",
  "Inspirational",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Entry = Omit<Doc<"marketingEntries">, "scheduledAt"> & {
  scheduledAt: number | null;
  campaignName: string | null;
};
type ScheduledEntry = Entry & { scheduledAt: number };
type Idea = Omit<Doc<"marketingIdeas">, "convertedTo"> & {
  convertedTo: Id<"marketingEntries"> | null;
};
type Campaign = Doc<"campaigns"> & {
  entryCount: number;
  draftCount: number;
  plannedCount: number;
  readyCount: number;
  publishedCount: number;
  ideaCount: number;
  entryIds: Id<"marketingEntries">[];
};

const platformLabel = marketingPlatformLabel;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Epoch ms → value for <input type="datetime-local"> (local time). */
function toLocalInput(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): number | undefined {
  if (!v) return undefined;
  const ts = new Date(v).getTime();
  return Number.isNaN(ts) ? undefined : ts;
}

function formatDateInput(v: string): number | undefined {
  if (!v) return undefined;
  const ts = new Date(`${v}T00:00:00`).getTime();
  return Number.isNaN(ts) ? undefined : ts;
}

function formatWhen(ts?: number | null): string {
  if (!ts) return "Unscheduled";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayRange(a?: number | null, b?: number | null): string {
  const f = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  if (a && b) return `${f(a)} → ${f(b)}`;
  if (a) return `from ${f(a)}`;
  if (b) return `until ${f(b)}`;
  return "No dates set";
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type Attachment = {
  storageId: Id<"_storage">;
  name: string;
  contentType: string;
};

const MAX_ATTACHMENTS = 6;

/** Open an attachment preview, then download the original file. */
function AttachmentThumb({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove?: () => void;
}) {
  const url = useQuery(api.marketing.attachmentUrl, {
    storageId: attachment.storageId,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const isImage = attachment.contentType.startsWith("image/");
  const isVideo = attachment.contentType.startsWith("video/");
  const kindLabel = isImage ? "Image" : isVideo ? "Video" : "File";

  const downloadFile = async () => {
    if (!url || downloading) return;
    setDownloading(true);
    try {
      // Fetching first lets us keep the original filename on cross-origin
      // storage URLs, where the download attribute alone is ignored.
      const response = await fetch(url);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = attachment.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      // Storage may not expose the bytes to fetch(). The browser can still
      // open the signed URL so the user can save it from the new tab.
      window.open(url, "_blank", "noopener,noreferrer");
      toast.info("Opened the original file — save it from your browser");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="group relative overflow-hidden rounded-lg border border-border/70 bg-background">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          disabled={!url}
          aria-label={`Preview ${attachment.name}`}
          className="block h-16 w-24 cursor-zoom-in disabled:cursor-wait"
        >
          {url && isImage ? (
            <img
              src={url}
              alt={attachment.name}
              className="h-16 w-24 object-cover"
            />
          ) : (
            <div className="flex h-16 w-24 flex-col items-center justify-center gap-1 px-1 text-muted-foreground">
              {isImage ? (
                <ImageIcon className="size-4" />
              ) : (
                <Film className="size-4" />
              )}
              <span className="w-full truncate text-center text-[9px]">
                {attachment.name}
              </span>
            </div>
          )}
          {url && (
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 text-background opacity-0 transition-colors group-hover:bg-foreground/30 group-hover:opacity-100">
              <Eye className="size-5 drop-shadow" />
            </span>
          )}
        </button>
        {url && (
          <button
            type="button"
            onClick={() => void downloadFile()}
            disabled={downloading}
            aria-label={`Download ${attachment.name}`}
            title="Download"
            className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-all hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Download className="size-3" />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${attachment.name}`}
            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">
              {attachment.name}
            </DialogTitle>
            <DialogDescription>
              {kindLabel} attachment · stored in OCIVO, never published
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/30">
            {url && isImage ? (
              <img
                src={url}
                alt={attachment.name}
                className="max-h-[65vh] w-full object-contain"
              />
            ) : url && isVideo ? (
              <video
                src={url}
                controls
                playsInline
                className="max-h-[65vh] w-full bg-black"
              >
                Your browser cannot play this video.
              </video>
            ) : (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
                <Film className="size-8" />
                <p className="text-sm">
                  {url
                    ? "This file type can be downloaded but not previewed here."
                    : "Preparing your file…"}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            {url ? (
              <Button variant="outline" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Open original
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <ExternalLink className="size-4" />
                Open original
              </Button>
            )}
            <Button onClick={() => void downloadFile()} disabled={!url || downloading}>
              <Download className="size-4" />
              {downloading ? "Downloading…" : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function errMsg(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  const idx = raw.lastIndexOf("Error: ");
  const msg = idx >= 0 ? raw.slice(idx + 7) : raw;
  return msg.split("\n")[0].trim().slice(0, 180) || fallback;
}

// ---------------------------------------------------------------------------
// Dialog drafts
// ---------------------------------------------------------------------------

interface EntryDraft {
  id?: string;
  title: string;
  platform: string;
  contentType: string;
  body: string;
  hook: string;
  callToAction: string;
  creativeBrief: string;
  status: Status;
  scheduledAt: string;
  campaignId: string;
  pillar: string;
  tags: string;
  audience: string;
  attachments: Attachment[];
}

const EMPTY_ENTRY: EntryDraft = {
  title: "",
  platform: "instagram",
  contentType: "Post",
  body: "",
  hook: "",
  callToAction: "",
  creativeBrief: "",
  status: "draft",
  scheduledAt: "",
  campaignId: "",
  pillar: "",
  tags: "",
  audience: "",
  attachments: [],
};

interface IdeaDraft {
  id?: string;
  title: string;
  description: string;
  contentType: string;
  platform: string;
  pillar: string;
  campaignId: string;
  tags: string;
}

const EMPTY_IDEA: IdeaDraft = {
  title: "",
  description: "",
  contentType: "Post",
  platform: "instagram",
  pillar: "",
  campaignId: "",
  tags: "",
};

interface CampaignDraft {
  id?: string;
  name: string;
  objective: string;
  audience: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  notes: string;
  goalId: string;
  projectId: string;
}

const EMPTY_CAMPAIGN: CampaignDraft = {
  name: "",
  objective: "",
  audience: "",
  startDate: "",
  endDate: "",
  status: "active",
  notes: "",
  goalId: "",
  projectId: "",
};

type Tab = "calendar" | "ideas" | "content" | "campaigns";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Marketing() {
  const entries = useQuery(api.marketing.list);
  const ideas = useQuery(api.marketing.listIdeas);
  const campaigns = useQuery(api.marketing.listCampaigns);
  const projects = useQuery(api.projects.list);
  const goals = useQuery(api.goals.list);

  const createEntry = useMutation(api.marketing.create);
  const updateEntry = useMutation(api.marketing.update);
  const removeEntry = useMutation(api.marketing.remove);
  const createIdea = useMutation(api.marketing.createIdea);
  const updateIdea = useMutation(api.marketing.updateIdea);
  const removeIdea = useMutation(api.marketing.removeIdea);
  const convertIdea = useMutation(api.marketing.convertIdea);
  const createCampaign = useMutation(api.marketing.createCampaign);
  const updateCampaign = useMutation(api.marketing.updateCampaign);
  const removeCampaign = useMutation(api.marketing.removeCampaign);
  const generate = useAction(api.assistant.chat);
  const generateUploadUrl = useMutation(api.marketing.generateUploadUrl);
  const registerUpload = useMutation(api.marketing.registerUpload);

  const [tab, setTab] = useState<Tab>("calendar");
  const [filters, setFilters] = useState({
    platform: "all",
    status: "all",
    campaign: "all",
    search: "",
  });

  const [entryOpen, setEntryOpen] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(EMPTY_ENTRY);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [tone, setTone] = useState("Professional");

  const [ideaOpen, setIdeaOpen] = useState(false);
  const [ideaDraft, setIdeaDraft] = useState<IdeaDraft>(EMPTY_IDEA);

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignDraft, setCampaignDraft] =
    useState<CampaignDraft>(EMPTY_CAMPAIGN);

  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "entry" | "idea" | "campaign";
    id: string;
    label: string;
  } | null>(null);

  const [calView, setCalView] = useState<"month" | "week" | "list">("month");
  const [uploading, setUploading] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [weekAnchor, setWeekAnchor] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  // Deep link from the Overview quick actions: /app/marketing?new=post.
  // Keyed by navigation so the same link opens the dialog on every visit.
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const newParam = searchParams.get("new");
  const [handledNewFor, setHandledNewFor] = useState<string | null>(null);
  if (newParam === "post" && handledNewFor !== location.key) {
    setHandledNewFor(location.key);
    setEntryDraft({ ...EMPTY_ENTRY });
    setEntryOpen(true);
  }
  useEffect(() => {
    if (newParam === null) return;
    const params = new URLSearchParams(searchParams);
    params.delete("new");
    setSearchParams(params, { replace: true });
  }, [newParam, searchParams, setSearchParams]);

  // -- Derived ---------------------------------------------------------------

  const filteredEntries = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) =>
        (filters.platform === "all" || e.platform === filters.platform) &&
        (filters.status === "all" || e.status === filters.status) &&                (filters.campaign === "all" ||
                  (filters.campaign === "none"
                    ? !e.campaignId
                    : e.campaignId === filters.campaign)) &&
        (!q ||
          e.title.toLowerCase().includes(q) ||
          e.body.toLowerCase().includes(q) ||
          (e.pillar ?? "").toLowerCase().includes(q)),
    );
  }, [entries, filters]);

  const filteredIdeas = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return (ideas ?? []).filter(
      (i) =>
        (filters.platform === "all" || i.platform === filters.platform) &&
        (!q ||
          i.title.toLowerCase().includes(q) ||
          (i.description ?? "").toLowerCase().includes(q)),
    );
  }, [ideas, filters]);

  const scheduledEntries = useMemo(
    () =>
      filteredEntries.filter((e): e is ScheduledEntry => e.scheduledAt != null),
    [filteredEntries],
  );

  const entriesByDay = useMemo(() => {
    const map = new Map<string, ScheduledEntry[]>();
    for (const e of scheduledEntries) {
      const key = dayKey(new Date(e.scheduledAt));
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.scheduledAt - b.scheduledAt);
    return map;
  }, [scheduledEntries]);

  const monthCells = useMemo(() => {
    const first = new Date(monthCursor.year, monthCursor.month, 1);
    const lead = first.getDay();
    const days = new Date(monthCursor.year, monthCursor.month + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const weekDays = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAnchor);
      d.setDate(weekAnchor.getDate() - weekAnchor.getDay() + i);
      out.push(d);
    }
    return out;
  }, [weekAnchor]);

  const stats = useMemo(
    () => ({
      scheduled: (entries ?? []).filter((e) => e.scheduledAt != null).length,
      drafts: (entries ?? []).filter((e) => e.status === "draft").length,
      active: (campaigns ?? []).filter((c) => c.status === "active").length,
      published: (entries ?? []).filter((e) => e.status === "published").length,
    }),
    [entries, campaigns],
  );

  // -- Entry dialog ----------------------------------------------------------

  const openNewEntry = () => {
    setEntryDraft({
      ...EMPTY_ENTRY,
      campaignId:
        filters.campaign !== "all" && filters.campaign !== "none"
          ? filters.campaign
          : "",
    });
    setEntryOpen(true);
  };

  const openEditEntry = (e: Entry) => {
    setEntryDraft({
      id: e._id,
      title: e.title,
      platform: e.platform,
      contentType: e.contentType,
      body: e.body,
      hook: e.hook ?? "",
      callToAction: e.callToAction ?? "",
      creativeBrief: e.creativeBrief ?? "",
      status: e.status,
      scheduledAt: toLocalInput(e.scheduledAt),
      // Drop ids that no longer resolve (e.g. a campaign deleted before the
      // unlink-on-delete fix) so the editor can't submit a dangling reference.
      campaignId:
        e.campaignId && campaigns?.some((c) => c._id === e.campaignId)
          ? e.campaignId
          : "",
      pillar: e.pillar ?? "",
      tags: (e.tags ?? []).join(", "),
      audience: e.audience ?? "",
      attachments: (e.attachments ?? []) as Attachment[],
    });
    setEntryOpen(true);
  };

  const saveEntry = async () => {
    const title = entryDraft.title.trim();
    if (!title) {
      toast.error("Give this content a title first");
      return;
    }
    const ts = fromLocalInput(entryDraft.scheduledAt);
    const campaignId = entryDraft.campaignId || undefined;
    const tags = entryDraft.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    const contentType = entryDraft.contentType.trim() || "Post";

    setSaving(true);
    try {
      if (entryDraft.id) {
        await updateEntry({
          entryId: entryDraft.id as Id<"marketingEntries">,
          title,
          platform: entryDraft.platform,
          contentType,
          body: entryDraft.body,
          hook: entryDraft.hook.trim(),
          callToAction: entryDraft.callToAction.trim(),
          creativeBrief: entryDraft.creativeBrief.trim(),
          status: entryDraft.status,
          scheduledAt: ts ?? null,
          campaignId: campaignId
            ? (campaignId as Id<"campaigns">)
            : null,
          pillar: entryDraft.pillar.trim(),
          tags,
          audience: entryDraft.audience.trim(),
          attachments: entryDraft.attachments,
        });
        toast.success("Content updated");
      } else {
        await createEntry({
          title,
          platform: entryDraft.platform,
          contentType,
          body: entryDraft.body,
          hook: entryDraft.hook.trim() || undefined,
          callToAction: entryDraft.callToAction.trim() || undefined,
          creativeBrief: entryDraft.creativeBrief.trim() || undefined,
          status: entryDraft.status,
          scheduledAt: ts,
          campaignId: campaignId as Id<"campaigns"> | undefined,
          pillar: entryDraft.pillar.trim() || undefined,
          tags,
          audience: entryDraft.audience.trim() || undefined,
          attachments: entryDraft.attachments,
        });
        toast.success("Content created");
      }
      setEntryOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(errMsg(err, "Couldn't save this content"));
    } finally {
      setSaving(false);
    }
  };

  const uploadAttachments = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (!list.length) {
      if (files && files.length) {
        toast.error("Attachments need to be an image or a video");
      }
      return;
    }
    setUploading(true);
    try {
      const next = [...entryDraft.attachments];
      for (const file of list) {
        if (next.length >= MAX_ATTACHMENTS) {
          toast.error(`Up to ${MAX_ATTACHMENTS} attachments per content item`);
          break;
        }
        // Each upload gets its own one-time URL.
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        await registerUpload({
          storageId,
          name: file.name,
          contentType: file.type,
        });
        next.push({ storageId, name: file.name, contentType: file.type });
      }
      setEntryDraft((d) => ({ ...d, attachments: next }));
    } catch (err) {
      console.error(err);
      toast.error("Couldn't upload that file — try again");
    } finally {
      setUploading(false);
    }
  };

  const generateWithAI = async () => {
    setGenerating(true);
    try {
      const campaign = campaigns?.find((c) => c._id === entryDraft.campaignId);
      const prompt = [
        `Write ${entryDraft.contentType || "a social media post"} copy for ${platformLabel(entryDraft.platform)}.`,
        entryDraft.title.trim() ? `Topic: ${entryDraft.title.trim()}` : "",
        entryDraft.audience.trim()
          ? `Target audience: ${entryDraft.audience.trim()}`
          : "",
        entryDraft.pillar.trim()
          ? `Content pillar: ${entryDraft.pillar.trim()}`
          : "",
        campaign ? `Campaign: ${campaign.name}` : "",
        entryDraft.creativeBrief.trim()
          ? `Creative brief: ${entryDraft.creativeBrief.trim()}`
          : "",
        `Tone of voice: ${tone}.`,
        "Do not invent statistics or engagement numbers. Return exactly three lines:\nHOOK: <attention-grabbing first line>\nBODY: <the full caption or body copy>\nCTA: <call to action>",
      ]
        .filter(Boolean)
        .join("\n");

      const res = await generate({ question: prompt });
      const answer = (res.answer ?? "").trim();
      if (!answer) {
        toast.error("The assistant returned nothing — try again");
        return;
      }
      const hook = /(?:^|\n)\s*HOOK:\s*(.+)/i.exec(answer);
      const body = /(?:^|\n)\s*BODY:\s*([\s\S]*?)(?=\n\s*(?:HOOK|CTA):|$)/i.exec(answer);
      const cta = /(?:^|\n)\s*CTA:\s*(.+)/i.exec(answer);
      setEntryDraft((d) => ({
        ...d,
        hook: hook ? hook[1].trim() : d.hook,
        body: body ? body[1].trim() : answer,
        callToAction: cta ? cta[1].trim() : d.callToAction,
      }));
      toast.success("Generated — review and edit before saving");
    } catch (err) {
      console.error(err);
      toast.error(errMsg(err, "AI generation failed"));
    } finally {
      setGenerating(false);
    }
  };

  // -- Idea dialog -----------------------------------------------------------

  const openNewIdea = () => {
    setIdeaDraft({
      ...EMPTY_IDEA,
      campaignId:
        filters.campaign !== "all" && filters.campaign !== "none"
          ? filters.campaign
          : "",
    });
    setIdeaOpen(true);
  };

  const openEditIdea = (i: Idea) => {
    setIdeaDraft({
      id: i._id,
      title: i.title,
      description: i.description ?? "",
      contentType: i.contentType,
      platform: i.platform,
      pillar: i.pillar ?? "",
      campaignId: i.campaignId ?? "",
      tags: (i.tags ?? []).join(", "),
    });
    setIdeaOpen(true);
  };

  const saveIdea = async () => {
    const title = ideaDraft.title.trim();
    if (!title) {
      toast.error("Give this idea a title first");
      return;
    }
    const tags = ideaDraft.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    const contentType = ideaDraft.contentType.trim() || "Post";
    const campaignId = ideaDraft.campaignId || undefined;

    setSaving(true);
    try {
      if (ideaDraft.id) {
        await updateIdea({
          ideaId: ideaDraft.id as Id<"marketingIdeas">,
          title,
          description: ideaDraft.description.trim(),
          contentType,
          platform: ideaDraft.platform,
          pillar: ideaDraft.pillar.trim(),
          campaignId: campaignId
            ? (campaignId as Id<"campaigns">)
            : null,
          tags,
        });
        toast.success("Idea updated");
      } else {
        await createIdea({
          title,
          description: ideaDraft.description.trim() || undefined,
          contentType,
          platform: ideaDraft.platform,
          pillar: ideaDraft.pillar.trim() || undefined,
          campaignId: campaignId as Id<"campaigns"> | undefined,
          tags,
        });
        toast.success("Idea captured");
      }
      setIdeaOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(errMsg(err, "Couldn't save this idea"));
    } finally {
      setSaving(false);
    }
  };

  const onConvertIdea = async (id: Id<"marketingIdeas">) => {
    try {
      await convertIdea({ ideaId: id });
      toast.success("Idea converted into a draft — find it in Content");
    } catch (err) {
      console.error(err);
      toast.error(errMsg(err, "Couldn't convert this idea"));
    }
  };

  // -- Campaign dialog -------------------------------------------------------

  const openNewCampaign = () => {
    setCampaignDraft(EMPTY_CAMPAIGN);
    setCampaignOpen(true);
  };

  const openEditCampaign = (c: Campaign) => {
    setCampaignDraft({
      id: c._id,
      name: c.name,
      objective: c.objective ?? "",
      audience: c.audience ?? "",
      startDate: toLocalInput(c.startDate).slice(0, 10),
      endDate: toLocalInput(c.endDate).slice(0, 10),
      status: c.status,
      notes: c.notes ?? "",
      goalId:
        c.goalId && goals?.some((g) => g._id === c.goalId) ? c.goalId : "",
      projectId:
        c.projectId && projects?.some((p) => p._id === c.projectId)
          ? c.projectId
          : "",
    });
    setCampaignOpen(true);
  };

  const saveCampaign = async () => {
    const name = campaignDraft.name.trim();
    if (!name) {
      toast.error("Give this campaign a name first");
      return;
    }
    const startDate = formatDateInput(campaignDraft.startDate);
    const endDate = formatDateInput(campaignDraft.endDate);
    if (startDate && endDate && endDate < startDate) {
      toast.error("The end date can't be before the start date");
      return;
    }
    const payload = {
      name,
      objective: campaignDraft.objective.trim() || undefined,
      audience: campaignDraft.audience.trim() || undefined,
      startDate,
      endDate,
      status: campaignDraft.status,
      notes: campaignDraft.notes.trim() || undefined,
      goalId: (campaignDraft.goalId || undefined) as Id<"goals"> | undefined,
      projectId: (campaignDraft.projectId || undefined) as
        | Id<"projects">
        | undefined,
    };

    setSaving(true);
    try {
      if (campaignDraft.id) {
        await updateCampaign({
          campaignId: campaignDraft.id as Id<"campaigns">,
          name: payload.name,
          objective: campaignDraft.objective.trim(),
          audience: campaignDraft.audience.trim(),
          startDate: startDate ?? null,
          endDate: endDate ?? null,
          status: payload.status,
          notes: campaignDraft.notes.trim(),
          goalId: (campaignDraft.goalId || null) as Id<"goals"> | null,
          projectId: (campaignDraft.projectId || null) as Id<"projects"> | null,
        });
        toast.success("Campaign updated");
      } else {
        await createCampaign(payload);
        toast.success("Campaign created");
      }
      setCampaignOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(errMsg(err, "Couldn't save this campaign"));
    } finally {
      setSaving(false);
    }
  };

  // -- Delete ----------------------------------------------------------------

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { kind, id } = deleteTarget;
    try {
      if (kind === "entry") {
        await removeEntry({ entryId: id as Id<"marketingEntries"> });
        toast.success("Content deleted");
      } else if (kind === "idea") {
        await removeIdea({ ideaId: id as Id<"marketingIdeas"> });
        toast.success("Idea deleted");
      } else {
        await removeCampaign({ campaignId: id as Id<"campaigns"> });
        toast.success("Campaign deleted — linked content is kept");
      }
    } catch (err) {
      console.error(err);
      toast.error(errMsg(err, "Couldn't delete that"));
    } finally {
      setDeleteTarget(null);
    }
  };

  // -- Calendar navigation ---------------------------------------------------

  const shiftMonth = (delta: number) => {
    setMonthCursor((m) => {
      const d = new Date(m.year, m.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Search content…"
          className="pl-9"
        />
      </div>
      <Select
        value={filters.platform}
        onValueChange={(v) => setFilters((f) => ({ ...f, platform: v }))}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All platforms</SelectItem>
          {PLATFORMS.map((p) => (
            <SelectItem key={p} value={p}>
              {platformLabel(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.status}
        onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.campaign}
        onValueChange={(v) => setFilters((f) => ({ ...f, campaign: v }))}
      >
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="Campaign" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All campaigns</SelectItem>
          {(campaigns ?? []).map((c) => (
            <SelectItem key={c._id} value={c._id}>
              {c.name}
            </SelectItem>
          ))}
          <SelectItem value="none">No campaign</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  const statusChip = (status: Status) => (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );

  if (entries === undefined || ideas === undefined || campaigns === undefined) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-8 md:px-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-8 md:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">
            Marketing Planner
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Create and edit content ideas, posts, statuses and campaigns here.
            Anything with a date also appears on the Calendar — same record,
            no duplicate.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-2" onClick={openNewCampaign}>
            <Target className="size-4" />
            Plan a campaign
          </Button>
          <Button variant="outline" className="gap-2" onClick={openNewEntry}>
            <Plus className="size-4" />
            Add content
          </Button>
        </div>
      </header>

      {/* Stats */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Content scheduled", value: stats.scheduled },
          { label: "Drafts awaiting completion", value: stats.drafts },
          { label: "Active campaigns", value: stats.active },
          { label: "Content published", value: stats.published },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border/70 bg-card p-4"
          >
            <p className="font-display text-2xl tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="mt-6"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        {/* -------------------------------------------------- Calendar ---- */}
        <TabsContent value="calendar" className="mt-4 space-y-4">
          {filterBar}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() =>
                  calView === "week"
                    ? setWeekAnchor((d) => {
                        const n = new Date(d);
                        n.setDate(d.getDate() - 7);
                        return n;
                      })
                    : shiftMonth(-1)
                }
                aria-label="Previous"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-40 px-2 text-center text-sm font-medium">
                {calView === "week"
                  ? `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                  : new Date(monthCursor.year, monthCursor.month, 1).toLocaleDateString(
                      undefined,
                      { month: "long", year: "numeric" },
                    )}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() =>
                  calView === "week"
                    ? setWeekAnchor((d) => {
                        const n = new Date(d);
                        n.setDate(d.getDate() + 7);
                        return n;
                      })
                    : shiftMonth(1)
                }
                aria-label="Next"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="flex rounded-lg border border-border/70 p-0.5">
              {(["month", "week", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setCalView(v)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium capitalize",
                    calView === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-5" />}
              title="No content planned yet"
              body="Start with an idea or create your first post. Scheduled content shows up here."
              action={
                <Button className="gap-2" onClick={openNewEntry}>
                  <Plus className="size-4" />
                  Add content
                </Button>
              }
            />
          ) : calView === "month" ? (
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              <div className="grid grid-cols-7 border-b border-border/70 bg-muted/50">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="px-1 py-2 text-center text-[11px] font-medium text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthCells.map((day, idx) => {
                  const key =
                    day === null
                      ? null
                      : dayKey(new Date(monthCursor.year, monthCursor.month, day));
                  const dayEntries = key ? entriesByDay.get(key) ?? [] : [];
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "min-h-24 border-b border-r border-border/50 p-1 last:border-r-0",
                        day === null && "bg-muted/20",
                      )}
                    >
                      {day !== null && (
                        <>
                          <span className="mb-1 block text-center text-[11px] text-muted-foreground">
                            {day}
                          </span>
                          <div className="space-y-1">
                            {dayEntries.slice(0, 2).map((e) => (
                              <button
                                key={e._id}
                                onClick={() => openEditEntry(e)}
                                title={e.title}
                                className="block w-full truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-left text-[10px] font-medium text-primary hover:bg-primary/20"
                              >
                                {e.title}
                              </button>
                            ))}
                            {dayEntries.length > 2 && (
                              <span className="block px-1.5 text-[10px] text-muted-foreground">
                                +{dayEntries.length - 2} more
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : calView === "week" ? (
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
              {weekDays.map((d) => {
                const dayEntries = entriesByDay.get(dayKey(d)) ?? [];
                const isToday = dayKey(d) === dayKey(new Date());
                return (
                  <div key={dayKey(d)} className="flex gap-3 p-3">
                    <div className="w-16 shrink-0 text-center">
                      <p
                        className={cn(
                          "text-[11px] uppercase text-muted-foreground",
                          isToday && "font-semibold text-primary",
                        )}
                      >
                        {d.toLocaleDateString(undefined, { weekday: "short" })}
                      </p>
                      <p
                        className={cn(
                          "text-lg font-semibold tabular-nums",
                          isToday && "text-primary",
                        )}
                      >
                        {d.getDate()}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {dayEntries.length === 0 ? (
                        <p className="py-2 text-xs text-muted-foreground">—</p>
                      ) : (
                        dayEntries.map((e) => (
                          <button
                            key={e._id}
                            onClick={() => openEditEntry(e)}
                            className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-left hover:border-primary/40"
                          >
                            {statusChip(e.status)}
                            <span className="truncate text-sm font-medium">
                              {e.title}
                            </span>
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              {platformLabel(e.platform)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              {[...filteredEntries]
                .sort((a, b) => {
                  if (a.scheduledAt && b.scheduledAt)
                    return a.scheduledAt - b.scheduledAt;
                  if (a.scheduledAt) return -1;
                  if (b.scheduledAt) return 1;
                  return b.updatedAt - a.updatedAt;
                })
                .map((e) => (
                  <button
                    key={e._id}
                    onClick={() => openEditEntry(e)}
                    className="flex w-full items-center gap-3 border-b border-border/50 p-3 text-left transition-colors last:border-b-0 hover:bg-accent/40"
                  >
                    {statusChip(e.status)}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {e.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        <span>{platformLabel(e.platform)}</span>
                        <span aria-hidden>·</span>
                        <span>{e.contentType}</span>
                        {e.campaignName && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{e.campaignName}</span>
                          </>
                        )}
                      </span>
                    </span>
                    {(e.attachments?.length ?? 0) > 0 && (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <Paperclip className="size-3" />
                        {e.attachments?.length}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {e.scheduledAt ? formatWhen(e.scheduledAt) : "Unscheduled"}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------------------------------- Ideas ---- */}
        <TabsContent value="ideas" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
                placeholder="Search ideas…"
                className="pl-9"
              />
            </div>
            <Select
              value={filters.platform}
              onValueChange={(v) => setFilters((f) => ({ ...f, platform: v }))}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {platformLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="gap-2" onClick={openNewIdea}>
              <Plus className="size-4" />
              New idea
            </Button>
          </div>

          {filteredIdeas.length === 0 ? (
            <EmptyState
              icon={<Lightbulb className="size-5" />}
              title="No ideas yet"
              body="Capture ideas before they get lost — you can turn any of them into a draft later."
              action={
                <Button className="gap-2" onClick={openNewIdea}>
                  <Plus className="size-4" />
                  New idea
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredIdeas.map((i) => {
                const campaign = campaigns?.find(
                  (c) => c._id === i.campaignId,
                );
                return (
                  <div
                    key={i._id}
                    className="flex flex-col rounded-2xl border border-border/70 bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openEditIdea(i)}
                      >
                        <p className="truncate font-semibold">{i.title}</p>
                      </button>
                      {i.convertedTo && (
                        <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                          converted
                        </span>
                      )}
                    </div>
                    {i.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {i.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded-md bg-muted px-1.5 py-0.5">
                        {platformLabel(i.platform)}
                      </span>
                      <span className="rounded-md bg-muted px-1.5 py-0.5">
                        {i.contentType}
                      </span>
                      {i.pillar && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5">
                          {i.pillar}
                        </span>
                      )}
                      {campaign && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5">
                          {campaign.name}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {!i.convertedTo && (
                        <Button
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => onConvertIdea(i._id)}
                        >
                          <FileText className="size-3.5" />
                          Convert to draft
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        onClick={() => openEditIdea(i)}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 text-destructive hover:text-destructive"
                        onClick={() =>
                          setDeleteTarget({
                            kind: "idea",
                            id: i._id,
                            label: i.title,
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* --------------------------------------------------- Content ---- */}
        <TabsContent value="content" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1">{filterBar}</div>
            <Button className="gap-2" onClick={openNewEntry}>
              <Plus className="size-4" />
              Add content
            </Button>
          </div>

          {filteredEntries.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No content yet"
              body="Create your first post, or capture an idea and convert it into a draft."
              action={
                <Button className="gap-2" onClick={openNewEntry}>
                  <Plus className="size-4" />
                  Add content
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {filteredEntries.map((e) => (
                <div
                  key={e._id}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3"
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openEditEntry(e)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {statusChip(e.status)}
                      <span className="truncate font-medium">{e.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{platformLabel(e.platform)}</span>
                      <span>{e.contentType}</span>
                      <span>{formatWhen(e.scheduledAt)}</span>
                      {e.campaignName && <span>{e.campaignName}</span>}
                      {(e.attachments?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="size-3" />
                          {e.attachments?.length} attached
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Edit"
                      onClick={() => openEditEntry(e)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      aria-label="Delete"
                      onClick={() =>
                        setDeleteTarget({
                          kind: "entry",
                          id: e._id,
                          label: e.title,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------- Campaigns ---- */}
        <TabsContent value="campaigns" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button className="gap-2" onClick={openNewCampaign}>
              <Plus className="size-4" />
              New campaign
            </Button>
          </div>

          {campaigns.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="size-5" />}
              title="No campaigns yet"
              body="Group your content around a goal — a launch, a promotion, a season."
              action={
                <Button className="gap-2" onClick={openNewCampaign}>
                  <Target className="size-4" />
                  Plan a campaign
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => {
                const goal = goals?.find((g) => g._id === c.goalId);
                const project = projects?.find((p) => p._id === c.projectId);
                const pct = c.entryCount
                  ? Math.round((c.publishedCount / c.entryCount) * 100)
                  : 0;
                return (
                  <div
                    key={c._id}
                    className="rounded-2xl border border-border/70 bg-card p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold">{c.name}</h2>
                          <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {CAMPAIGN_STATUS_LABEL[c.status]}
                          </span>
                        </div>
                        {c.objective && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {c.objective}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDayRange(c.startDate, c.endDate)}
                          {c.audience ? ` · ${c.audience}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => {
                            setFilters((f) => ({ ...f, campaign: c._id }));
                            setTab("content");
                          }}
                        >
                          View content
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => openEditCampaign(c)}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-destructive hover:text-destructive"
                          onClick={() =>
                            setDeleteTarget({
                              kind: "campaign",
                              id: c._id,
                              label: c.name,
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                        <span>
                          {c.publishedCount} published · {c.draftCount} drafts ·{" "}
                          {c.readyCount} ready · {c.ideaCount} ideas
                        </span>
                        <span className="tabular-nums">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>

                    {(goal || project) && (
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                        {goal && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5">
                            Goal: {goal.title}
                          </span>
                        )}
                        {project && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5">
                            Project: {project.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------ Entry dialog ----- */}
      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {entryDraft.id ? "Edit content" : "Add content"}
            </DialogTitle>
            <DialogDescription>
              Only the title is required — save a draft now and finish it later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="entry-title">Title *</Label>
              <Input
                id="entry-title"
                value={entryDraft.title}
                onChange={(e) =>
                  setEntryDraft({ ...entryDraft, title: e.target.value })
                }
                placeholder="Spring launch teaser"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-platform">Platform</Label>
              <Select
                value={entryDraft.platform}
                onValueChange={(v) =>
                  setEntryDraft({ ...entryDraft, platform: v })
                }
              >
                <SelectTrigger id="entry-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {platformLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-format">Content format</Label>
              <Input
                id="entry-format"
                value={entryDraft.contentType}
                onChange={(e) =>
                  setEntryDraft({ ...entryDraft, contentType: e.target.value })
                }
                placeholder="Post, carousel, short video…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-status">Status</Label>
              <Select
                value={entryDraft.status}
                onValueChange={(v) =>
                  setEntryDraft({ ...entryDraft, status: v as Status })
                }
              >
                <SelectTrigger id="entry-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-scheduled">Scheduled date &amp; time</Label>
              <Input
                id="entry-scheduled"
                type="datetime-local"
                value={entryDraft.scheduledAt}
                onChange={(e) =>
                  setEntryDraft({ ...entryDraft, scheduledAt: e.target.value })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-campaign">Campaign</Label>
              <Select
                value={entryDraft.campaignId || "none"}
                onValueChange={(v) =>
                  setEntryDraft({
                    ...entryDraft,
                    campaignId: v === "none" ? "" : v,
                  })
                }
              >
                <SelectTrigger id="entry-campaign">
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {(campaigns ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-pillar">Content pillar</Label>
              <Input
                id="entry-pillar"
                value={entryDraft.pillar}
                onChange={(e) =>
                  setEntryDraft({ ...entryDraft, pillar: e.target.value })
                }
                placeholder="education, product, offer…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-audience">Target audience</Label>
              <Input
                id="entry-audience"
                value={entryDraft.audience}
                onChange={(e) =>
                  setEntryDraft({ ...entryDraft, audience: e.target.value })
                }
                placeholder="Who is this for?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-tone">Tone of voice (for AI)</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="entry-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-tags">Tags</Label>
              <Input
                id="entry-tags"
                value={entryDraft.tags}
                onChange={(e) =>
                  setEntryDraft({ ...entryDraft, tags: e.target.value })
                }
                placeholder="launch, behind-the-scenes (comma separated)"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-hook">Hook</Label>
              <Input
                id="entry-hook"
                value={entryDraft.hook}
                onChange={(e) =>
                  setEntryDraft({ ...entryDraft, hook: e.target.value })
                }
                placeholder="First line that stops the scroll"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="entry-cta">Call to action</Label>
              <Input
                id="entry-cta"
                value={entryDraft.callToAction}
                onChange={(e) =>
                  setEntryDraft({ ...entryDraft, callToAction: e.target.value })
                }
                placeholder="Book a free intro call"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="entry-body">Caption / body</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5"
                  onClick={generateWithAI}
                  disabled={generating}
                >
                  <Sparkles className="size-3.5" />
                  {generating ? "Generating…" : "Generate with AI"}
                </Button>
              </div>
              <Textarea
                id="entry-body"
                rows={6}
                value={entryDraft.body}
                onChange={(e) =>
                  setEntryDraft({ ...entryDraft, body: e.target.value })
                }
                placeholder="Write it yourself, or generate a first draft and edit it…"
              />
              {generating && (
                <p className="text-xs text-muted-foreground">
                  The assistant is drafting from your workspace context — you
                  review before saving.
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="entry-brief">Notes / creative brief</Label>
              <Textarea
                id="entry-brief"
                rows={3}
                value={entryDraft.creativeBrief}
                onChange={(e) =>
                  setEntryDraft({
                    ...entryDraft,
                    creativeBrief: e.target.value,
                  })
                }
                placeholder="Asset reference, angle, links, reminders…"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="entry-attachments">
                  Images &amp; video
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    optional · up to {MAX_ATTACHMENTS}
                  </span>
                </Label>
                <label
                  htmlFor="entry-attachments"
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent/60",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  <Upload className="size-3.5" />
                  {uploading ? "Uploading…" : "Upload file"}
                </label>
                <input
                  id="entry-attachments"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    void uploadAttachments(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              {entryDraft.attachments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                  Add the visual that goes with this post — it stays in OCIVO
                  as part of the plan, it is never published.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-2">
                    {entryDraft.attachments.map((attachment) => (
                      <AttachmentThumb
                        key={attachment.storageId}
                        attachment={attachment}
                        onRemove={() =>
                          setEntryDraft((d) => ({
                            ...d,
                            attachments: d.attachments.filter(
                              (a) => a.storageId !== attachment.storageId,
                            ),
                          }))
                        }
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Select a file to preview it or download the original.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            {entryDraft.id && (
              <Button
                variant="ghost"
                className="gap-1.5 text-destructive hover:text-destructive sm:mr-auto"
                onClick={() => {
                  if (!entryDraft.id) return;
                  setDeleteTarget({
                    kind: "entry",
                    id: entryDraft.id,
                    label: entryDraft.title || "this content",
                  });
                  setEntryOpen(false);
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setEntryOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={saveEntry} disabled={saving || generating}>
              {saving
                ? "Saving…"
                : entryDraft.id
                  ? "Save changes"
                  : "Create content"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- Idea dialog ---- */}
      <Dialog open={ideaOpen} onOpenChange={setIdeaOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {ideaDraft.id ? "Edit idea" : "New idea"}
            </DialogTitle>
            <DialogDescription>
              Catch it now — you can convert it into a draft at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="idea-title">Title *</Label>
              <Input
                id="idea-title"
                value={ideaDraft.title}
                onChange={(e) =>
                  setIdeaDraft({ ...ideaDraft, title: e.target.value })
                }
                placeholder="3 mistakes freelancers make with pricing"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="idea-desc">Description</Label>
              <Textarea
                id="idea-desc"
                rows={3}
                value={ideaDraft.description}
                onChange={(e) =>
                  setIdeaDraft({ ...ideaDraft, description: e.target.value })
                }
                placeholder="What is the angle, in a sentence or two?"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-platform">Platform</Label>
              <Select
                value={ideaDraft.platform}
                onValueChange={(v) =>
                  setIdeaDraft({ ...ideaDraft, platform: v })
                }
              >
                <SelectTrigger id="idea-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {platformLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-format">Content format</Label>
              <Input
                id="idea-format"
                value={ideaDraft.contentType}
                onChange={(e) =>
                  setIdeaDraft({ ...ideaDraft, contentType: e.target.value })
                }
                placeholder="Post, short video…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-pillar">Content pillar</Label>
              <Input
                id="idea-pillar"
                value={ideaDraft.pillar}
                onChange={(e) =>
                  setIdeaDraft({ ...ideaDraft, pillar: e.target.value })
                }
                placeholder="education, product, offer…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-campaign">Campaign</Label>
              <Select
                value={ideaDraft.campaignId || "none"}
                onValueChange={(v) =>
                  setIdeaDraft({
                    ...ideaDraft,
                    campaignId: v === "none" ? "" : v,
                  })
                }
              >
                <SelectTrigger id="idea-campaign">
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {(campaigns ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="idea-tags">Tags</Label>
              <Input
                id="idea-tags"
                value={ideaDraft.tags}
                onChange={(e) =>
                  setIdeaDraft({ ...ideaDraft, tags: e.target.value })
                }
                placeholder="series, repurpose (comma separated)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIdeaOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={saveIdea} disabled={saving}>
              {saving ? "Saving…" : ideaDraft.id ? "Save changes" : "Save idea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------- Campaign dialog ---- */}
      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {campaignDraft.id ? "Edit campaign" : "Plan a campaign"}
            </DialogTitle>
            <DialogDescription>
              A campaign groups your content, ideas and tasks around one goal.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="camp-name">Campaign name *</Label>
              <Input
                id="camp-name"
                value={campaignDraft.name}
                onChange={(e) =>
                  setCampaignDraft({ ...campaignDraft, name: e.target.value })
                }
                placeholder="Spring service launch"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="camp-objective">Objective</Label>
              <Input
                id="camp-objective"
                value={campaignDraft.objective}
                onChange={(e) =>
                  setCampaignDraft({
                    ...campaignDraft,
                    objective: e.target.value,
                  })
                }
                placeholder="Launch, awareness, retention…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="camp-audience">Target audience</Label>
              <Input
                id="camp-audience"
                value={campaignDraft.audience}
                onChange={(e) =>
                  setCampaignDraft({
                    ...campaignDraft,
                    audience: e.target.value,
                  })
                }
                placeholder="Who this campaign is aimed at"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-start">Start date</Label>
              <Input
                id="camp-start"
                type="date"
                value={campaignDraft.startDate}
                onChange={(e) =>
                  setCampaignDraft({
                    ...campaignDraft,
                    startDate: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-end">End date</Label>
              <Input
                id="camp-end"
                type="date"
                value={campaignDraft.endDate}
                onChange={(e) =>
                  setCampaignDraft({ ...campaignDraft, endDate: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-status">Status</Label>
              <Select
                value={campaignDraft.status}
                onValueChange={(v) =>
                  setCampaignDraft({
                    ...campaignDraft,
                    status: v as CampaignStatus,
                  })
                }
              >
                <SelectTrigger id="camp-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CAMPAIGN_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-goal">Linked goal</Label>
              <Select
                value={campaignDraft.goalId || "none"}
                onValueChange={(v) =>
                  setCampaignDraft({
                    ...campaignDraft,
                    goalId: v === "none" ? "" : v,
                  })
                }
              >
                <SelectTrigger id="camp-goal">
                  <SelectValue placeholder="No goal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No goal</SelectItem>
                  {(goals ?? []).map((g) => (
                    <SelectItem key={g._id} value={g._id}>
                      {g.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-project">Linked project</Label>
              <Select
                value={campaignDraft.projectId || "none"}
                onValueChange={(v) =>
                  setCampaignDraft({
                    ...campaignDraft,
                    projectId: v === "none" ? "" : v,
                  })
                }
              >
                <SelectTrigger id="camp-project">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="camp-notes">Notes</Label>
              <Textarea
                id="camp-notes"
                rows={3}
                value={campaignDraft.notes}
                onChange={(e) =>
                  setCampaignDraft({ ...campaignDraft, notes: e.target.value })
                }
                placeholder="Angle, channels, reminders…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCampaignOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={saveCampaign} disabled={saving}>
              {saving
                ? "Saving…"
                : campaignDraft.id
                  ? "Save changes"
                  : "Create campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------ Delete dialog ---- */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleteTarget?.kind}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.label}” will be permanently removed. This can't be
              undone.
              {deleteTarget?.kind === "campaign" &&
                " Linked content and ideas are kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
