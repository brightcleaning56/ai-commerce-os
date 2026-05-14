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
    // ── Step 1: Identity ──────────────────────────────────────────
    {
      id: "identity",
      label: "Welcome aboard",
      blurb: "We have your role from the invite. Tell us how you want to show up in the workspace.",
      questions: [
        { id: "fullName", type: "text", label: "Your full name", required: true, maxLength: 120, placeholder: "Alex Operator" },
        { id: "displayName", type: "text", label: "Preferred name (optional)", maxLength: 80, placeholder: "How teammates should address you" },
        { id: "phone", type: "text", label: "Direct phone (optional)", maxLength: 40, placeholder: "+1 555 0100", helper: "Used so AI can route inbound calls intended for you." },
        { id: "timezone", type: "text", label: "Timezone (IANA)", maxLength: 60, placeholder: "America/Los_Angeles", helper: "Default UTC. Drives quiet-hours + send-time defaults." },
      ],
    },

    // ── Step 2: Department + role context ─────────────────────────
    {
      id: "context",
      label: "How you fit in",
      blurb: "Helps us pre-load the right dashboards and shortcuts on your home screen.",
      questions: [
        {
          id: "department",
          type: "select",
          label: "Department",
          required: true,
          options: [
            { value: "sales", label: "Sales" },
            { value: "operations", label: "Operations" },
            { value: "marketing", label: "Marketing" },
            { value: "finance", label: "Finance" },
            { value: "support", label: "Customer Support" },
            { value: "logistics", label: "Logistics / Fulfillment" },
            { value: "engineering", label: "Engineering / Data" },
            { value: "executive", label: "Executive / Leadership" },
            { value: "other", label: "Other" },
          ],
        },
        {
          id: "experience",
          type: "select",
          label: "Experience with this kind of system",
          options: [
            { value: "first-time", label: "First-time", description: "I've never run an AI ops platform. Show me the ropes." },
            { value: "comfortable", label: "Comfortable", description: "I've used CRMs and outreach tools before." },
            { value: "expert", label: "Expert", description: "I've built or admin'd this kind of system. Skip the tour." },
          ],
        },
        {
          id: "primaryWorkflows",
          type: "multiselect",
          label: "Workflows you'll own",
          required: true,
          helper: "Pre-pins these dashboards. You can pin/unpin later.",
          options: [
            { value: "leads", label: "Inbound leads" },
            { value: "queue", label: "Outreach queue" },
            { value: "tasks", label: "Phone tasks" },
            { value: "calls", label: "Call log + voicemails" },
            { value: "deals", label: "Deals + quotes" },
            { value: "transactions", label: "Transactions + escrow" },
            { value: "suppliers", label: "Supplier registry" },
            { value: "approvals", label: "Approvals queue" },
            { value: "reports", label: "Reports + insights" },
          ],
        },
      ],
    },

    // ── Step 3: AI agent access ───────────────────────────────────
    {
      id: "aiAgents",
      label: "AI agent access",
      blurb: "Pick which AI agents you want available in your workspace. Owner can restrict any of these per-role later.",
      questions: [
        {
          id: "agents",
          type: "multiselect",
          label: "Agents available to me",
          options: [
            { value: "trend-hunter", label: "Trend Hunter", description: "Discovers winning products from real signals." },
            { value: "buyer-discovery", label: "Buyer Discovery", description: "Finds matching retailers + decision-makers." },
            { value: "supplier-finder", label: "Supplier Finder", description: "Surfaces verified manufacturers / wholesalers." },
            { value: "outreach", label: "Outreach Drafting", description: "Drafts personalized email / SMS." },
            { value: "negotiation", label: "Negotiation", description: "Counter-proposes on inbound replies." },
            { value: "lead-followup", label: "Lead Follow-up", description: "Auto-second-touch on cold leads." },
            { value: "risk", label: "Risk Center", description: "Flags suspicious transactions." },
          ],
        },
        {
          id: "aiPermission",
          type: "select",
          label: "How should AI tools work for me?",
          required: true,
          options: [
            { value: "draft-only", label: "Draft only", description: "AI suggests; I always click send." },
            { value: "auto-low-risk", label: "Auto-send low-risk", description: "AI sends follow-ups + nudges; I approve first touches + high-stakes." },
            { value: "fully-autonomous", label: "Fully autonomous", description: "AI sends everything within my scope. I review the log." },
          ],
        },
      ],
    },

    // ── Step 4: Approval limits ───────────────────────────────────
    {
      id: "limits",
      label: "Approval + spend limits",
      blurb: "Defaults you'll be able to act on without owner sign-off. Owner can change anytime.",
      questions: [
        {
          id: "quoteApprovalCap",
          type: "number",
          label: "Quotes I can send without approval (USD)",
          helper: "Quotes above this dollar amount go to /approvals. Default suggested: 5000.",
          min: 0,
          max: 1_000_000,
        },
        {
          id: "discountCap",
          type: "number",
          label: "Discount I can offer without approval (%)",
          helper: "Default 10%. Above goes to /approvals.",
          min: 0,
          max: 100,
        },
        {
          id: "refundCap",
          type: "number",
          label: "Refunds I can issue without approval (USD)",
          helper: "Default 250.",
          min: 0,
          max: 1_000_000,
        },
        {
          id: "outreachVolumeCap",
          type: "number",
          label: "Outbound touches per day",
          helper: "Hard cap on the queue. 0 = inherit workspace default.",
          min: 0,
          max: 5000,
        },
      ],
    },

    // ── Step 5: Communication channels ────────────────────────────
    {
      id: "comms",
      label: "How AVYN reaches you",
      blurb: "When something needs you (incoming call, escalation, approval), how should we ping?",
      questions: [
        {
          id: "channels",
          type: "multiselect",
          label: "Notify me via",
          required: true,
          options: [
            { value: "in-app", label: "In-app", description: "Real-time toast + sidebar badge." },
            { value: "email", label: "Email" },
            { value: "sms", label: "SMS" },
            { value: "slack", label: "Slack DM", description: "Requires workspace Slack integration." },
          ],
        },
        {
          id: "quietHours",
          type: "select",
          label: "Quiet hours",
          options: [
            { value: "none", label: "No quiet hours", description: "Notify me anytime." },
            { value: "evenings", label: "Evenings (8pm-8am local)" },
            { value: "weekends", label: "Weekends" },
            { value: "both", label: "Evenings + weekends" },
          ],
        },
        {
          id: "incomingCallRouting",
          type: "boolean",
          label: "Ring me on incoming calls",
          helper: "Adds you to the multi-agent call ring. If off, calls won't ring your browser even when online.",
        },
      ],
    },
  ],
};

const buyerFlow: Flow = {
  persona: "buyer",
  steps: [
    // ── Step 1: Company identity ──────────────────────────────────
    {
      id: "company",
      label: "Tell us about your company",
      blurb: "We use this to match you with verified suppliers and to contact you about your matches.",
      questions: [
        { id: "companyName", type: "text", label: "Company name", required: true, maxLength: 120 },
        { id: "fullName", type: "text", label: "Your name", required: true, maxLength: 120, placeholder: "Sourcing lead / Buyer" },
        { id: "title", type: "text", label: "Your title", maxLength: 80, placeholder: "Head of Procurement" },
        { id: "email", type: "text", label: "Work email", required: true, maxLength: 200, placeholder: "you@company.com" },
        { id: "phone", type: "text", label: "Direct phone", maxLength: 40 },
        { id: "website", type: "text", label: "Company website", maxLength: 200, placeholder: "https://yourcompany.com" },
        {
          id: "buyerType",
          type: "select",
          label: "What kind of buyer are you?",
          required: true,
          options: [
            { value: "retailer", label: "Retailer / DTC brand", description: "You sell to consumers." },
            { value: "wholesaler", label: "Wholesaler / Distributor", description: "You move goods to other businesses." },
            { value: "marketplace", label: "Marketplace / Platform", description: "You list third-party products." },
            { value: "private-label", label: "Private label / White label", description: "You source products to brand as your own." },
            { value: "enterprise", label: "Enterprise procurement", description: "Internal procurement at a large company." },
          ],
        },
      ],
    },

    // ── Step 2: Industries + product needs ────────────────────────
    {
      id: "needs",
      label: "What you source",
      blurb: "Drives which suppliers, trends, and products surface on your dashboard.",
      questions: [
        {
          id: "industries",
          type: "multiselect",
          label: "Industries you source from",
          required: true,
          helper: "Pick all that apply. We'll use this to filter the supplier finder + trends feed.",
          options: [
            { value: "apparel", label: "Apparel & Accessories" },
            { value: "beauty", label: "Beauty & Personal Care" },
            { value: "electronics", label: "Electronics & Tech" },
            { value: "home-goods", label: "Home Goods & Furniture" },
            { value: "food-bev", label: "Food & Beverage" },
            { value: "agriculture", label: "Agriculture & Raw Materials" },
            { value: "automotive", label: "Automotive Parts" },
            { value: "industrial", label: "Industrial / B2B Equipment" },
            { value: "pet", label: "Pet Products" },
            { value: "sports", label: "Sports & Outdoors" },
            { value: "toys", label: "Toys & Hobbies" },
            { value: "health", label: "Health & Wellness" },
          ],
        },
        {
          id: "topProducts",
          type: "tags",
          label: "Specific products / SKUs you're sourcing",
          helper: "Comma-separated. Example: 'silicone food bags, bamboo cutlery, reusable straws'.",
          placeholder: "Type and add",
        },
        { id: "topProductsNotes", type: "textarea", label: "Anything else we should know about what you source?", maxLength: 1000, placeholder: "Sustainable materials only, FDA approved, etc." },
      ],
    },

    // ── Step 3: Volume + budget ───────────────────────────────────
    {
      id: "volume",
      label: "Purchasing scale",
      blurb: "Lets us pre-filter to suppliers whose MOQ and capacity actually match.",
      questions: [
        {
          id: "monthlyVolume",
          type: "select",
          label: "Monthly purchasing volume",
          required: true,
          options: [
            { value: "<5k", label: "Under $5k/mo", description: "Just starting / sample orders." },
            { value: "5k-25k", label: "$5k-$25k/mo" },
            { value: "25k-100k", label: "$25k-$100k/mo" },
            { value: "100k-500k", label: "$100k-$500k/mo" },
            { value: "500k-2m", label: "$500k-$2M/mo" },
            { value: "2m+", label: "$2M+/mo", description: "Enterprise scale." },
          ],
        },
        {
          id: "moqTolerance",
          type: "select",
          label: "MOQ tolerance",
          required: true,
          helper: "How small must MOQs be to fit your operation?",
          options: [
            { value: "any", label: "Any MOQ", description: "I can take large MOQs." },
            { value: "under-1000", label: "Under 1,000 units" },
            { value: "under-100", label: "Under 100 units" },
            { value: "samples", label: "Samples / trial orders only", description: "Need flexibility to test." },
          ],
        },
        {
          id: "orderFrequency",
          type: "select",
          label: "How often do you reorder?",
          options: [
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
            { value: "quarterly", label: "Quarterly" },
            { value: "seasonal", label: "Seasonal (2-4x/yr)" },
            { value: "one-off", label: "Project-based / one-offs" },
          ],
        },
      ],
    },

    // ── Step 4: Region + shipping ─────────────────────────────────
    {
      id: "regions",
      label: "Sourcing geography",
      blurb: "Where you'll accept goods from + ship to. Powers the lane analytics on your dashboard.",
      questions: [
        {
          id: "sourceRegions",
          type: "multiselect",
          label: "Regions you source from",
          required: true,
          options: [
            { value: "us", label: "United States" },
            { value: "canada", label: "Canada" },
            { value: "mexico", label: "Mexico" },
            { value: "eu", label: "European Union" },
            { value: "uk", label: "United Kingdom" },
            { value: "asia-china", label: "China" },
            { value: "asia-india", label: "India" },
            { value: "asia-vietnam", label: "Vietnam" },
            { value: "asia-other", label: "Other Asia" },
            { value: "south-america", label: "South America" },
            { value: "africa", label: "Africa" },
            { value: "anywhere", label: "Anywhere -- best price wins" },
          ],
        },
        {
          id: "deliveryAddress",
          type: "address",
          label: "Primary receiving address",
          helper: "We use this for tax, freight estimates, and lane planning. Add more later via /buyers.",
        },
        {
          id: "preferredShipping",
          type: "multiselect",
          label: "Preferred shipping methods",
          options: [
            { value: "ocean-fcl", label: "Ocean (FCL)", description: "Full container, slowest, cheapest at scale." },
            { value: "ocean-lcl", label: "Ocean (LCL)", description: "Less than container, slower." },
            { value: "air-cargo", label: "Air cargo", description: "Faster, mid-priced." },
            { value: "ltl", label: "Truck (LTL)", description: "Domestic less-than-truckload." },
            { value: "parcel", label: "Parcel (UPS/FedEx/USPS)", description: "Small parcels, fastest for low volume." },
            { value: "rail", label: "Rail" },
            { value: "any", label: "Any -- price + speed determines" },
          ],
        },
        {
          id: "deliverySpeed",
          type: "select",
          label: "Default delivery urgency",
          options: [
            { value: "fastest", label: "Fastest possible (next-day where possible)" },
            { value: "standard", label: "Standard (5-10 business days)" },
            { value: "economy", label: "Economy (cheapest, 4+ weeks ok)" },
          ],
        },
      ],
    },

    // ── Step 5: Payment + terms ───────────────────────────────────
    {
      id: "payment",
      label: "Payment preferences",
      blurb: "We escrow by default; pick how you want to fund + settle.",
      questions: [
        {
          id: "paymentMethods",
          type: "multiselect",
          label: "How do you pay suppliers?",
          required: true,
          options: [
            { value: "wire", label: "Wire transfer" },
            { value: "ach", label: "ACH" },
            { value: "card", label: "Credit card" },
            { value: "letter-of-credit", label: "Letter of credit", description: "International formal." },
            { value: "crypto", label: "Crypto / stablecoin" },
            { value: "escrow-only", label: "Escrow only", description: "Default. Funds held until delivery." },
          ],
        },
        {
          id: "paymentTerms",
          type: "select",
          label: "Standard payment terms",
          required: true,
          options: [
            { value: "prepay", label: "Prepay 100%", description: "Common for new suppliers." },
            { value: "50-50", label: "50% deposit, 50% on delivery" },
            { value: "net-15", label: "Net 15", description: "Pay 15 days after delivery." },
            { value: "net-30", label: "Net 30", description: "Standard B2B terms." },
            { value: "net-60", label: "Net 60", description: "Enterprise terms." },
            { value: "negotiate", label: "Negotiate per supplier" },
          ],
        },
        {
          id: "currency",
          type: "select",
          label: "Default currency",
          options: [
            { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "GBP", label: "GBP" },
            { value: "CAD", label: "CAD" }, { value: "AUD", label: "AUD" }, { value: "CNY", label: "CNY" },
          ],
        },
      ],
    },

    // ── Step 6: Goals ─────────────────────────────────────────────
    {
      id: "goals",
      label: "What's your goal on AVYN?",
      questions: [
        {
          id: "primaryGoal",
          type: "select",
          label: "Pick the #1",
          required: true,
          options: [
            { value: "find-suppliers", label: "Find new verified suppliers" },
            { value: "lower-costs", label: "Lower per-unit costs" },
            { value: "diversify", label: "Diversify supply chain" },
            { value: "trend-discovery", label: "Discover trending products earlier" },
            { value: "consolidate", label: "Consolidate supplier comms" },
          ],
        },
        {
          id: "supplierDiscoveryFreq",
          type: "boolean",
          label: "Send me weekly trend + supplier digests",
          helper: "Curated by AI based on your industries.",
        },
      ],
    },
  ],
};

const supplierFlow: Flow = {
  persona: "supplier",
  steps: [
    // ── Step 1: Identity + legal ──────────────────────────────────
    {
      id: "identity",
      label: "Company identity",
      blurb: "We use this on your public verified-supplier profile + on every contract / quote we generate.",
      questions: [
        { id: "legalName", type: "text", label: "Legal company name", required: true, maxLength: 120, placeholder: "As registered with your government" },
        { id: "tradeName", type: "text", label: "Trade name (DBA)", maxLength: 120, helper: "If different from legal name." },
        { id: "fullName", type: "text", label: "Your name", required: true, maxLength: 120 },
        { id: "title", type: "text", label: "Your title", maxLength: 80, placeholder: "Founder / Sales Director / Account Manager" },
        { id: "email", type: "text", label: "Work email", required: true, maxLength: 200 },
        { id: "phone", type: "text", label: "Direct phone", maxLength: 40 },
        { id: "website", type: "text", label: "Company website", maxLength: 200 },
        {
          id: "kind",
          type: "select",
          label: "What kind of supplier are you?",
          required: true,
          options: [
            { value: "Manufacturer", label: "Manufacturer", description: "You make the product yourself." },
            { value: "Wholesaler", label: "Wholesaler", description: "You buy at scale + resell." },
            { value: "Distributor", label: "Distributor", description: "You handle inventory + distribution for brands." },
            { value: "Dropship", label: "Dropship supplier", description: "You ship direct-to-consumer for retailers." },
            { value: "Trader", label: "Trader / Broker", description: "You connect manufacturers + buyers." },
          ],
        },
      ],
    },

    // ── Step 2: Industries ────────────────────────────────────────
    //
    // Multi-select. The selection here drives the conditional
    // industry-specific sub-question steps below (showIf.includes).
    {
      id: "industries",
      label: "What industries do you serve?",
      blurb: "Multi-select. Pick all that apply -- we'll ask follow-up questions specific to each.",
      questions: [
        {
          id: "industries",
          type: "multiselect",
          label: "Industries",
          required: true,
          options: [
            { value: "agriculture", label: "Agriculture & Raw Materials", triggers: ["agri-questions"] },
            { value: "apparel", label: "Apparel & Accessories", triggers: ["apparel-questions"] },
            { value: "beauty", label: "Beauty & Personal Care", triggers: ["beauty-questions"] },
            { value: "electronics", label: "Electronics & Tech", triggers: ["electronics-questions"] },
            { value: "food-bev", label: "Food & Beverage", triggers: ["food-questions"] },
            { value: "home-goods", label: "Home Goods & Furniture" },
            { value: "automotive", label: "Automotive Parts" },
            { value: "industrial", label: "Industrial / B2B Equipment" },
            { value: "pet", label: "Pet Products" },
            { value: "sports", label: "Sports & Outdoors" },
            { value: "toys", label: "Toys & Hobbies" },
            { value: "health", label: "Health & Wellness" },
          ],
        },
      ],
    },

    // ── Step 3a: Agriculture-specific sub-questions ───────────────
    //
    // Only renders when industries includes "agriculture".
    // Demonstrates the dynamic-question pattern Eric called out.
    {
      id: "agri-questions",
      label: "Agriculture specifics",
      blurb: "We ask these only because you selected Agriculture. Skip irrelevant fields.",
      showIf: { stepId: "industries", questionId: "industries", includes: "agriculture" },
      questions: [
        {
          id: "cropTypes",
          type: "multiselect",
          label: "Crop types you produce",
          options: [
            { value: "grains", label: "Grains (wheat, rice, corn, oats)" },
            { value: "produce-fresh", label: "Fresh produce (vegetables / fruit)" },
            { value: "dairy", label: "Dairy" },
            { value: "meat", label: "Meat / poultry / seafood" },
            { value: "coffee-tea", label: "Coffee / tea" },
            { value: "cocoa-spice", label: "Cocoa / spices" },
            { value: "fiber", label: "Fiber crops (cotton, hemp, flax)" },
            { value: "raw-materials", label: "Raw materials (timber, sugar, rubber)" },
            { value: "specialty", label: "Specialty / heirloom" },
          ],
        },
        {
          id: "annualProductionVolume",
          type: "text",
          label: "Annual production volume",
          maxLength: 80,
          placeholder: "e.g. 2,000 metric tons / 50,000 lbs",
          helper: "Free-form -- we'll parse units in step 5.",
        },
        {
          id: "seasonalAvailability",
          type: "multiselect",
          label: "Months you have product available",
          options: [
            { value: "jan", label: "Jan" }, { value: "feb", label: "Feb" }, { value: "mar", label: "Mar" },
            { value: "apr", label: "Apr" }, { value: "may", label: "May" }, { value: "jun", label: "Jun" },
            { value: "jul", label: "Jul" }, { value: "aug", label: "Aug" }, { value: "sep", label: "Sep" },
            { value: "oct", label: "Oct" }, { value: "nov", label: "Nov" }, { value: "dec", label: "Dec" },
          ],
        },
        {
          id: "growingMethod",
          type: "select",
          label: "Growing method",
          options: [
            { value: "conventional", label: "Conventional" },
            { value: "organic-certified", label: "Organic (certified)" },
            { value: "organic-transitioning", label: "Organic (transitioning)" },
            { value: "regenerative", label: "Regenerative" },
            { value: "hydroponic", label: "Hydroponic / vertical" },
            { value: "fair-trade", label: "Fair Trade certified" },
          ],
        },
      ],
    },

    // ── Step 3b: Apparel-specific sub-questions ───────────────────
    {
      id: "apparel-questions",
      label: "Apparel specifics",
      showIf: { stepId: "industries", questionId: "industries", includes: "apparel" },
      questions: [
        {
          id: "apparelCategories",
          type: "multiselect",
          label: "Apparel categories",
          options: [
            { value: "tops", label: "Tops / Shirts" },
            { value: "bottoms", label: "Bottoms / Pants" },
            { value: "outerwear", label: "Outerwear" },
            { value: "activewear", label: "Activewear" },
            { value: "intimate", label: "Intimate apparel" },
            { value: "accessories", label: "Accessories" },
            { value: "footwear", label: "Footwear" },
            { value: "kids", label: "Kids / babywear" },
          ],
        },
        {
          id: "fabricSpecialties",
          type: "tags",
          label: "Fabric specialties",
          placeholder: "e.g. organic cotton, recycled polyester, merino wool",
        },
        {
          id: "seasonsServed",
          type: "multiselect",
          label: "Seasons you collection-cycle for",
          options: [
            { value: "spring-summer", label: "Spring/Summer" },
            { value: "fall-winter", label: "Fall/Winter" },
            { value: "resort", label: "Resort / Cruise" },
            { value: "year-round", label: "Year-round basics" },
          ],
        },
      ],
    },

    // ── Step 3c: Beauty / personal care ───────────────────────────
    {
      id: "beauty-questions",
      label: "Beauty specifics",
      showIf: { stepId: "industries", questionId: "industries", includes: "beauty" },
      questions: [
        {
          id: "beautyCategories",
          type: "multiselect",
          label: "Categories",
          options: [
            { value: "skincare", label: "Skincare" }, { value: "haircare", label: "Haircare" },
            { value: "makeup", label: "Color cosmetics / makeup" }, { value: "fragrance", label: "Fragrance" },
            { value: "personal-care", label: "Personal care (soap, deo, etc.)" },
            { value: "supplements", label: "Beauty supplements" },
          ],
        },
        {
          id: "regulatoryMarkets",
          type: "multiselect",
          label: "Markets you're regulatory-compliant in",
          options: [
            { value: "fda-us", label: "FDA (US)" }, { value: "ec-eu", label: "EC 1223/2009 (EU)" },
            { value: "mhra-uk", label: "MHRA (UK)" }, { value: "tga-au", label: "TGA (AU)" },
            { value: "ccpsa-ca", label: "CCPSA (CA)" }, { value: "anvisa-br", label: "ANVISA (BR)" },
          ],
        },
        {
          id: "claims",
          type: "multiselect",
          label: "Product claims / formulations",
          options: [
            { value: "vegan", label: "Vegan" }, { value: "cruelty-free", label: "Cruelty-free" },
            { value: "organic", label: "Organic certified" }, { value: "clean", label: "Clean / non-toxic" },
            { value: "fragrance-free", label: "Fragrance-free options" },
          ],
        },
      ],
    },

    // ── Step 3d: Electronics ──────────────────────────────────────
    {
      id: "electronics-questions",
      label: "Electronics specifics",
      showIf: { stepId: "industries", questionId: "industries", includes: "electronics" },
      questions: [
        {
          id: "electronicsCategories",
          type: "multiselect",
          label: "Categories",
          options: [
            { value: "consumer-electronics", label: "Consumer electronics" },
            { value: "components", label: "Components / parts" },
            { value: "wearables", label: "Wearables / IoT" },
            { value: "smart-home", label: "Smart home" },
            { value: "audio", label: "Audio / headphones" },
            { value: "computing", label: "Computing / accessories" },
          ],
        },
        {
          id: "certificationsElectronics",
          type: "multiselect",
          label: "Certifications you carry",
          options: [
            { value: "fcc", label: "FCC (US)" }, { value: "ce", label: "CE (EU)" }, { value: "ukca", label: "UKCA (UK)" },
            { value: "rohs", label: "RoHS" }, { value: "reach", label: "REACH" }, { value: "ul", label: "UL" },
            { value: "etl", label: "ETL" }, { value: "wpc", label: "Qi (WPC)" },
          ],
        },
      ],
    },

    // ── Step 3e: Food & beverage ──────────────────────────────────
    {
      id: "food-questions",
      label: "Food & Beverage specifics",
      showIf: { stepId: "industries", questionId: "industries", includes: "food-bev" },
      questions: [
        {
          id: "foodCategories",
          type: "multiselect",
          label: "Categories",
          options: [
            { value: "snacks", label: "Snacks" }, { value: "beverages", label: "Beverages (non-alc)" },
            { value: "alcohol", label: "Alcoholic beverages" }, { value: "bakery", label: "Bakery" },
            { value: "dairy", label: "Dairy" }, { value: "meat-seafood", label: "Meat / seafood" },
            { value: "produce", label: "Fresh produce" }, { value: "frozen", label: "Frozen" },
            { value: "supplements-food", label: "Supplements / functional foods" },
          ],
        },
        {
          id: "foodCerts",
          type: "multiselect",
          label: "Food safety + standards",
          options: [
            { value: "fda-registered", label: "FDA registered" }, { value: "haccp", label: "HACCP" },
            { value: "sqf", label: "SQF" }, { value: "brc", label: "BRC" }, { value: "iso-22000", label: "ISO 22000" },
            { value: "non-gmo", label: "Non-GMO Project" }, { value: "kosher", label: "Kosher" },
            { value: "halal", label: "Halal" }, { value: "organic-usda", label: "USDA Organic" },
          ],
        },
        { id: "shelfLifeDays", type: "number", label: "Average shelf life (days)", min: 1, max: 3650 },
      ],
    },

    // ── Step 4: Capabilities (universal) ──────────────────────────
    {
      id: "capabilities",
      label: "Manufacturing & capabilities",
      blurb: "What you can do at scale -- drives buyer matching.",
      questions: [
        {
          id: "capabilities",
          type: "multiselect",
          label: "Capabilities you offer",
          options: [
            { value: "private-label", label: "Private label / White label" },
            { value: "custom-formulation", label: "Custom formulation / R&D" },
            { value: "design", label: "Design services" },
            { value: "packaging", label: "Custom packaging" },
            { value: "fulfillment", label: "Fulfillment / 3PL" },
            { value: "samples", label: "Sample production" },
            { value: "dropshipping", label: "Dropshipping" },
          ],
        },
        {
          id: "leadTimeDays",
          type: "number",
          label: "Standard lead time (days, sample to ship)",
          required: true,
          min: 1,
          max: 365,
          helper: "Typical: 14-60 for most categories.",
        },
        {
          id: "monthlyCapacity",
          type: "text",
          label: "Monthly production capacity",
          maxLength: 80,
          placeholder: "e.g. 50,000 units / month",
        },
        {
          id: "moqUnits",
          type: "number",
          label: "Minimum order quantity (units)",
          required: true,
          min: 1,
          max: 10_000_000,
        },
      ],
    },

    // ── Step 5: Distribution + warehouses ─────────────────────────
    {
      id: "distribution",
      label: "Warehouses & distribution",
      blurb: "Where you ship from + the regions you can serve. Powers lane analytics.",
      questions: [
        {
          id: "primaryWarehouse",
          type: "address",
          label: "Primary warehouse / shipping origin",
          helper: "Add more on /portal after onboarding.",
        },
        {
          id: "warehouseCount",
          type: "number",
          label: "How many warehouses do you operate?",
          min: 1,
          max: 100,
        },
        {
          id: "distributionRegions",
          type: "multiselect",
          label: "Regions you ship to",
          required: true,
          options: [
            { value: "us-domestic", label: "US Domestic" },
            { value: "north-america", label: "North America (Canada/Mexico)" },
            { value: "south-america", label: "South America" },
            { value: "eu", label: "European Union" },
            { value: "uk", label: "United Kingdom" },
            { value: "middle-east", label: "Middle East" },
            { value: "africa", label: "Africa" },
            { value: "asia", label: "Asia" },
            { value: "oceania", label: "Australia / NZ / Oceania" },
            { value: "global", label: "Global -- ship anywhere" },
          ],
        },
        {
          id: "shippingMethods",
          type: "multiselect",
          label: "Shipping methods you support",
          options: [
            { value: "ocean-fcl", label: "Ocean (FCL)" },
            { value: "ocean-lcl", label: "Ocean (LCL)" },
            { value: "air-cargo", label: "Air cargo" },
            { value: "ltl", label: "Truck (LTL)" },
            { value: "parcel", label: "Parcel (UPS/FedEx/USPS)" },
            { value: "rail", label: "Rail" },
            { value: "buyer-arrange", label: "Buyer arranges (FOB)" },
          ],
        },
        {
          id: "incoterms",
          type: "multiselect",
          label: "Incoterms you offer",
          options: [
            { value: "EXW", label: "EXW (Ex Works)" }, { value: "FCA", label: "FCA" },
            { value: "FOB", label: "FOB (Free on Board)" }, { value: "CIF", label: "CIF" },
            { value: "DDP", label: "DDP (Delivered Duty Paid)" },
          ],
        },
      ],
    },

    // ── Step 6: Verification documents (slice 7 wires actual upload) ──
    {
      id: "verification",
      label: "Verification documents",
      blurb: "Boost your trust score by uploading verification docs. Optional now -- you can add later.",
      questions: [
        {
          id: "businessLicense",
          type: "file",
          label: "Business license / registration",
          helper: "PDF or image. Slice 7 wires the actual upload.",
        },
        {
          id: "insurance",
          type: "file",
          label: "General liability insurance",
          helper: "Adds a verified-insured badge to your public profile.",
        },
        {
          id: "qualityCerts",
          type: "file",
          label: "Quality certifications",
          helper: "ISO, BRC, SQF, etc. -- whichever you carry.",
        },
        {
          id: "factoryAudit",
          type: "file",
          label: "Most recent factory audit (if applicable)",
          helper: "Sedex / SMETA / BSCI / Higg.",
        },
      ],
    },

    // ── Step 7: Public profile + matching ─────────────────────────
    {
      id: "profile",
      label: "Public verified-supplier profile",
      blurb: "How buyers will see you. Edit anytime in /portal.",
      questions: [
        {
          id: "headline",
          type: "text",
          label: "Headline",
          maxLength: 120,
          placeholder: "e.g. 'USDA Organic spice supplier -- 50+ SKUs, FDA registered'",
          helper: "First thing buyers see on your card. Be specific.",
        },
        {
          id: "elevatorPitch",
          type: "textarea",
          label: "Elevator pitch (3-5 sentences)",
          maxLength: 600,
          placeholder: "Who you serve, what makes you different, top categories.",
        },
        {
          id: "matchOptIn",
          type: "boolean",
          label: "Let AVYN's AI auto-match me to relevant buyers",
          helper: "We'll surface your profile to buyers whose needs fit. You decide whether to engage on each match.",
        },
      ],
    },
  ],
};

const distributorFlow: Flow = {
  persona: "distributor",
  steps: [
    // ── Step 1: Identity ──────────────────────────────────────────
    {
      id: "identity",
      label: "Company identity",
      blurb: "We use this on your verified-distributor profile + on every shipping lane analysis.",
      questions: [
        { id: "legalName", type: "text", label: "Legal company name", required: true, maxLength: 120 },
        { id: "tradeName", type: "text", label: "Trade name (DBA)", maxLength: 120 },
        { id: "fullName", type: "text", label: "Your name", required: true, maxLength: 120 },
        { id: "title", type: "text", label: "Your title", maxLength: 80, placeholder: "Operations Director / Sales Lead" },
        { id: "email", type: "text", label: "Work email", required: true, maxLength: 200 },
        { id: "phone", type: "text", label: "Direct phone", maxLength: 40 },
        { id: "website", type: "text", label: "Company website", maxLength: 200 },
        {
          id: "kind",
          type: "select",
          label: "What kind of operation are you?",
          required: true,
          options: [
            { value: "3pl", label: "3PL / Fulfillment", description: "You hold inventory + ship for brands." },
            { value: "freight-forwarder", label: "Freight forwarder", description: "Ocean / air international." },
            { value: "trucking", label: "Trucking carrier", description: "FTL / LTL domestic." },
            { value: "last-mile", label: "Last-mile delivery", description: "Final-mile / parcel." },
            { value: "warehousing", label: "Warehousing only", description: "Storage, no transport." },
            { value: "broker", label: "Freight broker", description: "Match shippers + carriers." },
            { value: "full-service", label: "Full-service distributor", description: "Storage + transport + customs." },
          ],
        },
      ],
    },

    // ── Step 2: Regions served ────────────────────────────────────
    {
      id: "regions",
      label: "Regions you serve",
      blurb: "Multi-select origin + destination regions. Powers the lane match.",
      questions: [
        {
          id: "originRegions",
          type: "multiselect",
          label: "Origin regions you operate from",
          required: true,
          options: [
            { value: "us-east", label: "US East" },
            { value: "us-central", label: "US Central" },
            { value: "us-west", label: "US West" },
            { value: "canada", label: "Canada" },
            { value: "mexico", label: "Mexico" },
            { value: "eu", label: "European Union" },
            { value: "uk", label: "United Kingdom" },
            { value: "asia-china", label: "China" },
            { value: "asia-india", label: "India" },
            { value: "asia-vietnam", label: "Vietnam" },
            { value: "asia-other", label: "Other Asia" },
            { value: "south-america", label: "South America" },
            { value: "africa", label: "Africa" },
            { value: "middle-east", label: "Middle East" },
          ],
        },
        {
          id: "destinationRegions",
          type: "multiselect",
          label: "Destination regions you can deliver to",
          required: true,
          options: [
            { value: "us-east", label: "US East" },
            { value: "us-central", label: "US Central" },
            { value: "us-west", label: "US West" },
            { value: "canada", label: "Canada" },
            { value: "mexico", label: "Mexico" },
            { value: "eu", label: "European Union" },
            { value: "uk", label: "United Kingdom" },
            { value: "asia", label: "Asia (general)" },
            { value: "south-america", label: "South America" },
            { value: "africa", label: "Africa" },
            { value: "middle-east", label: "Middle East" },
            { value: "global", label: "Global -- deliver anywhere" },
          ],
        },
        {
          id: "specializedLanes",
          type: "tags",
          label: "Specialized lanes (optional)",
          placeholder: "e.g. China to US West Coast, Mexico to Texas border",
          helper: "Free-form. Lanes you have a competitive edge on.",
        },
      ],
    },

    // ── Step 3: Freight methods + capabilities ────────────────────
    {
      id: "freight",
      label: "Freight methods + capabilities",
      questions: [
        {
          id: "freightModes",
          type: "multiselect",
          label: "Freight modes you operate",
          required: true,
          options: [
            { value: "ocean-fcl", label: "Ocean FCL", description: "Full container." },
            { value: "ocean-lcl", label: "Ocean LCL", description: "Less than container." },
            { value: "air-cargo", label: "Air cargo" },
            { value: "ftl", label: "FTL trucking", description: "Full truckload." },
            { value: "ltl", label: "LTL trucking", description: "Less than truckload." },
            { value: "rail", label: "Rail" },
            { value: "intermodal", label: "Intermodal", description: "Mixed mode (e.g. ocean + rail + truck)." },
            { value: "parcel", label: "Parcel (UPS/FedEx/USPS partner)" },
          ],
        },
        {
          id: "specialHandling",
          type: "multiselect",
          label: "Special handling capabilities",
          options: [
            { value: "refrigerated", label: "Refrigerated (cold chain)" },
            { value: "frozen", label: "Frozen" },
            { value: "hazmat", label: "Hazmat / dangerous goods" },
            { value: "oversized", label: "Oversized / heavy haul" },
            { value: "high-value", label: "High-value security" },
            { value: "fragile", label: "Fragile / electronics" },
            { value: "white-glove", label: "White-glove delivery" },
          ],
        },
        {
          id: "customsClearance",
          type: "boolean",
          label: "Handle customs clearance for international shipments",
        },
      ],
    },

    // ── Step 4: Warehouse network ─────────────────────────────────
    {
      id: "warehouses",
      label: "Warehouse network",
      blurb: "We use this to surface you for buyers near your warehouses on the lane dashboard.",
      questions: [
        {
          id: "primaryWarehouse",
          type: "address",
          label: "Primary warehouse",
        },
        {
          id: "warehouseCount",
          type: "number",
          label: "Total warehouses operated",
          required: true,
          min: 1,
          max: 1000,
        },
        {
          id: "totalSqft",
          type: "number",
          label: "Total warehouse capacity (sq ft)",
          min: 0,
          max: 100_000_000,
        },
        {
          id: "warehouseFeatures",
          type: "multiselect",
          label: "Warehouse features",
          options: [
            { value: "bonded", label: "Bonded warehouse" },
            { value: "ftz", label: "FTZ (Foreign Trade Zone)" },
            { value: "racked", label: "Pallet-racked" },
            { value: "climate-controlled", label: "Climate-controlled" },
            { value: "kitting", label: "Kitting / pick-pack" },
            { value: "returns", label: "Returns processing" },
            { value: "cross-dock", label: "Cross-docking" },
          ],
        },
      ],
    },

    // ── Step 5: Delivery timelines + reliability ──────────────────
    {
      id: "timelines",
      label: "Delivery timelines",
      blurb: "Sets buyer expectations on quotes + enables on-time-delivery scoring.",
      questions: [
        {
          id: "domesticTransitDays",
          type: "number",
          label: "Domestic transit time (days, average)",
          min: 1,
          max: 60,
        },
        {
          id: "internationalTransitDays",
          type: "number",
          label: "International transit time (days, average)",
          min: 1,
          max: 90,
        },
        {
          id: "onTimeRate",
          type: "number",
          label: "On-time delivery rate (%)",
          min: 0,
          max: 100,
          helper: "Self-reported. We'll calculate live from your AVYN shipments after a few months of data.",
        },
        {
          id: "trackingProvided",
          type: "boolean",
          label: "Provide buyer-facing tracking",
        },
        {
          id: "guaranteedDelivery",
          type: "boolean",
          label: "Offer guaranteed-delivery windows (with refund on miss)",
          helper: "Boosts your trust score.",
        },
      ],
    },

    // ── Step 6: Pricing + terms ───────────────────────────────────
    {
      id: "pricing",
      label: "Pricing model",
      blurb: "Helps us pre-quote when buyers request lane analysis.",
      questions: [
        {
          id: "pricingModel",
          type: "select",
          label: "Default pricing model",
          required: true,
          options: [
            { value: "spot", label: "Spot pricing", description: "Quote per shipment." },
            { value: "contract", label: "Contract pricing", description: "Negotiated rate cards." },
            { value: "tiered-volume", label: "Tiered by volume", description: "Discounts at volume thresholds." },
            { value: "hybrid", label: "Hybrid (spot + contract)" },
          ],
        },
        {
          id: "minShipmentValue",
          type: "number",
          label: "Minimum shipment value (USD)",
          min: 0,
          max: 1_000_000,
        },
        {
          id: "fuelSurcharge",
          type: "boolean",
          label: "Pass-through fuel surcharge",
        },
      ],
    },

    // ── Step 7: Verification documents ────────────────────────────
    {
      id: "verification",
      label: "Verification documents",
      blurb: "Required for verified-distributor status. Slice 7 wires the upload.",
      questions: [
        { id: "businessLicense", type: "file", label: "Business license / DOT registration" },
        { id: "insurance", type: "file", label: "Cargo insurance (COI)", helper: "Min coverage varies by lane / mode." },
        { id: "carrierAuth", type: "file", label: "Carrier authority (MC# for trucking, FMC for ocean)", helper: "Skip if you're warehousing-only." },
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
