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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { formatDateTime } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Instagram,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; className: string; dot: string }
  > = {
    connected: {
      label: "Connected",
      className: "border-primary/25 bg-primary/8 text-primary",
      dot: "bg-primary",
    },
    needsReauth: {
      label: "Reconnect needed",
      className: "border-ai/40 bg-ai/15 text-ai-deep",
      dot: "bg-ai-deep",
    },
    error: {
      label: "Connection error",
      className: "border-destructive/30 bg-destructive/5 text-destructive",
      dot: "bg-destructive",
    },
    disconnected: {
      label: "Disconnected",
      className: "border-border bg-muted/50 text-muted-foreground",
      dot: "bg-muted-foreground/50",
    },
  };
  const item = map[status] ?? map.disconnected;
  return (
    <Badge variant="outline" className={cn("gap-1.5", item.className)}>
      <span className={cn("size-1.5 rounded-full", item.dot)} />
      {item.label}
    </Badge>
  );
}

function AccountAvatar({
  url,
  username,
}: {
  url: string | null;
  username: string | null;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={username ? `@${username} profile picture` : "Instagram profile"}
        className="size-10 shrink-0 rounded-full border border-border/70 object-cover"
      />
    );
  }
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Instagram className="size-4" />
    </span>
  );
}

export function InstagramConnection({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const status = useQuery(api.integrations.status);
  const configStatus = useAction(api.instagram.configStatus);
  const beginOAuth = useAction(api.instagram.beginOAuth);
  const syncNow = useAction(api.instagram.syncNow);
  const disconnect = useMutation(api.integrations.disconnect);
  const deleteAnalytics = useMutation(api.analytics.deleteAnalytics);
  const [config, setConfig] = useState<{
    configured: boolean;
    missing: string[];
    redirectUri: string | null;
    graphVersion: string;
    canManage: boolean;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const callbackHandled = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void configStatus({})
      .then((result) => {
        if (!cancelled) setConfig(result);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [configStatus]);

  useEffect(() => {
    const event = searchParams.get("instagram");
    if (!event || callbackHandled.current) return;
    callbackHandled.current = true;
    if (event === "connected") {
      toast.success("Instagram connected", {
        description: "OCIVO is collecting the first real insights now.",
      });
    } else if (event === "denied") {
      toast.error("Instagram connection cancelled", {
        description: "No permissions were granted and no data was collected.",
      });
    } else if (event === "error") {
      toast.error("Instagram could not be connected", {
        description:
          searchParams.get("reason") ?? "Check the configuration and try again.",
      });
    }
    navigate(`${location.pathname}#integrations`, { replace: true });
  }, [searchParams, navigate, location.pathname]);

  const connection = status?.connection ?? null;
  const isOwner = status?.isOwner ?? false;
  const canManage = isOwner && (config?.canManage ?? true);
  const statusKey = connection?.status ?? "disconnected";

  const connect = async (forceReauth = false) => {
    if (busy) return;
    setBusy(forceReauth ? "reconnect" : "connect");
    try {
      const result = await beginOAuth({ forceReauth });
      if (!result.configured) {
        setConfig((current) =>
          current
            ? { ...current, configured: false, missing: result.missing }
            : current,
        );
        toast.error("Instagram setup is not configured", {
          description: `An administrator needs to add: ${result.missing.join(", ")}.`,
        });
        return;
      }
      window.location.assign(result.url);
    } catch (error) {
      toast.error("Could not start Instagram connection", {
        description:
          error instanceof Error
            ? error.message.replace(/^.*Error:\s*/, "")
            : "Try again shortly.",
      });
      setBusy(null);
    }
  };

  const runSync = async () => {
    if (busy) return;
    setBusy("sync");
    try {
      const result = await syncNow({});
      if (result.status === "busy") {
        toast.info("A synchronization is already running");
      } else {
        toast.success(
          result.status === "success"
            ? "Instagram insights updated"
            : "Instagram sync completed with missing data",
          {
            description:
              result.warnings.length > 0
                ? result.warnings.slice(0, 2).join(" · ")
                : `${result.metricsStored} normalized records stored.`,
          },
        );
      }
    } catch (error) {
      toast.error("Synchronization failed", {
        description:
          error instanceof Error
            ? error.message.replace(/^.*Error:\s*/, "")
            : "Try again shortly.",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeConnection = async () => {
    setBusy("disconnect");
    try {
      await disconnect({});
      setConfirmDisconnect(false);
      toast.success("Instagram disconnected", {
        description: "The token was removed. Stored analytics were kept.",
      });
    } catch (error) {
      toast.error("Could not disconnect Instagram", {
        description:
          error instanceof Error
            ? error.message.replace(/^.*Error:\s*/, "")
            : "Try again shortly.",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeAnalytics = async () => {
    setBusy("delete");
    try {
      await deleteAnalytics({});
      setConfirmDelete(false);
      toast.success("Stored analytics deleted", {
        description:
          "Instagram data, reports, insights and recommendations were removed permanently.",
      });
    } catch (error) {
      toast.error("Could not delete analytics", {
        description:
          error instanceof Error
            ? error.message.replace(/^.*Error:\s*/, "")
            : "Only the workspace owner can delete analytics.",
      });
    } finally {
      setBusy(null);
    }
  };

  if (status === undefined) {
    return (
      <section
        className={cn(
          "rounded-2xl border border-border/70 bg-card p-5",
          className,
        )}
      >
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-14 rounded-xl" />
      </section>
    );
  }

  return (
    <section
      id="integrations"
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary/8 text-primary">
            <Instagram className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Instagram</h2>
            <p className="text-[11px] text-muted-foreground">
              Read-only professional account insights
            </p>
          </div>
        </div>
        <StatusBadge status={statusKey} />
      </div>

      {!connection ? (
        <div className="mt-4 rounded-xl border border-dashed border-border/80 px-4 py-4">
          <p className="text-[13px] font-medium">No account connected</p>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
            Connect an Instagram Business or Creator account to collect real
            reach, views, interactions, follower snapshots and published content.
            OCIVO requests insight access only — no publishing, messaging or
            comment permissions.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-border/60 bg-background/35 p-3.5">
          <div className="flex items-center gap-3">
            <AccountAvatar
              url={connection.profilePictureUrl}
              username={connection.username}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {connection.username ? `@${connection.username}` : "Instagram account"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {connection.accountType ?? "Professional account"}
                {connection.tokenExpiresAt
                  ? ` · token ${connection.status === "needsReauth" ? "expired" : "expires"} ${formatDateTime(connection.tokenExpiresAt)}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-muted/50 px-2.5 py-2">
              <p className="text-muted-foreground">Last sync</p>
              <p className="mt-0.5 font-medium">
                {formatDateTime(connection.lastSyncedAt)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 px-2.5 py-2">
              <p className="text-muted-foreground">Sync status</p>
              <p className="mt-0.5 font-medium capitalize">
                {connection.lastSyncStatus ?? "Not run yet"}
              </p>
            </div>
          </div>
          {connection.statusMessage && (
            <p
              className={cn(
                "mt-2.5 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed",
                connection.status === "connected"
                  ? "bg-muted/50 text-muted-foreground"
                  : "bg-ai/10 text-ai-deep",
              )}
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              {connection.statusMessage}
            </p>
          )}
          {connection.lastSyncError && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-destructive">
              {connection.lastSyncError}
            </p>
          )}
        </div>
      )}

      {!config?.configured && config?.missing.length ? (
        <Alert className="mt-4 bg-background/60">
          <AlertTitle className="text-[12px]">Configuration required</AlertTitle>
          <AlertDescription className="text-[11.5px]">
            {isOwner
              ? `An administrator must configure the Meta app. Missing: ${config.missing.join(", ")}.`
              : "The workspace owner must configure the Instagram app before an account can be connected."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {connection && connection.status === "connected" ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!canManage || busy !== null}
              onClick={() => void runSync()}
            >
              {busy === "sync" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!canManage || busy !== null}
              onClick={() => void connect(true)}
            >
              {busy === "reconnect" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              Reconnect
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              disabled={!canManage || busy !== null}
              onClick={() => setConfirmDisconnect(true)}
            >
              <Unplug className="size-3.5" />
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!canManage || busy !== null || !config?.configured}
            onClick={() => void connect(statusKey === "needsReauth")}
          >
            {busy === "connect" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Instagram className="size-3.5" />
            )}
            {statusKey === "needsReauth" ? "Reconnect Instagram" : "Connect Instagram"}
          </Button>
        )}

        {status?.hasData && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            disabled={!canManage || busy !== null}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-3.5" />
            Delete stored analytics
          </Button>
        )}

        {!isOwner && (
          <p className="text-[11px] text-muted-foreground">
            Only the workspace owner can manage this connection.
          </p>
        )}
      </div>

      {!compact && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            Tokens encrypted at rest
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            Read-only scopes
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            Disconnect keeps history
          </span>
        </div>
      )}

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Instagram?</AlertDialogTitle>
            <AlertDialogDescription>
              OCIVO will remove the access token and stop collecting new data.
              Your stored analytics, reports and recommendations will stay until
              you explicitly delete them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              onClick={(event) => {
                event.preventDefault();
                void removeConnection();
              }}
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stored Instagram analytics?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes daily metrics, period snapshots, media,
              planner links, audience snapshots, reports, insights and
              recommendations. The Instagram connection itself is kept. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Keep analytics</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy !== null}
              onClick={(event) => {
                event.preventDefault();
                void removeAnalytics();
              }}
            >
              {busy === "delete" ? "Deleting…" : "Delete analytics permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
