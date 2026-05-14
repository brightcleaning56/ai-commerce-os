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
    // ── Step 1: Identity + company basics ─────────────────────────
    {
      id: "identity",
      label: "Who are you",
      blurb: "We use this to address you in dashboards, emails, and your AI agent's signature.",
      questions: [
        { id: "fullName", type: "text", label: "Your full name", required: true, maxLength: 120, placeholder: "Jane Operator" },
        { id: "email", type: "text", label: "Work email", required: true, maxLength: 200, placeholder: "you@company.com", helper: "We'll send a verification link in step 7." },
        { id: "title", type: "text", label: "Your title", maxLength: 80, placeholder: "Founder / CEO / Head of Ops" },
        { id: "phone", type: "text", label: "Phone (optional)", maxLength: 40, placeholder: "+1 555 0100" },
      ],
    },

    // ── Step 2: Company / org ─────────────────────────────────────
    {
      id: "company",
      label: "Tell us about your company",
      blurb: "Drives reporting, lane analytics, and the public profile your buyers see.",
      questions: [
        { id: "companyName", type: "text", label: "Company name", required: true, maxLength: 120 },
        { id: "website", type: "text", label: "Website", maxLength: 200, placeholder: "https://yourcompany.com" },
        {
          id: "businessType",
          type: "select",
          label: "What's your primary business model?",
          required: true,
          options: [
            { value: "brand", label: "Brand / DTC", description: "You sell your own product to consumers or wholesale buyers." },
            { value: "wholesaler", label: "Wholesale / B2B", description: "You move goods between manufacturers and retailers." },
            { value: "retailer", label: "Retailer / Buyer", description: "You source goods to sell. (Consider the Buyer track.)" },
            { value: "agency", label: "Agency / Consultancy", description: "You run AVYN on behalf of multiple client brands." },
            { value: "marketplace", label: "Marketplace / Aggregator", description: "You connect supply + demand at scale." },
            { value: "other", label: "Something else", description: "Don't see it? Pick this and tell us in the notes." },
          ],
        },
        {
          id: "headcount",
          type: "select",
          label: "How big is your team?",
          required: true,
          options: [
            { value: "1", label: "Just me" },
            { value: "2-10", label: "2-10 people" },
            { value: "11-50", label: "11-50" },
            { value: "51-200", label: "51-200" },
            { value: "201+", label: "201+" },
          ],
        },
        { id: "headquarters", type: "address", label: "Headquarters", helper: "We use this for tax, escrow defaults, and shipping-lane analytics." },
      ],
    },

    // ── Step 3: Org structure / departments ───────────────────────
    {
      id: "structure",
      label: "Organization structure",
      blurb: "Pick the departments you'll be inviting teammates into. You can add more later.",
      questions: [
        {
          id: "departments",
          type: "multiselect",
          label: "Departments using AVYN",
          required: true,
          helper: "These become group labels when you invite teammates in step 8.",
          options: [
            { value: "sales", label: "Sales" },
            { value: "operations", label: "Operations" },
            { value: "marketing", label: "Marketing" },
            { value: "finance", label: "Finance" },
            { value: "support", label: "Customer Support" },
            { value: "logistics", label: "Logistics / Fulfillment" },
            { value: "engineering", label: "Engineering / Data" },
          ],
        },
        {
          id: "primaryGoal",
          type: "select",
          label: "What's the #1 thing you want AVYN to do this quarter?",
          required: true,
          options: [
            { value: "find-buyers", label: "Find new buyers", description: "Outbound discovery + outreach automation." },
            { value: "manage-suppliers", label: "Manage supplier network", description: "Verify, score, and route work to vetted suppliers." },
            { value: "automate-outreach", label: "Automate outbound", description: "Cadences, drip sequences, AI-drafted touches." },
            { value: "close-deals", label: "Close more deals", description: "Quote builder, escrow, AI negotiation." },
            { value: "scale-ops", label: "Scale operations", description: "Lane intelligence, dashboards, audit trails." },
          ],
        },
      ],
    },

    // ── Step 4: AI defaults ───────────────────────────────────────
    {
      id: "aiDefaults",
      label: "AI agent defaults",
      blurb: "Sets the starting tone for outreach, agents, and AI-drafted comms. You can override per agent later.",
      questions: [
        {
          id: "aiTone",
          type: "select",
          label: "How should AI-drafted messages sound?",
          required: true,
          options: [
            { value: "warm-friendly", label: "Warm + friendly", description: "Conversational, first-name basis, light emoji ok." },
            { value: "professional", label: "Professional", description: "Polished but not stiff. Business casual." },
            { value: "formal", label: "Formal", description: "Old-school enterprise. No first-name unless reciprocated." },
            { value: "direct", label: "Direct + concise", description: "Two sentences max. No hedging." },
          ],
        },
        {
          id: "aiAggressiveness",
          type: "select",
          label: "How aggressive should outreach be?",
          required: true,
          options: [
            { value: "conservative", label: "Conservative", description: "Send only when match score is high. Fewer but higher-quality touches." },
            { value: "balanced", label: "Balanced", description: "Default. Match score above mid-range." },
            { value: "aggressive", label: "Aggressive", description: "Cast a wide net. More volume, more rejections." },
          ],
        },
        {
          id: "languages",
          type: "multiselect",
          label: "Languages your team works in",
          options: [
            { value: "en", label: "English" }, { value: "es", label: "Spanish" }, { value: "fr", label: "French" },
            { value: "de", label: "German" }, { value: "pt", label: "Portuguese" }, { value: "zh", label: "Mandarin" },
            { value: "ja", label: "Japanese" }, { value: "ko", label: "Korean" },
          ],
        },
      ],
    },

    // ── Step 5: Outreach approval policy ──────────────────────────
    {
      id: "outreachApproval",
      label: "Outreach approval policy",
      blurb: "Controls what AI-drafted touches need a human signoff before they ship.",
      questions: [
        {
          id: "approvalMode",
          type: "select",
          label: "Approval mode",
          required: true,
          options: [
            { value: "all", label: "Approve every touch", description: "Every email/SMS sits in /approvals until you click send. Safest." },
            { value: "first-touch", label: "Approve first touch only", description: "First message per buyer needs signoff; follow-ups auto-send. Default." },
            { value: "high-stakes", label: "Approve high-stakes only", description: "Auto-send touches where buyer revenue tier < $50k. Big buyers always need human." },
            { value: "none", label: "No approval needed", description: "Auto-send everything. Fastest but most risk." },
          ],
        },
        {
          id: "dailySendCap",
          type: "number",
          label: "Daily send cap (per channel)",
          helper: "0 = no cap. Most operators start at 50-100 to avoid blowing up deliverability.",
          min: 0,
          max: 5000,
        },
        {
          id: "approvalNotify",
          type: "boolean",
          label: "Email me when items hit the approval queue",
          helper: "We'll batch into a daily digest unless you want each one.",
        },
      ],
    },

    // ── Step 6: Compliance ────────────────────────────────────────
    {
      id: "compliance",
      label: "Compliance setup",
      blurb: "We handle CAN-SPAM, RFC 8058 (Gmail/iCloud one-click unsubscribe), and bounce auto-suppression by default. Confirm or override.",
      questions: [
        {
          id: "physicalAddress",
          type: "boolean",
          label: "Use my company HQ for the CAN-SPAM physical address footer",
          helper: "Required by law on every commercial email. We'll auto-append it from step 2 if yes.",
        },
        {
          id: "unsubscribeMode",
          type: "select",
          label: "Unsubscribe handling",
          required: true,
          options: [
            { value: "auto", label: "Auto-suppress on every channel", description: "Default. One unsubscribe = no future email/SMS, ever." },
            { value: "channel-only", label: "Auto-suppress only the channel they unsubscribed from", description: "If they unsubscribe email, you can still SMS." },
          ],
        },
        {
          id: "gdprMode",
          type: "boolean",
          label: "Apply EU GDPR rules to all buyers (not just EU)",
          helper: "Stricter consent + deletion behaviors. Trade speed for compliance certainty.",
        },
        {
          id: "auditRetentionDays",
          type: "number",
          label: "Audit log retention (days)",
          helper: "Default 365. Some industries (finance, healthcare) need 7+ years.",
          min: 30,
          max: 3650,
        },
      ],
    },

    // ── Step 7: Integrations preference ───────────────────────────
    {
      id: "integrations",
      label: "Integrations you want now",
      blurb: "Pick the ones you'll wire up first. We'll show inline connect buttons on your dashboard.",
      questions: [
        {
          id: "integrations",
          type: "multiselect",
          label: "Connect on day one",
          options: [
            { value: "stripe", label: "Stripe", description: "Escrow, supplier payouts, invoicing." },
            { value: "postmark", label: "Postmark", description: "Outbound email + bounce/complaint webhooks." },
            { value: "twilio", label: "Twilio", description: "Voice + SMS." },
            { value: "anthropic", label: "Anthropic", description: "AI drafting + agents (Claude API)." },
            { value: "shopify", label: "Shopify", description: "Pull product catalog + orders." },
            { value: "quickbooks", label: "QuickBooks", description: "Sync transactions to accounting." },
            { value: "slack", label: "Slack", description: "Push notifications to a channel." },
          ],
        },
      ],
    },

    // ── Step 8: Billing intent ────────────────────────────────────
    {
      id: "billing",
      label: "Billing intent",
      blurb: "We won't charge anything during setup. Pick a plan to anchor the trial flow.",
      questions: [
        {
          id: "plan",
          type: "select",
          label: "Plan you're trialing",
          required: true,
          options: [
            { value: "starter", label: "Starter", description: "1 seat. AI agents, queue, cadences. $99/mo after 14-day trial." },
            { value: "growth", label: "Growth", description: "Up to 10 seats. Marketplace, escrow, lane analytics. $399/mo." },
            { value: "scale", label: "Scale", description: "Unlimited seats, dedicated AI capacity, SLA. From $1,500/mo." },
            { value: "decide-later", label: "Decide later", description: "Set me up; I'll pick after I poke around." },
          ],
        },
        {
          id: "billingEmail",
          type: "text",
          label: "Billing contact email (if different from yours)",
          maxLength: 200,
          placeholder: "billing@company.com",
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
