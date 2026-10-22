/**
 * Workspace generation engine — the heart of "your workspace builds itself".
 *
 * Given what the user is building, this returns the full structure OCIVO
 * creates for them: projects with tasks, goals, documents and the adaptive
 * module list. Everything is seeded with real due dates so the very first
 * Home screen has genuine priorities, not lorem ipsum.
 *
 * The structure is deterministic (fast, always works); the AI layer
 * personalises it further in ai.ts when the gateway is available.
 */

import type { BusinessType } from "../../lib/nlp";
import { DAY_MS, localDayStart } from "../../lib/nlp";

export interface SeedTask {
  title: string;
  /** Days from today. */
  dueIn?: number;
  dueTime?: string;
  priority?: "low" | "medium" | "high";
  status?: "todo" | "in_progress" | "done";
  reason?: string;
  tags?: string[];
  description?: string;
}

export interface SeedProject {
  name: string;
  description?: string;
  status?: "planned" | "active";
  priority?: "low" | "medium" | "high";
  deadlineIn?: number;
  tasks: SeedTask[];
}

export interface SeedGoal {
  title: string;
  description?: string;
  target?: number;
  current?: number;
  unit?: string;
  deadlineIn?: number;
}

export interface SeedDocument {
  title: string;
  category: string;
  content: string;
}

export interface WorkspaceSeed {
  modules: string[];
  projects: SeedProject[];
  goals: SeedGoal[];
  documents: SeedDocument[];
}

export const ALL_MODULES = [
  "home",
  "inbox",
  "tasks",
  "projects",
  "documents",
  "goals",
  "ai",
  "settings",
];

export interface SeedInput {
  name: string;
  businessType: BusinessType;
  prompt: string;
  mainGoal?: string;
  stage?: string;
}

function overviewDoc(input: SeedInput, body: string): SeedDocument {
  const goal = input.mainGoal?.trim();
  return {
    title: "Business overview",
    category: "Overview",
    content: [
      `# ${input.name}`,
      "",
      body,
      "",
      goal ? `## Main goal\n${goal}` : "",
      input.stage ? `## Stage\n${input.stage}` : "",
      "> [!ai] This page was written by OCIVO from what you described. Edit it freely — it's the source of truth your assistant reads.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

const CONTENT_TASK_REASON = "content-nothing-scheduled";

/** The three canonical priority reasons from the product spec. */
export const FOLLOW_UP_REASON = "Your last follow-up was 4 days ago.";
export const NOTHING_SCHEDULED_REASON = CONTENT_TASK_REASON;

// ---------------------------------------------------------------------------
// Per-business-type structures
// ---------------------------------------------------------------------------

function seedFor(input: SeedInput): WorkspaceSeed {
  switch (input.businessType) {
    case "freelance":
      return {
        modules: ALL_MODULES,
        projects: [
          {
            name: "Client work",
            description:
              "Deliverables for current clients — keep these moving first.",
            status: "active",
            priority: "high",
            tasks: [
              {
                title: "Finish current client deliverable",
                dueIn: 1,
                priority: "high",
                status: "in_progress",
              },
              {
                title: "Send proposal to warm lead",
                dueIn: 0,
                priority: "high",
                reason: FOLLOW_UP_REASON,
              },
              {
                title: "Follow up with 3 leads",
                dueIn: 0,
                priority: "high",
                reason: FOLLOW_UP_REASON,
              },
              {
                title: "Invoice this month's clients",
                dueIn: 4,
                priority: "medium",
              },
            ],
          },
          {
            name: "Portfolio refresh",
            description:
              "Show your best work so new clients find you easy to say yes to.",
            status: "active",
            priority: "medium",
            deadlineIn: 21,
            tasks: [
              {
                title: "Finish landing page",
                dueIn: 1,
                priority: "high",
                status: "in_progress",
              },
              {
                title: "Publish 2 new case studies",
                dueIn: 7,
                priority: "medium",
              },
              {
                title: "Update services & pricing page",
                dueIn: 10,
                priority: "low",
              },
            ],
          },
          {
            name: "Get more clients",
            description: "Outbound + content that keeps your pipeline full.",
            status: "active",
            priority: "medium",
            tasks: [
              {
                title: "Prepare tomorrow's content",
                reason: CONTENT_TASK_REASON,
                tags: ["content"],
              },
              { title: "Message 3 warm leads", dueIn: 2, priority: "high" },
              {
                title: "Ask 2 happy clients for a testimonial",
                dueIn: 5,
                priority: "low",
              },
            ],
          },
        ],
        goals: [
          {
            title: "Get 3 new clients this month",
            target: 3,
            current: 1,
            unit: "clients",
            deadlineIn: 24,
          },
          {
            title: "Finish current projects",
            target: 3,
            current: 1,
            unit: "projects",
            deadlineIn: 30,
          },
        ],
        documents: [
          overviewDoc(
            input,
            "A solo service business serving clients end to end: proposals, delivery, and follow-up.",
          ),
          {
            title: "Services & pricing",
            category: "Services",
            content:
              '# Services & pricing\n\n- [ ] Define your core offer\n- [ ] Write a one-paragraph pitch\n- [ ] Set a floor price you never go below\n\n> [!ai] Ask OCIVO: "turn my services into a proposal template."',
          },
          {
            title: "Meeting notes",
            category: "Notes",
            content:
              "# Meeting notes\n\nCapture calls here — or dump them in the Inbox and let OCIVO split them into tasks.",
          },
        ],
      };

    case "ecommerce":
      return {
        modules: ALL_MODULES,
        projects: [
          {
            name: "Product launch",
            description:
              "Everything needed to launch the new collection next month.",
            status: "active",
            priority: "high",
            deadlineIn: 30,
            tasks: [
              {
                title: "Finish the landing page",
                dueIn: 1,
                priority: "high",
                status: "in_progress",
              },
              { title: "Shoot product photos", dueIn: 4, priority: "high" },
              {
                title: "Write product descriptions",
                dueIn: 6,
                priority: "medium",
              },
              {
                title: "Set up inventory tracking",
                dueIn: 8,
                priority: "medium",
              },
              {
                title: "Build the launch checklist",
                dueIn: 3,
                priority: "high",
              },
              {
                title: "Plan launch marketing campaign",
                dueIn: 10,
                priority: "medium",
              },
              {
                title: "Prepare email announcement",
                dueIn: 14,
                priority: "low",
              },
              { title: "Define launch KPIs", dueIn: 5, priority: "medium" },
            ],
          },
          {
            name: "Marketing & content",
            description: "Keep the channels alive between launches.",
            status: "active",
            priority: "medium",
            tasks: [
              {
                title: "Prepare tomorrow's content",
                reason: CONTENT_TASK_REASON,
                tags: ["content"],
              },
              {
                title: "Publish Instagram post",
                dueIn: 2,
                priority: "medium",
                tags: ["content"],
              },
              {
                title: "Reply to customer comments",
                dueIn: 0,
                priority: "medium",
              },
            ],
          },
          {
            name: "Store operations",
            description: "Orders, shipping, support — the daily machine.",
            status: "active",
            priority: "medium",
            tasks: [
              {
                title: "Follow up with 3 leads",
                dueIn: 0,
                priority: "high",
                reason: FOLLOW_UP_REASON,
              },
              {
                title: "Review weekly sales numbers",
                dueIn: 3,
                priority: "medium",
              },
              {
                title: "Restock best-selling sizes",
                dueIn: 7,
                priority: "medium",
              },
            ],
          },
        ],
        goals: [
          {
            title: "Reach €10,000 revenue by December",
            target: 10000,
            current: 6400,
            unit: "€",
            deadlineIn: 60,
          },
          {
            title: "Launch the new collection",
            target: 100,
            current: 35,
            unit: "%",
            deadlineIn: 30,
          },
        ],
        documents: [
          overviewDoc(
            input,
            "An online store selling physical products, driven by launches and consistent content.",
          ),
          {
            title: "Product catalog",
            category: "Products",
            content:
              "# Product catalog\n\n| Product | Price | Cost | Status |\n| --- | --- | --- | --- |\n| — | — | — | Draft |\n\n- [ ] Add your first product\n- [ ] Set price and margin\n- [ ] Upload photos",
          },
          {
            title: "Processes / SOPs",
            category: "Processes",
            content:
              "# Processes / SOPs\n\n## Order fulfilment\n1. Pick & pack\n2. Add tracking\n3. Send shipping email\n\n## Customer support\n- Reply within 24h\n- Refund policy: 14 days",
          },
        ],
      };

    case "saas":
      return {
        modules: ALL_MODULES,
        projects: [
          {
            name: "Build the MVP",
            description: "The smallest product that solves the core problem.",
            status: "active",
            priority: "high",
            deadlineIn: 45,
            tasks: [
              {
                title: "Finish the landing page",
                dueIn: 1,
                priority: "high",
                status: "in_progress",
              },
              {
                title: "Define the onboarding flow",
                dueIn: 3,
                priority: "high",
              },
              {
                title: "Ship the first core feature",
                dueIn: 10,
                priority: "high",
              },
              {
                title: "Set up feedback collection",
                dueIn: 7,
                priority: "medium",
              },
            ],
          },
          {
            name: "Launch plan",
            description: "From private beta to first public announcement.",
            status: "planned",
            priority: "medium",
            tasks: [
              {
                title: "Prepare tomorrow's content",
                reason: CONTENT_TASK_REASON,
                tags: ["content"],
              },
              {
                title: "Write launch announcement",
                dueIn: 12,
                priority: "medium",
                tags: ["content"],
              },
              { title: "Line up 5 beta testers", dueIn: 5, priority: "high" },
            ],
          },
          {
            name: "Talk to users",
            description:
              "Interviews, feedback, and the follow-ups they create.",
            status: "active",
            priority: "medium",
            tasks: [
              {
                title: "Follow up with 3 leads",
                dueIn: 0,
                priority: "high",
                reason: FOLLOW_UP_REASON,
              },
              {
                title: "Book 3 customer interviews",
                dueIn: 6,
                priority: "medium",
              },
            ],
          },
        ],
        goals: [
          {
            title: "Reach 100 signups",
            target: 100,
            current: 34,
            unit: "users",
            deadlineIn: 60,
          },
          {
            title: "Ship the MVP",
            target: 100,
            current: 40,
            unit: "%",
            deadlineIn: 45,
          },
        ],
        documents: [
          overviewDoc(
            input,
            "A software product solving one painful problem for a focused audience.",
          ),
          {
            title: "Product roadmap",
            category: "Product",
            content:
              "# Product roadmap\n\n## Now\n- Core flow\n- Landing page\n\n## Next\n- Onboarding\n- Integrations\n\n## Later\n- Team features",
          },
          {
            title: "User interview notes",
            category: "Notes",
            content:
              "# User interview notes\n\nPaste raw notes in the Inbox — OCIVO will split them into tasks and decisions.",
          },
        ],
      };

    case "creator":
      return {
        modules: ALL_MODULES,
        projects: [
          {
            name: "Content calendar",
            description: "What ships, where, and when.",
            status: "active",
            priority: "high",
            tasks: [
              {
                title: "Prepare tomorrow's content",
                dueIn: 1,
                priority: "high",
                reason: CONTENT_TASK_REASON,
                tags: ["content"],
              },
              {
                title: "Batch-record this week's videos",
                dueIn: 3,
                priority: "high",
                tags: ["content"],
              },
              {
                title: "Write newsletter draft",
                dueIn: 4,
                priority: "medium",
                tags: ["content"],
              },
            ],
          },
          {
            name: "Grow the audience",
            description: "Consistent distribution and collaborations.",
            status: "active",
            priority: "medium",
            tasks: [
              {
                title: "Follow up with 3 leads",
                dueIn: 0,
                priority: "medium",
                reason: FOLLOW_UP_REASON,
                description:
                  "Brand collabs and partnerships waiting for a reply.",
              },
              {
                title: "Pitch 2 collaboration ideas",
                dueIn: 5,
                priority: "medium",
              },
              {
                title: "Repurpose top post into a short",
                dueIn: 2,
                priority: "low",
                tags: ["content"],
              },
            ],
          },
          {
            name: "Monetise",
            description: "Products, sponsors, memberships.",
            status: "planned",
            priority: "low",
            tasks: [
              {
                title: "List 3 sponsorship opportunities",
                dueIn: 7,
                priority: "medium",
              },
              {
                title: "Sketch the first digital product",
                dueIn: 14,
                priority: "low",
              },
            ],
          },
        ],
        goals: [
          {
            title: "Reach10,000 followers",
            target: 10000,
            current: 6400,
            unit: "followers",
            deadlineIn: 90,
          },
          {
            title: "Publish 3x per week",
            target: 12,
            current: 5,
            unit: "posts",
            deadlineIn: 28,
          },
        ],
        documents: [
          overviewDoc(
            input,
            "A creator business built on a consistent publishing rhythm and a loyal audience.",
          ),
          {
            title: "Content pillars",
            category: "Content",
            content:
              '# Content pillars\n\n1. Education — teach the craft\n2. Behind the scenes — build trust\n3. Offers — drive revenue\n\n> [!ai] Ask OCIVO: "create a content calendar for next month."',
          },
        ],
      };

    case "agency":
      return {
        modules: ALL_MODULES,
        projects: [
          {
            name: "Client delivery",
            description: "Active retainers and one-off projects.",
            status: "active",
            priority: "high",
            tasks: [
              {
                title: "Finish the landing page",
                dueIn: 1,
                priority: "high",
                status: "in_progress",
              },
              {
                title: "Send monthly client reports",
                dueIn: 3,
                priority: "high",
              },
              {
                title: "Review campaign results",
                dueIn: 5,
                priority: "medium",
              },
            ],
          },
          {
            name: "Lead pipeline",
            description: "Turn interest into signed retainers.",
            status: "active",
            priority: "high",
            tasks: [
              {
                title: "Follow up with 3 leads",
                dueIn: 0,
                priority: "high",
                reason: FOLLOW_UP_REASON,
              },
              { title: "Send 2 proposals out", dueIn: 2, priority: "high" },
              { title: "Qualify new inquiries", dueIn: 1, priority: "medium" },
            ],
          },
          {
            name: "Agency marketing",
            description: "Our own content — the hardest one to keep up with.",
            status: "active",
            priority: "medium",
            tasks: [
              {
                title: "Prepare tomorrow's content",
                reason: CONTENT_TASK_REASON,
                tags: ["content"],
              },
              {
                title: "Publish case study",
                dueIn: 8,
                priority: "medium",
                tags: ["content"],
              },
            ],
          },
        ],
        goals: [
          {
            title: "Sign 2 new retainers this month",
            target: 2,
            current: 0,
            unit: "retainers",
            deadlineIn: 24,
          },
          {
            title: "Reach €20,000 monthly revenue",
            target: 20000,
            current: 14500,
            unit: "€",
            deadlineIn: 45,
          },
        ],
        documents: [
          overviewDoc(
            input,
            "A small team delivering marketing outcomes for a roster of clients.",
          ),
          {
            title: "Client onboarding SOP",
            category: "Processes",
            content:
              "# Client onboarding SOP\n\n1. Kickoff call\n2. Access & assets checklist\n3. 30-60-90 day plan\n4. First report scheduled\n\n- [ ] Kickoff template\n- [ ] Reporting template",
          },
        ],
      };

    case "general":
    default:
      return {
        modules: ALL_MODULES,
        projects: [
          {
            name: "Make it real",
            description:
              "The first concrete steps from idea to something people can use.",
            status: "active",
            priority: "high",
            deadlineIn: 30,
            tasks: [
              {
                title: "Follow up with 3 leads",
                dueIn: 0,
                priority: "high",
                reason: FOLLOW_UP_REASON,
              },
              {
                title: "Finish the landing page",
                dueIn: 1,
                priority: "high",
                status: "in_progress",
              },
              {
                title: "Talk to 5 potential customers",
                dueIn: 7,
                priority: "high",
              },
              { title: "Define the first offer", dueIn: 4, priority: "medium" },
            ],
          },
          {
            name: "Marketing & content",
            description: "How people will hear about you.",
            status: "active",
            priority: "medium",
            tasks: [
              {
                title: "Prepare tomorrow's content",
                reason: CONTENT_TASK_REASON,
                tags: ["content"],
              },
              {
                title: "Set up social profiles",
                dueIn: 3,
                priority: "medium",
                tags: ["content"],
              },
              {
                title: "Write your origin story post",
                dueIn: 6,
                priority: "low",
                tags: ["content"],
              },
            ],
          },
          {
            name: "Organise the basics",
            description:
              "The boring foundation that keeps everything else sane.",
            status: "active",
            priority: "low",
            tasks: [
              {
                title: "Write the business overview",
                dueIn: 2,
                priority: "medium",
              },
              {
                title: "Set a weekly review ritual",
                dueIn: 7,
                priority: "low",
              },
            ],
          },
        ],
        goals: [
          {
            title: "Reach €10,000 revenue",
            target: 10000,
            current: 6400,
            unit: "€",
            deadlineIn: 60,
          },
          {
            title: "Get first 10 customers",
            target: 10,
            current: 3,
            unit: "customers",
            deadlineIn: 45,
          },
        ],
        documents: [
          overviewDoc(
            input,
            "A new venture described in your own words — OCIVO built the structure around it.",
          ),
          {
            title: "Ideas & notes",
            category: "Notes",
            content:
              "# Ideas & notes\n\nDump anything here or in the Inbox. OCIVO will turn the important parts into tasks and projects.",
          },
          {
            title: "Important metrics",
            category: "Metrics",
            content:
              "# Important metrics\n\n| Metric | This week | Goal |\n| --- | --- | --- |\n| Revenue | — | — |\n| New leads | — | — |\n| Tasks completed | — | — |",
          },
        ],
      };
  }
}

export function buildSeed(input: SeedInput): WorkspaceSeed {
  const seed = seedFor(input);

  // Personalise: if the user named a project-relevant focus in their goal,
  // make sure it shows up as its own project so Home feels like *their* space.
  const goal = input.mainGoal?.trim();
  if (goal && goal.length > 3 && goal.length < 60) {
    const already = seed.projects.some((p) =>
      p.name.toLowerCase().includes(goal.toLowerCase().slice(0, 18)),
    );
    if (!already) {
      seed.projects.push({
        name: goal.charAt(0).toUpperCase() + goal.slice(1),
        description: "Created from the main goal you set during onboarding.",
        status: "planned",
        priority: "medium",
        tasks: [
          {
            title: "Break this goal into weekly steps",
            dueIn: 3,
            priority: "medium",
          },
          {
            title: 'Define what "done" looks like',
            dueIn: 2,
            priority: "medium",
          },
        ],
      });
    }
  }
  return seed;
}

/** Absolute due-date timestamp for a seed task, relative to "now". */
export function seedDayStart(dueIn?: number): number | undefined {
  if (dueIn === undefined) return undefined;
  return localDayStart(new Date()) + dueIn * DAY_MS;
}
