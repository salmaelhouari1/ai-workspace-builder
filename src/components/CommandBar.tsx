import { api } from "@/convex/_generated/api";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { parseTask, relativeDayLabel } from "@/lib/nlp";
import { navEntries, typeDisplay } from "@/lib/modules";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  ChevronRight,
  CircleDashed,
  FileText,
  Flag,
  FolderKanban,
  Inbox,
  Link2,
  ListChecks,
  Rocket,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

interface CommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HIT_ICONS = {
  task: ListChecks,
  project: FolderKanban,
  document: FileText,
  goal: Target,
  note: Inbox,
} as const;

/**
 * Global command bar (spec §17 + §18): navigation, workspace search and
 * natural-language commands in one place. "Create a task to call John
 * tomorrow at 10" parses locally and shows a preview before anything is
 * written.
 */
export function CommandBar({ open, onOpenChange }: CommandBarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const createTask = useMutation(api.tasks.create);
  const deferredQuery = useDeferredValue(query);
  const trimmed = deferredQuery.trim();

  const workspace = useQuery(api.workspaces.getForMe);
  const hits = useQuery(
    api.search.run,
    trimmed.length >= 2 ? { q: trimmed } : "skip",
  );

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const nav = useMemo(() => navEntries(workspace?.businessType), [workspace?.businessType]);

  // ---- Natural-language intents ----------------------------------------
  const taskMatch = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    if (!/^(?:create|add|new|make)?\s*(?:a|an|the)?\s*(?:task|to-?do|reminder)\b/i.test(q) &&
        !/^remind me\b/i.test(q) &&
        !/^add a task\b/i.test(q)) {
      return null;
    }
    const stripped = q
      .replace(/^(?:create|add|new|make)\s+(?:a|an|the)?\s*(?:task|to-?do|reminder)\s*(?:to|:|—|-)?\s*/i, "")
      .replace(/^remind me to\s+/i, "")
      .replace(/^(?:task|to-?do|reminder)\s*[:—-]\s*/i, "");
    const text = stripped.trim() || q;
    const parsed = parseTask(text);
    return parsed;
  }, [query]);

  const projectMatch = useMemo(() => {
    const q = query.trim();
    const m = /^(?:create|start|new|make)\s+(?:a|an|the)?\s*project(?:\s+(?:for|called|named|to))?\s*[:\-]?\s*(.*)$/i.exec(q);
    if (!m) return null;
    const name = (m[1] || "").replace(/^(?:the|my)\s+/i, "").trim();
    return name ? name : null;
  }, [query]);

  const askQuestion = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    const m = /^(?:ask\s*(?:ocivo)?[:,]?|ocivo[:,]?|ai[:,]?)\s+(.+)$/i.exec(q);
    if (m) return m[1].trim();
    return null;
  }, [query]);

  const close = () => onOpenChange(false);

  const handleCreateTask = async () => {
    if (!taskMatch) return;
    try {
      await createTask({
        title: taskMatch.title,
        dueDate: taskMatch.dueDate,
        dueTime: taskMatch.dueTime,
        priority: taskMatch.priority,
        source: "manual",
      });
      toast.success("Task created", {
        description: taskMatch.dueDate
          ? `${taskMatch.title} · ${relativeDayLabel(taskMatch.dueDate)}`
          : taskMatch.title,
      });
      close();
      navigate("/app/tasks");
    } catch (err) {
      toast.error("Could not create the task");
      console.error(err);
    }
  };

  const handleCreateProject = () => {
    if (!projectMatch) return;
    close();
    navigate(`/app/projects?new=${encodeURIComponent(projectMatch)}`);
  };

  const handleAsk = () => {
    if (!askQuestion) return;
    close();
    navigate(`/app/ai?q=${encodeURIComponent(askQuestion)}`);
  };

  const showNav = query.trim().length === 0;
  const navMatches = showNav
    ? nav
    : nav.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Command bar</DialogTitle>
        <DialogDescription>Search your workspace or run a natural-language command</DialogDescription>
      </DialogHeader>
      <DialogContent className="top-[14%] max-w-xl translate-y-0 overflow-hidden p-0 sm:top-[14%]">
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
      <CommandInput
        placeholder='Try: "Create a task to call John tomorrow at 10"'
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {taskMatch && (
          <>
            <CommandGroup heading="Create">
              <CommandItem
                value="__create_task"
                onSelect={handleCreateTask}
                className="cursor-pointer"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <ListChecks className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{taskMatch.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    New task
                    {taskMatch.dueDate
                      ? ` · ${relativeDayLabel(taskMatch.dueDate)}`
                      : " · no due date"}
                    {taskMatch.dueTime ? ` at ${taskMatch.dueTime}` : ""}
                  </span>
                </span>
                {taskMatch.priority === "high" && (
                  <Flag className="size-4 text-destructive" />
                )}
                <Kbd className="ml-2 hidden sm:block">↵</Kbd>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {projectMatch && (
          <>
            <CommandGroup heading="Create">
              <CommandItem value="__create_project" onSelect={handleCreateProject}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <Rocket className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  Create project <span className="font-medium">“{projectMatch}”</span>
                </span>
                <Kbd className="ml-2 hidden sm:block">↵</Kbd>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {askQuestion && (
          <>
            <CommandGroup heading="Ask OCIVO">
              <CommandItem value="__ask" onSelect={handleAsk}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-ai/15 text-ai-deep">
                  <Sparkles className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">{askQuestion}</span>
                <Kbd className="ml-2 hidden sm:block">↵</Kbd>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {hits && hits.length > 0 && (
          <>
            <CommandGroup heading="Search your workspace">
              {hits.slice(0, 8).map((hit) => {
                const Icon = HIT_ICONS[hit.kind] ?? Search;
                return (
                  <CommandItem
                    key={`${hit.kind}-${hit.id}`}
                    value={`hit-${hit.kind}-${hit.id}`}
                    onSelect={() => {
                      close();
                      navigate(hit.route);
                    }}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                    {hit.subtitle && (
                      <span className="ml-2 hidden max-w-40 truncate text-xs text-muted-foreground sm:block">
                        {hit.subtitle}
                      </span>
                    )}
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {hit.kind}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading={showNav ? "Navigate" : "Go to"}>
          {navMatches.map((entry) => {
            const Icon = entry.icon;
            return (
              <CommandItem
                key={entry.key}
                value={`nav-${entry.key}`}
                onSelect={() => {
                  close();
                  navigate(entry.to);
                }}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{entry.label}</span>
                <ChevronRight className="size-3.5 text-muted-foreground/60" />
              </CommandItem>
            );
          })}
        </CommandGroup>

        {query.trim().length >= 2 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="AI">
              <CommandItem value="__ask_any" onSelect={() => {
                close();
                navigate(`/app/ai?q=${encodeURIComponent(query.trim())}`);
              }}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-ai/15 text-ai-deep">
                  <Sparkles className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  Ask OCIVO about <span className="font-medium">“{query.trim()}”</span>
                </span>
              </CommandItem>
              <CommandItem value="__search_all" onSelect={() => {
                close();
                navigate(`/app/tasks`);
              }}>
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">Open tasks & projects</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {query.trim().length >= 2 && !hits?.length && (
          <>
            <CommandEmpty>
              <span className="flex items-center gap-2 text-muted-foreground">
                <CircleDashed className="size-4" />
                No exact matches — ask OCIVO instead.
              </span>
            </CommandEmpty>
          </>
        )}
      </CommandList>

      <div className="hidden items-center justify-between border-t border-border/70 px-4 py-2 text-xs text-muted-foreground sm:flex">
        <span className="flex items-center gap-2">
          <Link2 className="size-3.5" />
          {typeDisplay(workspace?.businessType)} workspace · {hits?.length ?? 0} results
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate <Kbd>↵</Kbd> select <Kbd>esc</Kbd> close
        </span>
      </div>
      </Command>
    </DialogContent>
    </Dialog>
  );
}
