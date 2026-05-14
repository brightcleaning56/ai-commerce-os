/**
 * Unified onboarding engine — slice 1 of 8.
 *
 * Five personas (admin, team, buyer, supplier, distributor) share one
 * step/question schema. The schema is data, not code, so adding a new
 * conditional question (e.g. "Agriculture Supplier -> crop types") is
 * a registry edit, not a UI rewrite.
 *
 * Why a single engine instead of five hand-rolled forms:
 *   - Resume-later works for free (state shape is uniform)
 *   - Industry-aware sub-questions are conditional flags, not branching code
 *   - Per-step validation lives next to the question definition
 *   - The shell (slice 1) renders ANY persona once the registry is filled in
 *
 * Slice 1 ships:
 *   - Types
 *   - Persona chooser metadata
 *   - One placeholder step per persona so the engine has something to render
 *
 * Slices 2-6 fill in the actual question banks per persona.
 *
 * State storage: see lib/onboardingState.ts. One session per browser
 * cookie (`avyn_onboarding`), 30-day TTL, JSON-blob store.
 */

import type { Role } from "@/lib/capabilities";

// ─── Persona ────────────────────────────────────────────────────────

/**
 * Five personas. The persona chooser at /onboarding/start writes one of
 * these into the session, the engine then walks the matching flow.
 *
 * Each persona maps to:
 *   - a role (assigned at onboarding-complete time)
 *   - a default landing route after completion
 *   - a Workspace participant kind (Owner workspace vs Supplier workspace
 *     vs Buyer workspace -- enforced via lib/userToken.ts kind field)
 */
export const PERSONAS = [
  "admin",         // Platform owner -- runs the workspace
  "team",          // Invited teammate -- joins existing workspace
  "buyer",         // External buyer -- self-serves
  "supplier",      // External supplier -- self-serves
  "distributor",   // Logistics partner -- self-serves
] as const;
export type Persona = (typeof PERSONAS)[number];

export const PERSONA_LABEL: Record<Persona, string> = {
  admin: "Platform owner",
  team: "Team member",
  buyer: "Buyer / Retailer",
  supplier: "Supplier / Manufacturer",
  distributor: "Distributor / Logistics",
};

export const PERSONA_DESCRIPTION: Record<Persona, string> = {
  admin:
    "I'm setting up AVYN for my company. I want to manage users, AI automation, billing, and integrations.",
  team:
    "I was invited to join an existing workspace. I have an invite token from a teammate.",
  buyer:
    "I source products from suppliers. I want to discover trending products and connect to verified manufacturers.",
  supplier:
    "I make or wholesale products. I want buyers to find me and run on AVYN's verified-supplier network.",
  distributor:
    "I move freight, warehouse, or fulfill orders. I want to be matched into shipping lanes on AVYN.",
};

/**
 * Persona -> resulting role at completion. Owner is reserved for the
 * single workspace owner (set via env, not assigned via onboarding).
 * Buyer/Supplier/Distributor get the Viewer role on the staff side and
 * are flagged as external participants via the userToken `kind` field
 * (a future slice extends `kind` from {user|supplier} to include
 * {buyer|distributor}).
 */
export const PERSONA_TO_ROLE: Record<Persona, Role> = {
  admin: "Admin",
  team: "Operator",     // overridable via the invite's role field
  buyer: "Viewer",
  supplier: "Viewer",
  distributor: "Viewer",
};

/**
 * Where the user lands after onboarding-complete. Slice 8 wires the
 * router gate so partially-onboarded users can't escape to other pages.
 */
export const PERSONA_LANDING: Record<Persona, string> = {
  admin: "/",
  team: "/",
  buyer: "/marketplace",
  supplier: "/portal",
  distributor: "/portal",
};

// ─── Question schema ────────────────────────────────────────────────

/**
 * Question types supported by the engine UI (slice 1 ships the
 * scaffolding; slice 2 wires the renderers for each).
 */
export type QuestionType =
  | "text"            // single-line
  | "textarea"        // multi-line
  | "select"          // single-choice from options
  | "multiselect"     // multi-choice from options
  | "number"
  | "boolean"         // yes/no toggle
  | "tags"            // free-form tag input (comma-separated)
  | "file"            // file upload (slice 7)
  | "email-verify"    // magic-link gate (slice 7)
  | "country"         // 2-letter ISO picker
  | "address";        // structured city/state/zip/country

export type QuestionOption = {
  value: string;
  label: string;
  /** Tag this option as triggering an industry-specific follow-up step.
   *  Used by the supplier flow ("Agriculture" -> crop questions). */
  triggers?: string[];
  description?: string;
};

export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  /** Hint text below the input, in muted ink. */
  helper?: string;
  /** Placeholder for text/textarea/email. */
  placeholder?: string;
  /** Required gates step completion. Default false. */
  required?: boolean;
  /** Options for select/multiselect. */
  options?: QuestionOption[];
  /** Validation: min/max length, min/max number, regex. */
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  /** Render only when previous answer matches. Lets one step file
   *  several conditional questions so we don't multiply step count. */
  showIf?: { questionId: string; equals?: string; includes?: string };
};

export type Step = {
  id: string;
  label: string;        // sidebar/title
  blurb?: string;       // one-line description above the questions
  questions: Question[];
  /** Step-level conditional. Skips the step entirely when this answer
   *  doesn't match. Use case: "Agriculture sub-questions" step that's
   *  skipped unless industry = agriculture. */
  showIf?: { stepId?: string; questionId: string; equals?: string; includes?: string };
};

export type Flow = {
  persona: Persona;
  steps: Step[];
};

// ─── Per-persona flows ──────────────────────────────────────────────
//
// Slice 1: each flow has ONE placeholder step so the shell + chooser
// have something to render and the engine end-to-end works without
// crashing. Slices 2-6 replace these with the real question banks.

const adminFlow: Flow = {
  persona: "admin",
  steps: [
    {
      id: "placeholder",
      label: "Set up your workspace",
      blurb:
        "Slice 1 placeholder — slice 2 fills in: org structure, billing intent, AI defaults, outreach approval, compliance toggle, integrations.",
      questions: [
        {
          id: "company",
          type: "text",
          label: "Company name",
          required: true,
          maxLength: 120,
        },
      ],
    },
  ],
};

const teamFlow: Flow = {
  persona: "team",
  steps: [
    {
      id: "placeholder",
      label: "Join the workspace",
      blurb:
        "Slice 1 placeholder — slice 3 fills in: department, assigned workflows, AI agent access, approval limits, communication scope.",
      questions: [
        {
          id: "name",
          type: "text",
          label: "Your full name",
          required: true,
          maxLength: 120,
        },
      ],
    },
  ],
};

const buyerFlow: Flow = {
  persona: "buyer",
  steps: [
    {
      id: "placeholder",
      label: "Tell us what you source",
      blurb:
        "Slice 1 placeholder — slice 4 fills in: products needed, industries, monthly volume, regions, payment terms, shipping requirements.",
      questions: [
        {
          id: "company",
          type: "text",
          label: "Company name",
          required: true,
          maxLength: 120,
        },
      ],
    },
  ],
};

const supplierFlow: Flow = {
  persona: "supplier",
  steps: [
    {
      id: "placeholder",
      label: "Tell us what you make",
      blurb:
        "Slice 1 placeholder — slice 5 fills in: certifications, manufacturing capabilities, MOQ, warehouse locations, shipping methods, production capacity, distribution regions, plus dynamic industry sub-questions.",
      questions: [
        {
          id: "legalName",
          type: "text",
          label: "Legal company name",
          required: true,
          maxLength: 120,
        },
      ],
    },
  ],
};

const distributorFlow: Flow = {
  persona: "distributor",
  steps: [
    {
      id: "placeholder",
      label: "Tell us what you move",
      blurb:
        "Slice 1 placeholder — slice 6 fills in: regions served, freight methods, warehouse network, trucking/shipping capabilities, delivery timelines.",
      questions: [
        {
          id: "legalName",
          type: "text",
          label: "Legal company name",
          required: true,
          maxLength: 120,
        },
      ],
    },
  ],
};

export const FLOWS: Record<Persona, Flow> = {
  admin: adminFlow,
  team: teamFlow,
  buyer: buyerFlow,
  supplier: supplierFlow,
  distributor: distributorFlow,
};

// ─── Helpers ────────────────────────────────────────────────────────

export function isPersona(s: unknown): s is Persona {
  return typeof s === "string" && (PERSONAS as readonly string[]).includes(s);
}

/**
 * Decide whether a question should render given the answers so far.
 * Used by the engine renderer in slice 2+.
 */
export function shouldShowQuestion(
  q: Question,
  answers: Record<string, unknown>,
): boolean {
  if (!q.showIf) return true;
  const v = answers[q.showIf.questionId];
  if (q.showIf.equals !== undefined) return v === q.showIf.equals;
  if (q.showIf.includes !== undefined) {
    if (Array.isArray(v)) return v.includes(q.showIf.includes);
    return false;
  }
  return true;
}

/**
 * Decide whether a step should render given the answers across the
 * whole flow. Lets us file an "Agriculture-specific questions" step
 * that's skipped for every other industry.
 */
export function shouldShowStep(
  s: Step,
  answers: Record<string, Record<string, unknown>>,
): boolean {
  if (!s.showIf) return true;
  // showIf can scope by stepId; if missing, search all steps for the question.
  const stepBucket = s.showIf.stepId ? (answers[s.showIf.stepId] ?? {}) : Object.values(answers).reduce(
    (acc, b) => ({ ...acc, ...(b as Record<string, unknown>) }),
    {} as Record<string, unknown>,
  );
  const v = stepBucket[s.showIf.questionId];
  if (s.showIf.equals !== undefined) return v === s.showIf.equals;
  if (s.showIf.includes !== undefined) {
    if (Array.isArray(v)) return v.includes(s.showIf.includes);
    return false;
  }
  return true;
}

/**
 * Validate one step's answers. Returns null on success or a per-question
 * error map. The shell renderer uses this to gate "Next".
 */
export function validateStep(
  step: Step,
  answers: Record<string, unknown>,
): Record<string, string> | null {
  const errors: Record<string, string> = {};
  for (const q of step.questions) {
    if (!shouldShowQuestion(q, answers)) continue;
    const v = answers[q.id];
    if (q.required) {
      if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
        errors[q.id] = "Required";
        continue;
      }
    }
    if (typeof v === "string") {
      if (q.minLength != null && v.length < q.minLength) {
        errors[q.id] = `Must be at least ${q.minLength} characters`;
      }
      if (q.maxLength != null && v.length > q.maxLength) {
        errors[q.id] = `Max ${q.maxLength} characters`;
      }
      if (q.pattern && !new RegExp(q.pattern).test(v)) {
        errors[q.id] = "Doesn't match expected format";
      }
    }
    if (typeof v === "number" || (typeof v === "string" && q.type === "number")) {
      const n = typeof v === "number" ? v : Number.parseFloat(v);
      if (Number.isNaN(n)) {
        errors[q.id] = "Must be a number";
      } else {
        if (q.min != null && n < q.min) errors[q.id] = `Min ${q.min}`;
        if (q.max != null && n > q.max) errors[q.id] = `Max ${q.max}`;
      }
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
