/**
 * Legal configuration for the OCIVO published policies.
 *
 * Everything below marked with square brackets is a PLACEHOLDER the operator
 * must replace with real, verified details. Until every placeholder is
 * resolved, the legal pages render a visible "Draft" banner (see
 * LegalPageLayout) and must not be treated as final published policies.
 */

import { CURRENT_TERMS_VERSION } from "@/convex/lib/legal";

export type LegalPlaceholderKey =
  | "operatorName"
  | "operatorAddress"
  | "privacyEmail"
  | "governingLaw"
  | "jurisdiction"
  | "dataRetention"
  | "aiSubProcessorsNote";

/** Edit these values — replacements flow through every legal page. */
export const LEGAL_PLACEHOLDERS: Record<LegalPlaceholderKey, string> = {
  operatorName: "[Legal operator / company name — REQUIRED]",
  operatorAddress: "[Registered address, country of establishment — REQUIRED]",
  privacyEmail: "[privacy contact email — REQUIRED]",
  // Do not claim a jurisdiction until it is verified with a lawyer.
  governingLaw: "[Applicable law — to be verified by counsel]",
  jurisdiction: "[Venue / dispute forum — to be verified by counsel]",
  // Verified retention would need production evidence; keep as placeholder.
  dataRetention:
    "[Retention periods to be confirmed against production practice — REQUIRED]",
  aiSubProcessorsNote:
    "[List of AI/API sub-processors with processing locations — verify against current provider terms — REQUIRED]",
};

/** True while any required placeholder is still unresolved → show draft bar. */
export function legalPlaceholdersResolved(): boolean {
  return Object.values(LEGAL_PLACEHOLDERS).every(
    (value) => !/^\[.*\]$/.test(value.trim()),
  );
}

export const LEGAL_VERSION = CURRENT_TERMS_VERSION;
/** Set a real effective date once contents are final. null = draft. */
export const LEGAL_EFFECTIVE_DATE: string | null = null;

export const LEGAL_ROUTES = [
  { path: "/privacy", label: "Privacy Policy" },
  { path: "/terms", label: "Terms of Service" },
  { path: "/cookies", label: "Cookie Policy" },
  { path: "/acceptable-use", label: "Acceptable Use" },
  { path: "/ai-disclaimer", label: "AI Disclaimer" },
  { path: "/data-deletion", label: "Data Deletion" },
] as const;
