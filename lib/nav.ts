import {
  Activity,
  Lightbulb,
  LayoutDashboard,
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
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Command Center", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "Discover",
    items: [
      { label: "Product Discovery", href: "/products", icon: Package },
      { label: "Demand Intelligence", href: "/demand", icon: TrendingUp },
      { label: "Live Signals", href: "/signals", icon: Database, badge: "LIVE" },
      { label: "Insights & Forecasts", href: "/insights", icon: Telescope, badge: "PRO" },
      { label: "Buyer Discovery", href: "/buyers", icon: Users },
      { label: "Supplier Finder", href: "/suppliers", icon: Factory },
    ],
  },
  {
    title: "Outreach",
    items: [
      { label: "Inbound Leads", href: "/leads", icon: Inbox },
      { label: "Outreach Automation", href: "/outreach", icon: Send },
      { label: "AI Agents", href: "/agents", icon: Bot, badge: "AI" },
      { label: "Auto Pipeline", href: "/pipeline", icon: Zap, badge: "AUTO" },
      { label: "Approvals", href: "/approvals", icon: ShieldCheck, badge: "REVIEW" },
      { label: "Suggestions", href: "/suggestions", icon: Lightbulb, badge: "AI" },
      { label: "Tasks", href: "/tasks", icon: FileText },
      { label: "CRM Pipeline", href: "/crm", icon: Workflow },
    ],
  },
  {
    title: "Transact",
    items: [
      { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, badge: "NEW" },
      { label: "Escrow Center", href: "/escrow", icon: Landmark, badge: "NEW" },
      { label: "Contracts", href: "/contracts", icon: ScrollText, badge: "NEW" },
      { label: "Deals & Quotes", href: "/deals", icon: Scale },
      { label: "Marketplace", href: "/marketplace", icon: Store, badge: "FEE" },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Earnings", href: "/earnings", icon: DollarSign, badge: "$" },
      { label: "Reports & Analytics", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Risk Center", href: "/risk", icon: ShieldAlert },
      { label: "Learning Engine", href: "/learning", icon: Brain },
      { label: "Agent Runs", href: "/agent-runs", icon: Bot, badge: "LIVE" },
      { label: "Share Activity", href: "/share-activity", icon: Activity, badge: "LIVE" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Agent Store", href: "/agent-store", icon: Plug },
      { label: "Automations", href: "/automations", icon: Zap },
      { label: "Data Sources", href: "/data-sources", icon: Database },
      { label: "Integrations", href: "/integrations", icon: Plug },
    ],
  },
];

// Flat list for backwards compat (command palette, etc.)
export const PRIMARY_NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export const ADMIN_NAV: NavItem[] = [
  { label: "Super Admin", href: "/admin", icon: ShieldCheck },
  { label: "Users & Roles", href: "/admin/users", icon: Users },
  { label: "Billing & Plans", href: "/admin/billing", icon: FileText },
  { label: "API Keys", href: "/admin/api-keys", icon: Plug },
  { label: "White-label", href: "/admin/branding", icon: Palette },
  { label: "System Logs", href: "/admin/logs", icon: Database },
  { label: "Audit Logs", href: "/admin/audit", icon: ShieldAlert },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];
