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
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

export const PRIMARY_NAV: NavItem[] = [
  { label: "Command Center", href: "/", icon: LayoutDashboard },
  { label: "Product Discovery", href: "/products", icon: Package },
  { label: "Demand Intelligence", href: "/demand", icon: TrendingUp },
  { label: "Insights & Forecasts", href: "/insights", icon: Telescope, badge: "PRO" },
  { label: "Supplier Finder", href: "/suppliers", icon: Factory },
  { label: "Buyer Discovery", href: "/buyers", icon: Users },
  { label: "Outreach Automation", href: "/outreach", icon: Send },
  { label: "CRM Pipeline", href: "/crm", icon: Workflow },
  { label: "Tasks", href: "/tasks", icon: FileText },
  { label: "Approvals", href: "/approvals", icon: ShieldCheck, badge: "REVIEW" },
  { label: "Suggestions", href: "/suggestions", icon: Lightbulb, badge: "AI" },
  { label: "Deals & Quotes", href: "/deals", icon: FileText },
  { label: "Marketplace", href: "/marketplace", icon: Store, badge: "FEE" },
  { label: "Earnings", href: "/earnings", icon: DollarSign, badge: "$" },
  { label: "AI Agents", href: "/agents", icon: Bot, badge: "AI" },
  { label: "Pipeline", href: "/pipeline", icon: Zap, badge: "AUTO" },
  { label: "Share Activity", href: "/share-activity", icon: Activity, badge: "LIVE" },
  { label: "Agent Runs", href: "/agent-runs", icon: Bot, badge: "LIVE" },
  { label: "Live Signals", href: "/signals", icon: Database, badge: "LIVE" },
  { label: "Agent Store", href: "/agent-store", icon: Plug },
  { label: "Risk Center", href: "/risk", icon: ShieldAlert },
  { label: "Reports & Analytics", href: "/reports", icon: BarChart3 },
  { label: "Automations", href: "/automations", icon: Zap },
  { label: "Data Sources", href: "/data-sources", icon: Database },
  { label: "Learning Engine", href: "/learning", icon: Brain },
  { label: "Integrations", href: "/integrations", icon: Plug },
];

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
