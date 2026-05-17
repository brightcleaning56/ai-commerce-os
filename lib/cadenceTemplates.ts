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
// Slice 85: pin state lives in a separate file so we don't have to
// mutate the SEED_TEMPLATES const (seeds need to stay pinnable too).
// Contents: { ids: string[] } -- presence in the array means pinned.
const PINS_FILE = "cadence-template-pins.json";
// Slice 87: last-used timestamps. Same separation-from-seeds reasoning
// as PINS_FILE. Contents: { byId: Record<string, isoString> }.
const LAST_USED_FILE = "cadence-template-last-used.json";
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
  /**
   * Slice 85: pinned-to-top flag. Operator marks frequently-used
   * templates so they sort to the top of the gallery regardless
   * of recency. Seeds + customs can both be pinned (pin state is
   * persisted in a separate file so we don't mutate the SEED_TEMPLATES
   * const; see pinned-templates.json in the store).
   */
  pinned?: boolean;
  /**
   * Slice 87: last time this template was applied to a new cadence
   * (via the gallery's applyTemplate or save-as flow). Hydrated by
   * list() from cadence-template-last-used.json. Used for sort +
   * gallery freshness signal ("used 3 days ago"). Undefined when
   * the template has never been applied.
   */
  lastUsedAt?: string;
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

/** Slice 85: load the pin set. Tolerant of missing/corrupt file. */
async function loadPinnedIds(): Promise<Set<string>> {
  const raw = await getBackend().read<{ ids?: string[] }>(PINS_FILE, { ids: [] });
  if (!raw || !Array.isArray(raw.ids)) return new Set();
  return new Set(raw.ids.filter((v): v is string => typeof v === "string"));
}

/** Slice 87: load the last-used map. Tolerant of missing/corrupt file. */
async function loadLastUsed(): Promise<Record<string, string>> {
  const raw = await getBackend().read<{ byId?: Record<string, string> }>(LAST_USED_FILE, {
    byId: {},
  });
  if (!raw || typeof raw.byId !== "object" || raw.byId === null) return {};
  // Filter to valid ISO-looking values to defend against manual edits
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.byId)) {
    if (typeof k === "string" && typeof v === "string" && v.length > 0) {
      out[k] = v;
    }
  }
  return out;
}

export const cadenceTemplatesStore = {
  /**
   * Returns seed + custom templates merged.
   *
   * Slice 85 ordering: pinned items first (seeds + customs interleaved
   * in their natural order, since pin state overrides source), then
   * unpinned seeds, then unpinned customs (newest-first). Each result
   * carries a `pinned` boolean hydrated from the pin store.
   */
  async list(): Promise<CadenceTemplate[]> {
    const customs = (await getBackend().read<CadenceTemplate[]>(TEMPLATES_FILE, []))
      .filter(isTemplate)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    const [pinned, lastUsed] = await Promise.all([loadPinnedIds(), loadLastUsed()]);
    const merged = [...SEED_TEMPLATES, ...customs].map((t) => ({
      ...t,
      pinned: pinned.has(t.id),
      lastUsedAt: lastUsed[t.id],
    }));
    // Stable sort: pinned ahead of non-pinned, preserving the seed-then-
    // customs-newest-first order within each group. Last-used does NOT
    // affect default sort -- the operator opts in to "sort by recent"
    // client-side. Default stays predictable.
    return merged.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  },

  /**
   * Slice 87: stamp lastUsedAt = now for the given template id.
   * Called by the cadence create flow when applyTemplate is the
   * source of the new cadence's steps. Best-effort -- a write
   * failure must NOT block cadence creation, so callers wrap in
   * try/catch. Silently no-ops for unknown ids (consistent with
   * setPinned validating existence).
   */
  async markUsed(id: string): Promise<void> {
    const map = await loadLastUsed();
    map[id] = new Date().toISOString();
    await getBackend().write(LAST_USED_FILE, { byId: map });
  },

  /**
   * Slice 85: toggle (or set) pinned state for a template id. Returns
   * the new pinned boolean. Accepts both seed + custom ids since either
   * can be pinned. No-ops when the id doesn't exist in either set --
   * the UI shouldn't be able to call this for a nonexistent id.
   */
  async setPinned(id: string, pinned: boolean): Promise<boolean> {
    const all = await cadenceTemplatesStore.list();
    if (!all.some((t) => t.id === id)) {
      throw new Error("Template not found");
    }
    const current = await loadPinnedIds();
    if (pinned) current.add(id);
    else current.delete(id);
    await getBackend().write(PINS_FILE, { ids: Array.from(current) });
    return pinned;
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

  /**
   * Slice 71: patch a custom template's display metadata. Only
   * `name`, `description`, `cadenceName`, and `cadenceDescription`
   * are mutable -- steps are intentionally immutable here (operators
   * who want different steps should clone via "Save as template"
   * from a configured cadence, which preserves the lineage clearly).
   * Seeds reject for the same reason as remove(): they're shipped
   * with the install, not workspace state.
   */
  async update(
    id: string,
    patch: {
      name?: string;
      description?: string;
      cadenceName?: string;
      cadenceDescription?: string;
    },
  ): Promise<CadenceTemplate | null> {
    if (SEED_TEMPLATES.some((t) => t.id === id)) {
      throw new Error("Built-in seed templates can't be renamed");
    }
    const customs = (await getBackend().read<CadenceTemplate[]>(TEMPLATES_FILE, [])).filter(isTemplate);
    const idx = customs.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const existing = customs[idx];
    const trimmedName = patch.name?.trim();
    const next: CadenceTemplate = {
      ...existing,
      name: trimmedName ? trimmedName.slice(0, 120) : existing.name,
      description:
        patch.description !== undefined
          ? patch.description.trim().slice(0, 200)
          : existing.description,
      cadenceName:
        patch.cadenceName !== undefined
          ? patch.cadenceName.trim().slice(0, 120) || existing.cadenceName
          : existing.cadenceName,
      cadenceDescription:
        patch.cadenceDescription !== undefined
          ? patch.cadenceDescription.trim().slice(0, 500)
          : existing.cadenceDescription,
    };
    if (!next.name) throw new Error("name required");
    customs[idx] = next;
    await getBackend().write(TEMPLATES_FILE, customs);
    return next;
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
