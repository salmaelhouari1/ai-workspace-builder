import { BrandMark, Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { detectBusinessType, guessBusinessName, type BusinessType } from "@/lib/nlp";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const EXAMPLES = [
  "I'm a freelance graphic designer.",
  "I'm starting an e-commerce business.",
  "I'm building a SaaS startup.",
  "I'm a content creator.",
  "I run a small marketing agency.",
];

const TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "freelance", label: "Freelancer / solo" },
  { value: "ecommerce", label: "E-commerce / online store" },
  { value: "saas", label: "SaaS / startup" },
  { value: "creator", label: "Creator / content" },
  { value: "agency", label: "Agency / studio" },
  { value: "general", label: "Something else" },
];

const STAGES = ["Idea", "Getting started", "Running", "Growing"];
const TEAM_SIZES = ["Just me", "2–5", "6–10", "10+"];

const GENERATION_STEPS = [
  "Understanding your business...",
  "Designing your workspace...",
  "Creating your projects...",
  "Setting up your dashboard...",
  "Almost ready...",
];

const fadeSlide = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
};

export default function Onboarding() {
  const navigate = useNavigate();
  const createWorkspace = useMutation(api.workspaces.create);
  const existingWorkspace = useQuery(api.workspaces.getForMe);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("general");
  const [mainGoal, setMainGoal] = useState("");
  const [teamSize, setTeamSize] = useState(TEAM_SIZES[0]);
  const [stage, setStage] = useState(STAGES[1]);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  // Returning users with a workspace skip onboarding entirely
  // (unless we're mid-generation — step 3 owns its own navigation).
  useEffect(() => {
    if (existingWorkspace && step !== 3) navigate("/app", { replace: true });
  }, [existingWorkspace, step, navigate]);

  const detected = useMemo(() => detectBusinessType(prompt), [prompt]);

  const goStep2 = () => {
    const type = detected.type;
    setBusinessType(type);
    if (!name) {
      const guessed = guessBusinessName(prompt);
      if (guessed) setName(guessed);
    }
    setStep(2);
  };

  // Step 3: run the generation stage sequence + the real mutation.
  useEffect(() => {
    if (step !== 3) return;

    const interval = window.setInterval(() => {
      setStageIndex((i) => (i < GENERATION_STEPS.length - 1 ? i + 1 : i));
    }, 950);

    // The mutation runs exactly once, even under React StrictMode's double
    // effects; the stage animation may restart freely.
    if (!startedRef.current) {
      startedRef.current = true;
      (async () => {
        try {
          await createWorkspace({
            prompt: prompt.trim() || "A new business",
            name: name.trim() || undefined,
            businessType,
            mainGoal: mainGoal.trim() || undefined,
            teamSize,
            stage,
          });
          // Let the animation breathe even when generation is instant.
          await new Promise((r) => setTimeout(r, 950 * GENERATION_STEPS.length - 400));
          setStageIndex(GENERATION_STEPS.length - 1);
          await new Promise((r) => setTimeout(r, 700));
          toast.success("Your workspace is ready", {
            description: "Projects, tasks, goals and docs — built for you.",
          });
          navigate("/app", { replace: true });
        } catch (err) {
          console.error(err);
          if (err instanceof Error && /already have a workspace/i.test(err.message)) {
            navigate("/app", { replace: true });
            return;
          }
          setError("We couldn't build your workspace. Please try again.");
          startedRef.current = false;
        } finally {
          window.clearInterval(interval);
        }
      })();
    }

    return () => window.clearInterval(interval);
  }, [step, createWorkspace, prompt, name, businessType, mainGoal, teamSize, stage, navigate]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      {/* Ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_-10%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_85%_110%,color-mix(in_oklab,var(--ai)_12%,transparent),transparent)]"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <button className="flex items-center gap-2.5" onClick={() => navigate("/")}>
          <BrandMark className="size-8" />
          <Wordmark />
        </button>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                step >= s ? "w-8 bg-primary" : "w-4 bg-border",
              )}
            />
          ))}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col px-5 pb-16">
        <AnimatePresence mode="wait">
          {/* ---------------- Step 1: welcome ---------------- */}
          {step === 1 && (
            <motion.section key="s1" {...fadeSlide} className="mt-6 md:mt-12">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5 text-ai-deep" />
                Your workspace builds itself
              </span>
              <h1 className="mt-5 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
                What are you building?
              </h1>
              <p className="mt-3 max-w-xl text-base text-muted-foreground md:text-lg">
                Tell us about your business, project, or goal. We'll build your
                workspace around it.
              </p>

              <div className="mt-7 rounded-2xl border border-border/80 bg-card p-3 shadow-sm transition-shadow focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  placeholder="I'm starting a small online clothing business…"
                  className="w-full resize-none bg-transparent px-2 py-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground/60"
                />
                <div className="flex items-center justify-between border-t border-border/70 px-2 pt-3">
                  <span className="text-xs text-muted-foreground">
                    {prompt.trim().length > 0
                      ? "Looks good — continue when ready"
                      : "Plain language is perfect"}
                  </span>
                  <Button
                    onClick={goStep2}
                    disabled={prompt.trim().length < 3}
                    className="gap-2"
                  >
                    Continue
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>

              <p className="mt-6 text-sm font-medium text-muted-foreground">
                Or start from one of these:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    onClick={() => setPrompt(example)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                      prompt === example
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </motion.section>
          )}

          {/* ---------------- Step 2: essentials ---------------- */}
          {step === 2 && (
            <motion.section key="s2" {...fadeSlide} className="mt-6 md:mt-12">
              <h1 className="font-display text-3xl tracking-tight md:text-5xl">
                Just the essentials.
              </h1>
              <p className="mt-2 text-muted-foreground">
                Four quick answers — no settings labyrinth.
              </p>

              <div className="mt-8 grid gap-5 rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                <div className="grid gap-2">
                  <Label htmlFor="biz-name">Business / project name</Label>
                  <Input
                    id="biz-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Studio Verde"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Type of business</Label>
                  <Select
                    value={businessType}
                    onValueChange={(v) => setBusinessType(v as BusinessType)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                          {opt.value === detected.type && detected.type !== "general"
                            ? " · suggested"
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="goal">Main goal right now</Label>
                  <Input
                    id="goal"
                    value={mainGoal}
                    onChange={(e) => setMainGoal(e.target.value)}
                    placeholder="e.g. Get3 clients this month / launch next month"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Number of people</Label>
                    <div className="flex flex-wrap gap-2">
                      {TEAM_SIZES.map((size) => (
                        <button
                          key={size}
                          onClick={() => setTeamSize(size)}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                            teamSize === size
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/80 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Current stage</Label>
                    <div className="flex flex-wrap gap-2">
                      {STAGES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setStage(s)}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                            stage === s
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/80 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <Button variant="ghost" className="gap-2" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" />
                  Back
                </Button>
                <Button
                  className="gap-2"
                  onClick={() => setStep(3)}
                  disabled={name.trim().length < 2 && prompt.trim().length < 3}
                >
                  <Wand2 className="size-4" />
                  Build my workspace
                </Button>
              </div>
            </motion.section>
          )}

          {/* ---------------- Step 3: generation ---------------- */}
          {step === 3 && (
            <motion.section key="s3" {...fadeSlide} className="mt-16 flex flex-col items-center text-center">
              <div className="relative flex size-20 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
                <span className="relative flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
                  <Sparkles className="size-7 animate-pulse" />
                </span>
              </div>

              <h1 className="mt-8 font-display text-3xl tracking-tight md:text-4xl">
                Building your workspace
              </h1>

              <ul className="mt-8 w-full max-w-sm space-y-3 text-left">
                {GENERATION_STEPS.map((label, i) => {
                  const done = i < stageIndex;
                  const active = i === stageIndex;
                  return (
                    <li
                      key={label}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-300",
                        done && "border-primary/25 bg-primary/5 text-foreground",
                        active && "border-border/80 bg-card shadow-sm",
                        !done && !active && "border-transparent text-muted-foreground/50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border",
                          done
                            ? "border-primary bg-primary text-primary-foreground"
                            : active
                              ? "border-primary/40"
                              : "border-border",
                        )}
                      >
                        {done ? (
                          <Check className="size-3" />
                        ) : active ? (
                          <Loader2 className="size-3 animate-spin text-primary" />
                        ) : null}
                      </span>
                      {label}
                    </li>
                  );
                })}
              </ul>

              {error && (
                <div className="mt-6 max-w-sm">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => {
                      setError(null);
                      setStageIndex(0);
                      setStep(2);
                    }}
                  >
                    Try again
                  </Button>
                </div>
              )}

              <p className="mt-8 max-w-md text-sm text-muted-foreground">
                OCIVO is creating projects, tasks, goals and documents based on
                what you told it — you can change everything afterwards.
              </p>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
