import {
  Activity,
  Building2,
  GitBranch,
  Globe,
  Layers,
  Lightbulb,
  LayoutDashboard,
  MailX,
  Package,
  TrendingUp,
  Factory,
  Users,
  Send,
  Workflow,
  FileText,
  Bot,
  ShieldAlert,
  BarChart3,
  Zap,
  Database,
  Brain,
  Plug,
  ShieldCheck,
  Settings as SettingsIcon,
  DollarSign,
  Telescope,
  Store,
  Palette,
  Scale,
  Landmark,
  ScrollText,
  ArrowLeftRight,
  Inbox,
  PhoneCall,
  Stethoscope,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  /**
   * Capability required to even see this nav item. When unset, every
   * authenticated user sees it (e.g. Command Center landing page).
   * Owner always sees every nav item regardless.
   *
   * Capability strings mirror lib/capabilities.ts; kept as plain
   * strings here so nav.ts stays free of the capabilities import
   * (the capability catalog is fetched via /api/auth/me at runtime).
   */
  requires?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      // Landing page — no specific capability needed; every authed user
      // gets the Command Center as their home (the cards within self-
      // gate based on what their role can fetch).
      { label: "Command Center", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "Discover",
    items: [
      // Product discovery / demand / signals are read-only research
      // surfaces. We map them to reports:read since they're closest to
      // "analytics" in spirit.
      { label: "Product Discovery", href: "/products", icon: Package, requires: "reports:read" },
      { label: "Demand Intelligence", href: "/demand", icon: TrendingUp, requires: "reports:read" },
      { label: "Live Signals", href: "/signals", icon: Database, badge: "LIVE", requires: "reports:read" },
      { label: "Insights & Forecasts", href: "/insights", icon: Telescope, badge: "PRO", requires: "reports:read" },
      // Buyer / supplier / business directory feed the leads funnel.
      { label: "Buyer Discovery", href: "/buyers", icon: Users, requires: "leads:read" },
      { label: "Supplier Finder", href: "/suppliers", icon: Factory, requires: "leads:read" },
      { label: "Supplier Registry", href: "/admin/suppliers", icon: ShieldCheck, badge: "NEW", requires: "leads:read" },
      { label: "Business Directory", href: "/admin/businesses", icon: Building2, badge: "NEW", requires: "leads:read" },
      // Supply graph is system-level data infrastructure.
      { label: "Supply Graph", href: "/admin/edges", icon: GitBranch, badge: "NEW", requires: "system:read" },
      // Cross-supplier shipping-lane rollup (Layer 6 aggregate view).
      { label: "Distribution Lanes", href: "/admin/lanes", icon: Globe, badge: "NEW", requires: "leads:read" },
    ],
  },
  {
    title: "Outreach",
    items: [
      // Unified queue lands first — operator's "what should I do next"
      // surface across every channel + direction. Backed by /api/queue
      // which derives items at request time from tasks, voicemails,
      // lead.inboundSms[], lead-followup candidates, and brand-new leads.
      { label: "Queue", href: "/queue", icon: Inbox, badge: "NEW", requires: "leads:read" },
      // Cadences -- sequenced multi-touch outreach (slice 3 engine,
      // slice 5 admin UI). Define recipes here, enroll buyers from
      // their detail page, watch scheduled steps land on /queue.
      { label: "Cadences", href: "/cadences", icon: Workflow, badge: "NEW", requires: "outreach:read" },
      { label: "Inbound Leads", href: "/leads", icon: Inbox, badge: "LIVE", requires: "leads:read" },
      { label: "Outreach Automation", href: "/outreach", icon: Send, requires: "outreach:read" },
      { label: "Job Queue", href: "/admin/outreach-jobs", icon: Layers, badge: "NEW", requires: "outreach:read" },
      // AI agents drive outreach + leads, so gating on outreach:read.
      { label: "AI Agents", href: "/agents", icon: Bot, badge: "AI", requires: "outreach:read" },
      { label: "Auto Pipeline", href: "/pipeline", icon: Zap, badge: "AUTO", requires: "deals:read" },
      // Approvals queue mixes leads + drafts + risk flags — leads:read
      // is the broad gate since most queued items originate there.
      { label: "Approvals", href: "/approvals", icon: ShieldCheck, badge: "REVIEW", requires: "leads:read" },
      { label: "Suggestions", href: "/suggestions", icon: Lightbulb, badge: "AI", requires: "outreach:read" },
      { label: "Tasks", href: "/tasks", icon: FileText, requires: "leads:read" },
      { label: "Call Log", href: "/calls", icon: PhoneCall, badge: "NEW", requires: "voice:read" },
      { label: "CRM Pipeline", href: "/crm", icon: Workflow, requires: "deals:read" },
    ],
  },
  {
    title: "Transact",
    items: [
      { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, badge: "NEW", requires: "transactions:read" },
      { label: "Escrow Center", href: "/escrow", icon: Landmark, badge: "NEW", requires: "transactions:read" },
      { label: "Contracts", href: "/contracts", icon: ScrollText, badge: "NEW", requires: "transactions:read" },
      { label: "Deals & Quotes", href: "/deals", icon: Scale, requires: "deals:read" },
      { label: "Marketplace", href: "/marketplace", icon: Store, badge: "FEE", requires: "deals:read" },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Earnings", href: "/earnings", icon: DollarSign, badge: "$", requires: "earnings:read" },
      { label: "Reports & Analytics", href: "/reports", icon: BarChart3, requires: "reports:read" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      // Risk Center surfaces transaction + leads anomalies. Gating on
      // transactions:read since the most sensitive content lives there.
      { label: "Risk Center", href: "/risk", icon: ShieldAlert, requires: "transactions:read" },
      { label: "Learning Engine", href: "/learning", icon: Brain, requires: "reports:read" },
      { label: "Agent Runs", href: "/agent-runs", icon: Bot, badge: "LIVE", requires: "system:read" },
      { label: "Share Activity", href: "/share-activity", icon: Activity, badge: "LIVE", requires: "transactions:read" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Agent Store", href: "/agent-store", icon: Plug, requires: "system:read" },
      { label: "Automations", href: "/automations", icon: Zap, requires: "outreach:read" },
      { label: "Data Sources", href: "/data-sources", icon: Database, requires: "apikeys:read" },
      { label: "Integrations", href: "/integrations", icon: Plug, requires: "apikeys:read" },
    ],
  },
];

// Flat list for backwards compat (command palette, etc.)
export const PRIMARY_NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/**
 * Look up the capability required to view a given pathname. Used by
 * the layout-level guard in app/(app)/layout.tsx to render an
 * unauthorized wall before pages 403 their data fetches.
 *
 * Match policy: longest `href` prefix wins. So `/admin/system-health`
 * matches the System Health nav item (system:read) rather than the
 * generic `/admin` Super Admin item. Items without `requires` (e.g.
 * the Command Center landing page) return undefined and the guard
 * passes through unconditionally.
 *
 * Returns undefined for paths that don't match any nav item — those
 * pages remain ungated by this helper. Public pages (/share/*, /quote/*,
 * /invite/*) never hit this since they're outside the (app) group.
 */
export function requiredCapabilityForPath(pathname: string): string | undefined {
  const all: NavItem[] = [...PRIMARY_NAV, ...ADMIN_NAV];
  let bestMatch: NavItem | null = null;
  let bestLen = -1;
  for (const item of all) {
    const matches = item.href === "/"
      ? pathname === "/"
      : pathname === item.href || pathname.startsWith(item.href + "/");
    if (matches && item.href.length > bestLen) {
      bestMatch = item;
      bestLen = item.href.length;
    }
  }
  return bestMatch?.requires;
}

export const ADMIN_NAV: NavItem[] = [
  // Super Admin landing page is system-level — gating on system:read.
  { label: "Super Admin", href: "/admin", icon: ShieldCheck, requires: "system:read" },
  { label: "System Health", href: "/admin/system-health", icon: Stethoscope, badge: "NEW", requires: "system:read" },
  { label: "Users & Roles", href: "/admin/users", icon: Users, requires: "users:read" },
  // Onboarding sessions -- live view of every prospect/teammate
  // walking through the persona-aware setup flow. Drill in to see
  // their answers + uploaded docs, delete spam/test sessions.
  { label: "Onboarding Sessions", href: "/admin/onboarding-sessions", icon: Inbox, badge: "NEW", requires: "users:read" },
  // Workspace config -- the admin onboarding answers that actually
  // drive app behavior (AI tone, approval mode, daily send cap, etc.).
  // Edit inline without re-running onboarding.
  { label: "Workspace Config", href: "/admin/workspace-config", icon: SettingsIcon, badge: "NEW", requires: "system:read" },
  { label: "Billing & Plans", href: "/admin/billing", icon: FileText, requires: "billing:read" },
  { label: "API Keys", href: "/admin/api-keys", icon: Plug, requires: "apikeys:read" },
  { label: "Suppressions", href: "/admin/suppressions", icon: MailX, badge: "NEW", requires: "system:read" },
  { label: "White-label", href: "/admin/branding", icon: Palette, requires: "system:write" },
  { label: "System Logs", href: "/admin/logs", icon: Database, requires: "system:read" },
  { label: "Audit Logs", href: "/admin/audit", icon: ShieldAlert, requires: "audit:read" },
  // Settings = personal workspace settings, every authed user sees it.
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];
