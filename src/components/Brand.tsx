import { cn } from "@/lib/utils";

/** OCIVO monogram — an open ring with a spark: "structure + AI". */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[60%]">
        <circle
          cx="11"
          cy="13"
          r="5.4"
          stroke="currentColor"
          strokeWidth="2.6"
        />
        <path
          d="M18.6 3.2l.75 1.85 1.85.75-1.85.75-.75 1.85-.75-1.85-1.85-.75 1.85-.75.75-1.85z"
          fill="currentColor"
        />
      </svg>
    </span>
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
