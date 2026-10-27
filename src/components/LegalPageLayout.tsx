import { BrandMark } from "@/components/Brand";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ROUTES,
  LEGAL_VERSION,
  legalPlaceholdersResolved,
} from "@/lib/legal";
import { Link } from "react-router";

/** One numbered/qualified item inside a section body. */
export interface LegalBlock {
  heading: string;
  paragraphs: string[];
  list?: string[];
}

interface LegalPageLayoutProps {
  title: string;
  intro: string;
  blocks: LegalBlock[];
}


/** Amber marker for values the operator still has to provide. */
function DraftMark({ children }: { children: string }) {
  return (
    <span className="rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-900">
      {children}
    </span>
  );
}

/**
 * Shared layout for every published legal page: usable as a real, accessible,
 * indexable document while carrying a hard "Draft" banner until the operator
 * has replaced all placeholders.
 */
export default function LegalPageLayout({
  title,
  intro,
  blocks,
}: LegalPageLayoutProps) {
  const isDraft = !legalPlaceholdersResolved() || LEGAL_EFFECTIVE_DATE === null;

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#legal-body"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark className="size-7" />
            <span className="font-display text-base tracking-tight">OCIVO</span>
          </Link>
          <Link
            to="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main id="legal-body" className="mx-auto w-full max-w-3xl px-5 py-10 md:px-8">
        {isDraft && (
          <div
            role="status"
            className="mb-8 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3"
          >
            <p className="text-sm font-semibold text-amber-900">
              Draft — not yet published
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              This document is incomplete until the operator-provided details
              (marked in amber) are filled in and reviewed by qualified legal
              counsel. Do not rely on it as a finalized policy.
            </p>
          </div>
        )}

        <h1 className="font-display text-4xl tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
          {intro}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Version{" "}
          <span className="font-mono font-medium text-foreground">
            {LEGAL_VERSION}
          </span>
          {" · "}
          Effective date:{" "}
          {LEGAL_EFFECTIVE_DATE ? (
            <span className="font-medium text-foreground">
              {LEGAL_EFFECTIVE_DATE}
            </span>
          ) : (
            <DraftMark>[Effective date — REQUIRED]</DraftMark>
          )}
        </p>

        <div className="mt-10 space-y-10">
          {blocks.map((block) => (
            <section key={block.heading}>
              <h2 className="mt-0 font-display text-xl tracking-tight md:text-2xl">
                {block.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {block.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed md:text-base">
                    {p}
                  </p>
                ))}
              </div>
              {block.list && (
                <ul className="mt-2 space-y-2">
                  {block.list.map((item, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-sm leading-relaxed md:text-base"
                    >
                      <span
                        aria-hidden
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <nav
          aria-label="Legal pages"
          className="mt-14 border-t border-border/60 pt-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Legal
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_ROUTES.map((route) => (
              <li key={route.path}>
                <Link
                  to={route.path}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {route.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} OCIVO · Questions? The operator contact
        appears on the Privacy Policy page once published.
      </footer>
    </div>
  );
}
