"use client";
import {
  Check,
  ChevronDown,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type Role = "Owner" | "Admin" | "Operator" | "Viewer" | "Billing";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "Active" | "Invited" | "Suspended";
  lastActive: string;
  joinedAt: string;
  initials: string;
  agents?: string[];
  twoFactor: boolean;
};

const MEMBERS: Member[] = [
  { id: "u1", name: "Eric Moore", email: "Ericduolo4@gmail.com", role: "Owner", status: "Active", lastActive: "Just now", joinedAt: "Jan 18, 2024", initials: "EM", twoFactor: true },
  { id: "u2", name: "Sarah Chen", email: "sarah@acmebrand.com", role: "Admin", status: "Active", lastActive: "12 min ago", joinedAt: "Jan 18, 2024", initials: "SC", twoFactor: true },
  { id: "u3", name: "Marcus Brooks", email: "marcus@acmebrand.com", role: "Operator", status: "Active", lastActive: "2h ago", joinedAt: "Feb 04, 2024", initials: "MB", twoFactor: true, agents: ["Outreach", "CRM"] },
  { id: "u4", name: "Priya Patel", email: "priya@acmebrand.com", role: "Operator", status: "Active", lastActive: "Yesterday", joinedAt: "Feb 22, 2024", initials: "PP", twoFactor: false, agents: ["Buyer Discovery"] },
  { id: "u5", name: "Aiko Tanaka", email: "aiko@acmebrand.com", role: "Operator", status: "Active", lastActive: "5h ago", joinedAt: "Mar 11, 2024", initials: "AT", twoFactor: true, agents: ["Outreach"] },
  { id: "u6", name: "Daniel Brooks", email: "daniel@acmebrand.com", role: "Viewer", status: "Active", lastActive: "3 days ago", joinedAt: "Apr 02, 2024", initials: "DB", twoFactor: false },
  { id: "u7", name: "Lena Mueller", email: "lena.m@external-vendor.com", role: "Viewer", status: "Invited", lastActive: "—", joinedAt: "—", initials: "LM", twoFactor: false },
  { id: "u8", name: "Thomas Schmidt", email: "thomas@acmebrand.com", role: "Billing", status: "Active", lastActive: "1 week ago", joinedAt: "Mar 28, 2024", initials: "TS", twoFactor: true },
  { id: "u9", name: "Maya Singh", email: "maya@acmebrand.com", role: "Operator", status: "Suspended", lastActive: "1 month ago", joinedAt: "Feb 15, 2024", initials: "MS", twoFactor: false },
];

const ROLE_TONE: Record<Role, string> = {
  Owner: "bg-gradient-brand text-white",
  Admin: "bg-brand-500/15 text-brand-200",
  Operator: "bg-accent-blue/15 text-accent-blue",
  Viewer: "bg-bg-hover text-ink-secondary",
  Billing: "bg-accent-green/15 text-accent-green",
};

const STATUS_TONE: Record<string, string> = {
  Active: "bg-accent-green/15 text-accent-green",
  Invited: "bg-accent-amber/15 text-accent-amber",
  Suspended: "bg-accent-red/15 text-accent-red",
};

const ROLE_PERMISSIONS: Record<Role, { area: string; level: "All" | "Read" | "Own" | "None" }[]> = {
  Owner: [
    { area: "Workspace", level: "All" },
    { area: "Billing", level: "All" },
    { area: "Agents", level: "All" },
    { area: "CRM Pipeline", level: "All" },
    { area: "Marketplace", level: "All" },
  ],
  Admin: [
    { area: "Workspace", level: "All" },
    { area: "Billing", level: "Read" },
    { area: "Agents", level: "All" },
    { area: "CRM Pipeline", level: "All" },
    { area: "Marketplace", level: "All" },
  ],
  Operator: [
    { area: "Workspace", level: "Read" },
    { area: "Billing", level: "None" },
    { area: "Agents", level: "Own" },
    { area: "CRM Pipeline", level: "Own" },
    { area: "Marketplace", level: "Read" },
  ],
  Viewer: [
    { area: "Workspace", level: "Read" },
    { area: "Billing", level: "None" },
    { area: "Agents", level: "Read" },
    { area: "CRM Pipeline", level: "Read" },
    { area: "Marketplace", level: "Read" },
  ],
  Billing: [
    { area: "Workspace", level: "None" },
    { area: "Billing", level: "All" },
    { area: "Agents", level: "None" },
    { area: "CRM Pipeline", level: "None" },
    { area: "Marketplace", level: "None" },
  ],
};

const LEVEL_TONE: Record<string, string> = {
  All: "text-accent-green",
  Read: "text-accent-blue",
  Own: "text-accent-amber",
  None: "text-ink-tertiary",
};

export default function UsersPage() {
  const [list, setList] = useState(MEMBERS);
  const [query, setQuery] = useState("");
  const [filterRole, setFilterRole] = useState<Role | "All">("All");
  const [openInvite, setOpenInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("Operator");

  const filtered = useMemo(() => {
    return list.filter((m) => {
      if (filterRole !== "All" && m.role !== filterRole) return false;
      if (
        query &&
        !m.name.toLowerCase().includes(query.toLowerCase()) &&
        !m.email.toLowerCase().includes(query.toLowerCase())
      )
        return false;
      return true;
    });
  }, [list, query, filterRole]);

  const counts = {
    Total: list.length,
    Active: list.filter((m) => m.status === "Active").length,
    Invited: list.filter((m) => m.status === "Invited").length,
    "2FA on": list.filter((m) => m.twoFactor).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Users &amp; Roles</h1>
            <p className="text-xs text-ink-secondary">
              {counts.Active} active · {counts.Invited} pending invites · {counts["2FA on"]} of {counts.Total} have 2FA
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpenInvite(true)}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
        >
          <UserPlus className="h-4 w-4" /> Invite member
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{k}</div>
            <div className="mt-1 text-2xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      {openInvite && (
        <div className="rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-500/5 to-transparent p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Invite a new member</div>
            <button onClick={() => setOpenInvite(false)} className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px_auto]">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@yourcompany.com"
                className="h-10 w-full rounded-lg border border-bg-border bg-bg-card pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
            >
              {(["Admin", "Operator", "Viewer", "Billing"] as Role[]).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!inviteEmail) return;
                setList([
                  {
                    id: `u${list.length + 1}`,
                    name: inviteEmail.split("@")[0].replace(/[\.\-_]/g, " "),
                    email: inviteEmail,
                    role: inviteRole,
                    status: "Invited",
                    lastActive: "—",
                    joinedAt: "—",
                    initials: inviteEmail.slice(0, 2).toUpperCase(),
                    twoFactor: false,
                  },
                  ...list,
                ]);
                setInviteEmail("");
                setOpenInvite(false);
              }}
              className="rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow"
            >
              Send invite
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
              {(["All", "Owner", "Admin", "Operator", "Viewer", "Billing"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setFilterRole(r as Role | "All")}
                  className={`rounded-md px-2.5 py-1 ${
                    filterRole === r
                      ? "bg-brand-500/15 text-brand-200"
                      : "text-ink-secondary hover:bg-bg-hover"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr className="border-b border-bg-border">
                  <th className="px-5 py-2.5 text-left font-medium">Member</th>
                  <th className="px-3 py-2.5 text-left font-medium">Role</th>
                  <th className="px-3 py-2.5 text-left font-medium">Agents</th>
                  <th className="px-3 py-2.5 text-left font-medium">2FA</th>
                  <th className="px-3 py-2.5 text-left font-medium">Last active</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-brand text-xs font-bold">
                          {m.initials}
                        </div>
                        <div>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-[11px] text-ink-tertiary">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${ROLE_TONE[m.role]}`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {m.agents ? (
                        <div className="flex flex-wrap gap-1">
                          {m.agents.map((a) => (
                            <span
                              key={a}
                              className="rounded-md bg-bg-hover/60 px-1.5 py-0.5 text-[10px] text-ink-secondary"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-ink-tertiary">All</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.twoFactor ? (
                        <ShieldCheck className="h-4 w-4 text-accent-green" />
                      ) : (
                        <Shield className="h-4 w-4 text-ink-tertiary" />
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink-secondary">{m.lastActive}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[m.status]}`}>
                          {m.status}
                        </span>
                        <button className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-bg-border bg-bg-card">
            <div className="border-b border-bg-border px-5 py-3.5 text-sm font-semibold">
              Role permissions
            </div>
            <div className="space-y-3 p-4">
              {(Object.keys(ROLE_PERMISSIONS) as Role[]).map((r) => (
                <div key={r} className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${ROLE_TONE[r]}`}>
                      {r}
                    </span>
                    <span className="text-[10px] text-ink-tertiary">
                      {list.filter((m) => m.role === r).length} member{list.filter((m) => m.role === r).length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {ROLE_PERMISSIONS[r].map((p) => (
                      <div key={p.area} className="flex items-center justify-between">
                        <span className="text-ink-secondary">{p.area}</span>
                        <span className={LEVEL_TONE[p.level]}>{p.level}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-sm font-semibold">Security</div>
            <div className="mt-3 space-y-2 text-xs">
              <Row k="Require 2FA for Admins" v="On" tone="text-accent-green" />
              <Row k="SSO (Okta SAML)" v="Connected" tone="text-accent-green" />
              <Row k="SCIM provisioning" v="Connected" tone="text-accent-green" />
              <Row k="IP allowlist" v="3 ranges" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-secondary">{k}</span>
      <span className={tone ?? ""}>{v}</span>
    </div>
  );
}
