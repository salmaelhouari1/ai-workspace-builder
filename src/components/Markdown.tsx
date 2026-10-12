import { cn } from "@/lib/utils";
import { Fragment, type ReactNode } from "react";

/**
 * A deliberately small markdown renderer — headings, emphasis, links, code,
 * lists, checkboxes, quotes and callouts. No external deps, no dangerouslySetInnerHTML.
 */

function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const nodes: ReactNode[] = [];
  // code spans first, then bold, italic, links
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground/90"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const isInternal = linkMatch[2].startsWith("/");
        nodes.push(
          <a
            key={key}
            href={linkMatch[2]}
            target={isInternal ? undefined : "_blank"}
            rel="noreferrer"
            className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
          >
            {linkMatch[1]}
          </a>,
        );
      }
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

interface Block {
  type:
    | "heading"
    | "paragraph"
    | "ul"
    | "ol"
    | "checkbox"
    | "quote"
    | "callout"
    | "code"
    | "hr";
  level?: number;
  text?: string;
  items?: string[];
  lang?: string;
  checked?: boolean[];
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().replace(/`/g, "").trim();
      const buffer: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buffer.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ type: "code", lang, text: buffer.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    // Callout: > [!ai] text  (multi-line until next blank)
    const callout = /^>\s*\[!(ai|note|tip|warn)\]\s*(.*)$/i.exec(line);
    if (callout) {
      const buffer = [callout[2]];
      i++;
      while (i < lines.length && lines[i].startsWith(">") && !/^>\s*\[!/i.test(lines[i])) {
        buffer.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "callout", level: 1, text: buffer.join("\n") });
      continue;
    }

    // Quote
    if (line.startsWith(">")) {
      const buffer: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        buffer.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", text: buffer.join(" ") });
      continue;
    }

    // Checkbox
    const checkbox = /^[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (checkbox) {
      const items: string[] = [];
      const checked: boolean[] = [];
      while (i < lines.length) {
        const m = /^[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        checked.push(m[1].toLowerCase() === "x");
        items.push(m[2]);
        i++;
      }
      blocks.push({ type: "checkbox", items, checked });
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph (consume until blank line or another block starter)
    const buffer: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|[-*]\s|\d+[.)]\s|>|```|(-{3,}|\*{3,})$)/.test(lines[i])
    ) {
      buffer.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: buffer.join(" ") });
  }

  return blocks;
}

export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = parseBlocks(content);

  return (
    <div className={cn("space-y-3 break-words text-sm leading-relaxed", className)}>
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        switch (block.type) {
          case "heading": {
            const cls =
              block.level === 1
                ? "font-display text-2xl tracking-tight"
                : block.level === 2
                  ? "text-lg font-semibold"
                  : "text-base font-semibold";
            const Tag = (block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3") as "h1";
            return (
              <Tag key={key} className={cn(cls, "mt-6 first:mt-0")}>
                {renderInline(block.text ?? "", key)}
              </Tag>
            );
          }
          case "paragraph":
            return <p key={key}>{renderInline(block.text ?? "", key)}</p>;
          case "ul":
            return (
              <ul key={key} className="list-disc space-y-1.5 pl-5">
                {block.items?.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="list-decimal space-y-1.5 pl-5">
                {block.items?.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "checkbox":
            return (
              <ul key={key} className="space-y-1.5">
                {block.items?.map((item, j) => (
                  <li key={`${key}-${j}`} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px]",
                        block.checked?.[j]
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {block.checked?.[j] ? "✓" : ""}
                    </span>
                    <span className={cn(block.checked?.[j] && "text-muted-foreground line-through")}>
                      {renderInline(item, `${key}-${j}`)}
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="border-l-2 border-border pl-3 italic text-muted-foreground"
              >
                {renderInline(block.text ?? "", key)}
              </blockquote>
            );
          case "callout":
            return (
              <div
                key={key}
                className="flex gap-2.5 rounded-xl border border-ai/25 bg-ai/10 px-3.5 py-3"
              >
                <span className="text-ai-deep">✦</span>
                <div className="space-y-1 text-foreground/90">
                  {renderInline(block.text ?? "", key)}
                </div>
              </div>
            );
          case "code":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-xl border border-border/70 bg-foreground/95 p-3.5 font-mono text-xs leading-relaxed text-background"
              >
                <code>{block.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={key} className="border-border/70" />;
          default:
            return <Fragment key={key} />;
        }
      })}
    </div>
  );
}
