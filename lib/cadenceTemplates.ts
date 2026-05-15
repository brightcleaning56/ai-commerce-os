/**
 * Cadence templates store (slice 44).
 *
 * Slice 36 shipped 3 hardcoded templates as a client-side constant
 * inside /cadences/page.tsx. Operators couldn't add their own
 * without a code change.
 *
 * This module is the server-side store + helpers. The /cadences
 * builder reads from /api/cadences/templates which merges the
 * built-in seed templates with any operator-created custom ones.
 *
 * Custom templates have id "tpl_<random>"; built-in seeds use
 * stable ids ("b2b-3-touch", "supplier-revival", "buyer-onboarding").
 *
 * Node-only.
 */
import crypto from "node:crypto";
import { getBackend } from "./store";
import type { QueueChannel } from "./queue";

const TEMPLATES_FILE = "cadence-templates.json";
const MAX_RETAINED = 200;

export type TemplateBranch = { ifOutcome: string; gotoIndex: number };

export type TemplateStep = {
  channel: QueueChannel;
  delayHours: number;
  label?: string;
  subject?: string;
  bodyTemplate?: string;
  branches?: TemplateBranch[];
  maxRetries?: number;
  retryDelayMinutes?: number;
};

export type CadenceTemplate = {
  id: string;
  name: string;
  description: string;
  cadenceName: string;
  cadenceDescription: string;
  steps: TemplateStep[];
  /** "seed" = built-in (hardcoded below). "custom" = operator-created. */
  source: "seed" | "custom";
  createdAt?: string;
  createdBy?: string;
};

// ─── Seed templates (mirror the slice 36 client-side gallery) ─────

const SEED_TEMPLATES: CadenceTemplate[] = [
  {
    id: "b2b-3-touch",
    name: "B2B intro · 3-touch",
    description: "Email today → call in 3 days → SMS nudge in 5. Conservative.",
    cadenceName: "B2B intro · 3-touch",
    cadenceDescription: "Standard B2B intro sequence. First-touch email, follow-up call, then SMS nudge.",
    source: "seed",
    steps: [
      {
        channel: "email", delayHours: 0, label: "Day 1 — intro",
        subject: "Quick intro for {{company}}",
        bodyTemplate:
          "Hi {{name}},\n\nNoticed {{company}} has been growing in your category. We've got a product mix that could fit -- happy to send a one-pager or hop on a 15-min call.\n\nWhich works?",
        branches: [{ ifOutcome: "replied", gotoIndex: -1 }],
        maxRetries: 2, retryDelayMinutes: 60,
      },
      {
        channel: "call", delayHours: 48, label: "Day 3 — call",
        branches: [{ ifOutcome: "voicemail", gotoIndex: 2 }, { ifOutcome: "wrong-number", gotoIndex: -1 }],
      },
      {
        channel: "sms", delayHours: 48, label: "Day 5 — SMS nudge",
        bodyTemplate: "Hey {{name}} — left you a voicemail Tue. Easier to text? Quick yes/no on whether to send the one-pager.",
        maxRetries: 1, retryDelayMinutes: 30,
      },
    ],
  },
  {
    id: "supplier-revival",
    name: "Supplier revival · 4-touch",
    description: "Bring back lapsed suppliers. Personalized + escalation.",
    cadenceName: "Supplier revival",
    cadenceDescription: "Re-engage suppliers who haven't shipped in 90+ days. Soft -> hard escalation.",
    source: "seed",
    steps: [
      {
        channel: "email", delayHours: 0, label: "Day 1 — friendly check-in",
        subject: "Long time, {{name}} — anything new at {{company}}?",
        bodyTemplate:
          "Hi {{name}},\n\nIt's been a while since we worked together. Curious what's been happening at {{company}} -- new product lines? Capacity changes?\n\nWe've got a couple of buyers asking about your category lately. Worth a 15-min catch-up?",
        branches: [{ ifOutcome: "replied", gotoIndex: -1 }],
        maxRetries: 2, retryDelayMinutes: 60,
      },
      {
        channel: "email", delayHours: 120, label: "Day 6 — concrete offer",
        subject: "Two buyers in your category looking right now",
        bodyTemplate:
          "Hi {{name}},\n\nDidn't hear back -- thought I'd send something concrete. Two of our active buyers are sourcing in your category this month. If you've got capacity I can intro you.\n\nReply with a yes and I'll send their briefs.",
        branches: [{ ifOutcome: "replied", gotoIndex: -1 }],
        maxRetries: 2, retryDelayMinutes: 60,
      },
      {
        channel: "call", delayHours: 120, label: "Day 11 — call",
        branches: [{ ifOutcome: "voicemail", gotoIndex: 3 }],
      },
      {
        channel: "sms", delayHours: 48, label: "Day 13 — final nudge",
        bodyTemplate: "Hey {{name}} -- quick text. Still interested in working with {{company}} on AVYN buyers? Yes/no is plenty.",
        maxRetries: 1, retryDelayMinutes: 30,
      },
    ],
  },
  {
    id: "buyer-onboarding",
    name: "Buyer onboarding · 5-touch",
    description: "Activate new buyers in their first 14 days.",
    cadenceName: "Buyer onboarding",
    cadenceDescription: "Help fresh buyers complete their first transaction. Day 1 welcome, day 7 check-in, day 14 escalation.",
    source: "seed",
    steps: [
      {
        channel: "email", delayHours: 0, label: "Day 1 — welcome",
        subject: "Welcome to AVYN, {{name}}",
        bodyTemplate:
          "Hi {{name}},\n\nWelcome aboard. {{company}} is now in our verified buyer network.\n\nThree quick wins to get you to your first transaction:\n1. Set your sourcing preferences -- /onboarding/buyer\n2. Browse trending products -- /products\n3. Use the marketplace search -- /marketplace\n\nQuestions? Just reply.",
        maxRetries: 2, retryDelayMinutes: 60,
      },
      {
        channel: "email", delayHours: 72, label: "Day 4 — first product picks",
        subject: "3 products trending in your industry this week",
        bodyTemplate:
          "Hi {{name}},\n\nBased on your industry preferences, three products are trending hard right now. I picked three suppliers worth a look.\n\nReply 'send' if you want me to make warm intros.",
        branches: [{ ifOutcome: "replied", gotoIndex: -1 }],
        maxRetries: 2, retryDelayMinutes: 60,
      },
      {
        channel: "call", delayHours: 168, label: "Day 11 — onboarding call",
        branches: [{ ifOutcome: "voicemail", gotoIndex: 3 }],
      },
      {
        channel: "sms", delayHours: 48, label: "Day 13 — quick check",
        bodyTemplate: "Hi {{name}} -- {{company}} hasn't placed a first order yet. Anything blocking? Reply or grab 15 min.",
        maxRetries: 1, retryDelayMinutes: 30,
      },
      {
        channel: "email", delayHours: 72, label: "Day 16 — final",
        subject: "Still looking for the right fit?",
        bodyTemplate:
          "Hi {{name}},\n\nLast email from me. If {{company}} is still figuring out the right supplier match, here's the easiest next step: reply with the SKU or category, I'll have a verified supplier ready to talk by tomorrow.\n\nIf timing isn't right, no worries.",
        maxRetries: 2, retryDelayMinutes: 60,
      },
    ],
  },
];

// ─── Store ──────────────────────────────────────────────────────────

function isTemplate(v: unknown): v is CadenceTemplate {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<CadenceTemplate>;
  return typeof t.id === "string" && typeof t.name === "string" && Array.isArray(t.steps);
}

export const cadenceTemplatesStore = {
  /**
   * Returns seed + custom templates merged. Seeds first (consistent
   * order), then customs newest-first.
   */
  async list(): Promise<CadenceTemplate[]> {
    const customs = (await getBackend().read<CadenceTemplate[]>(TEMPLATES_FILE, []))
      .filter(isTemplate)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return [...SEED_TEMPLATES, ...customs];
  },

  async get(id: string): Promise<CadenceTemplate | null> {
    return (await cadenceTemplatesStore.list()).find((t) => t.id === id) ?? null;
  },

  async create(input: {
    name: string;
    description: string;
    cadenceName: string;
    cadenceDescription: string;
    steps: TemplateStep[];
    createdBy?: string;
  }): Promise<CadenceTemplate> {
    if (!input.name?.trim()) throw new Error("name required");
    if (!Array.isArray(input.steps) || input.steps.length === 0) {
      throw new Error("steps required");
    }
    const template: CadenceTemplate = {
      id: `tpl_${crypto.randomBytes(6).toString("hex")}`,
      name: input.name.trim().slice(0, 120),
      description: input.description?.trim().slice(0, 200) ?? "",
      cadenceName: input.cadenceName?.trim().slice(0, 120) ?? input.name,
      cadenceDescription: input.cadenceDescription?.trim().slice(0, 500) ?? "",
      steps: input.steps,
      source: "custom",
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
    };
    const customs = (await getBackend().read<CadenceTemplate[]>(TEMPLATES_FILE, [])).filter(isTemplate);
    const next = [template, ...customs].slice(0, MAX_RETAINED);
    await getBackend().write(TEMPLATES_FILE, next);
    return template;
  },

  async remove(id: string): Promise<boolean> {
    // Seeds aren't removable
    if (SEED_TEMPLATES.some((t) => t.id === id)) {
      throw new Error("Built-in seed templates can't be removed");
    }
    const customs = (await getBackend().read<CadenceTemplate[]>(TEMPLATES_FILE, [])).filter(isTemplate);
    const next = customs.filter((t) => t.id !== id);
    if (next.length === customs.length) return false;
    await getBackend().write(TEMPLATES_FILE, next);
    return true;
  },
};
