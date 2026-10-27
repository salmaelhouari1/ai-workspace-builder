import LegalPageLayout, { type LegalBlock } from "@/components/LegalPageLayout";
import { LEGAL_PLACEHOLDERS } from "@/lib/legal";

const blocks: LegalBlock[] = [
  {
    heading: "1. What we actually use",
    paragraphs: [
      "OCIVO does not use advertising, tracking or analytics cookies. After inspecting the application before this policy was written, OCIVO's own code sets no cookies other than the consent record described below, and no analytics or advertising scripts of any kind are loaded.",
      "The only client-side storage the Service relies on is browser local storage, not cookies. We document both here because storage-based identifiers are regulated like cookies in most privacy regimes.",
    ],
  },
  {
    heading: "2. Essential storage",
    paragraphs: [
      "The following items are strictly necessary to run the service, so they are not subject to your consent choice:",
    ],
    list: [
      "Sign-in tokens (keys beginning __convexAuthJWT and __convexAuthRefreshToken in your browser's local storage). They keep you signed in between visits. Retention: until you sign out or until the tokens expire and are rotated by the authentication backend.",
      "Consent record (key ocivo.consent.v1 in local storage). Stores your cookie choices, the policy version and the timestamp. Retention: kept until you clear it or change your choices; needed to honor (and prove) your decision.",
    ],
  },
  {
    heading: "3. Everything else",
    paragraphs: [
      "There are none. No analytics tools, no session-recording tools, no ad networks, no social widgets, no third-party fonts that set identifiers, and no marketing automation that places identifiers in your browser. If one is ever added, it will be listed here before it loads, and the consent banner will ask for permission for the category it belongs to.",
    ],
  },
  {
    heading: "4. How to manage or withdraw consent",
    paragraphs: [
      "Open cookie settings any time from the footer link \"Cookie settings\". Because essential storage keeps you signed in, blocking it would break sign-in — you can always remove it through your browser's site-data controls, and we treat sign-out (Settings) as a request to drop your tokens.",
      "Your other browser tools — private browsing, \"clear site data\", Do Not Track — work as usual.",
    ],
  },
  {
    heading: "5. Questions",
    paragraphs: [
      `Contact ${LEGAL_PLACEHOLDERS.privacyEmail} about anything on this page. Verified retention periods and provider specifics will replace the placeholders in this document when they are confirmed — treat sections marked as placeholders as draft.`,
    ],
  },
];

export default function Cookies() {
  return (
    <LegalPageLayout
      title="Cookie Policy"
      intro="The short version: OCIVO stores only what it needs to sign you in and remember your cookie choice. No analytics, no ads, no tracking. Here are the details."
      blocks={blocks}
    />
  );
}
