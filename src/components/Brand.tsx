import { cn } from "@/lib/utils";

/**
 * The OCIVO octopus — "the workspace that has a hold on everything."
 * Single-weight stroke mark; inherits color via currentColor (defaults to
 * the Forest primary token).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      fill="none"
      aria-hidden
      className={cn("text-primary", className)}
    >
      <g
        stroke="currentColor"
        strokeWidth={64}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Head arch flowing into the right tentacle curl */}
        <path d="M322 437 L322 308 A158 158 0 0 1 638 308 L638 545 C638 618 715 640 826 637 A78 78 0 1 0 780 510" />
        {/* Left tentacle */}
        <path d="M442 480 C388 503 310 530 198 549 A100 100 0 1 0 323 625" />
        {/* Center tentacle */}
        <path d="M628 502 C570 556 490 645 421 698 A100 100 0 1 0 568 707" />
      </g>
      <g fill="currentColor">
        <circle cx="417" cy="346" r="35" />
        <circle cx="543" cy="346" r="35" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[1.35rem] leading-none tracking-tight text-foreground",
        className,
      )}
    >
      OCIVO
    </span>
  );
}
