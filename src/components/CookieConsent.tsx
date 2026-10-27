import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LEGAL_VERSION } from "@/lib/legal";
import { Cookie } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

/**
 * Privacy-friendly consent storage.
 *
 * Today OCIVO uses only essential storage (see the Cookie Policy), so there
 * are no optional categories to switch on — but the record itself is versioned
 * and timestamped so any future non-essential technology can be gated on real
 * consent before it activates. Nothing optional "pre-ticks" itself.
 */

const STORAGE_KEY = "ocivo.consent.v1";
const EVENT_OPEN = "ocivo:open-cookie-settings";

export interface ConsentRecord {
  /** Version of the policies at the time of the decision. */
  version: string;
  decidedAt: number;
  essential: true; // always active, cannot be declined
  // Reserved: any future optional category stays false unless the user
  // explicitly (and un-preselected) turns it on here.
  analytics: false;
}

function readConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    return parsed && typeof parsed.decidedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function saveDecision(): ConsentRecord {
  const record: ConsentRecord = {
    version: LEGAL_VERSION,
    decidedAt: Date.now(),
    essential: true,
    analytics: false,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable — nothing to remember */
  }
  return record;
}

/** Footer button that reopens the cookie/consent dialog anywhere. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENT_OPEN))}
      className={className}
    >
      Cookie settings
    </button>
  );
}

export default function CookieConsent() {
  // Read once at first render — no mount effect, no cascading renders.
  const [existing] = useState<ConsentRecord | null>(() => readConsent());
  const [open, setOpen] = useState(() => {
    if (existing) return false;
    // Defer the first-visit banner slightly so the page paints first —
    // the wait is cosmetic, so a timeout, not render-blocking.
    return true;
  });
  const [customize, setCustomize] = useState(false);
  const [decidedAt, setDecidedAt] = useState<number | null>(
    () => existing?.decidedAt ?? null,
  );

  useEffect(() => {
    const handler = () => {
      const existing = readConsent();
      setDecidedAt(existing?.decidedAt ?? null);
      setOpen(true);
      setCustomize(true);
    };
    window.addEventListener(EVENT_OPEN, handler);
    return () => window.removeEventListener(EVENT_OPEN, handler);
  }, []);

  const confirm = () => {
    const record = saveDecision();
    setDecidedAt(record.decidedAt);
    setOpen(false);
    setCustomize(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie settings"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-xl rounded-2xl border border-border/80 bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] sm:inset-x-auto sm:right-4 sm:left-auto sm:w-[26rem]"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cookie className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Cookies &amp; local storage</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            OCIVO uses local storage only to keep you signed in and to remember
            this choice. No analytics or advertising is installed — by design.
            Details in the{" "}
            <Link to="/cookies" className="underline hover:text-foreground">
              Cookie Policy
            </Link>
            .
          </p>

          {customize && (
            <div className="mt-3 space-y-2 rounded-xl border border-border/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">Essential</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Sign-in tokens + this consent record. Required for the
                    service.
                  </p>
                </div>
                <Checkbox checked disabled aria-label="Essential (required)" />
              </div>
              <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-2">
                <div>
                  <p className="text-xs font-medium">Analytics</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    No tools of this kind are installed. If one is added, it
                    will load only after explicit, separately consented-on
                    choice here.
                  </p>
                </div>
                <Checkbox
                  checked={false}
                  disabled
                  aria-label="Analytics (none installed)"
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={confirm}>
              {customize ? "Save choices" : "Accept"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCustomize((v) => !v)}
            >
              {customize ? "Hide details" : "Customize"}
            </Button>
            {decidedAt !== null && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                Saved {new Date(decidedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
