"use client";
import {
  AlertCircle,
  Check,
  Loader2,
  Mail,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

type Role = "Owner" | "Admin" | "Operator" | "Viewer" | "Billing";
type InviteRole = Exclude<Role, "Owner">;
type InviteStatus = "pending" | "accepted" | "cancelled" | "expired";

type Owner = {
  id: "owner";
  name: string;
  email: string;
  role: "Owner";
  title: string;
  company: string;
  initials: string;
  twoFactor: boolean | null;
  lastActive: string;
};

type Invite = {
  id: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  invitedBy: string;
  acceptedAt?: string;
  cancelledAt?: string;
  // Token is included in the /api/admin/users response so the operator's
  // "Copy link" button can construct the accept URL without a second
  // round-trip. Stays scoped to the admin surface (admin auth required).
  token?: string;
};

type UsersPayload = {
  owner: Owner;
  invites: Invite[];
  counts: { total: number; active: number; pending: number; twoFactorOn: number };
  capabilities: {
    perUserAuth: boolean;
    ssoConfigured: boolean;
    scimConfigured: boolean;
    twoFactorTracked: boolean;
    acceptanceFlow: boolean;
  };
};

const ROLE_TONE: Record<Role, string> = {
  Owner: "bg-gradient-brand text-white",
  Admin: "bg-brand-500/15 text-brand-200",
  Operator: "bg-accent-blue/15 text-accent-blue",
  Viewer: "bg-bg-hover text-ink-secondary",
  Billing: "bg-accent-green/15 text-accent-green",
};

const STATUS_TONE: Record<InviteStatus | "Active", string> = {
  Active: "bg-accent-green/15 text-accent-green",
  pending: "bg-accent-amber/15 text-accent-amber",
  accepted: "bg-accent-green/15 text-accent-green",
  cancelled: "bg-bg-hover text-ink-tertiary",
  expired: "bg-bg-hover text-ink-tertiary",
};

// Today's actual permission story. Honest: only the owner has any
// privileges because per-user auth isn't wired yet. Other roles are
// "planned" — the operator can plan the team and create invites, but
// the next slice is what actually enforces these.
type Level = "All" | "Read" | "Own" | "None" | "Planned";
const ROLE_PERMISSIONS: Record<Role, { area: string; level: Level }[]> = {
  Owner: [
    { area: "Workspace", level: "All" },
    { area: "Billing", level: "All" },
    { area: "Agents", level: "All" },
    { area: "CRM Pipeline", level: "All" },
    { area: "Marketplace", level: "All" },
  ],
  Admin: [
    { area: "Workspace", level: "Planned" },
    { area: "Billing", level: "Planned" },
    { area: "Agents", level: "Planned" },
    { area: "CRM Pipeline", level: "Planned" },
    { area: "Marketplace", level: "Planned" },
  ],
  Operator: [
    { area: "Workspace", level: "Planned" },
    { area: "Billing", level: "Planned" },
    { area: "Agents", level: "Planned" },
    { area: "CRM Pipeline", level: "Planned" },
    { area: "Marketplace", level: "Planned" },
  ],
  Viewer: [
    { area: "Workspace", level: "Planned" },
    { area: "Billing", level: "Planned" },
    { area: "Agents", level: "Planned" },
    { area: "CRM Pipeline", level: "Planned" },
    { area: "Marketplace", level: "Planned" },
  ],
  Billing: [
    { area: "Workspace", level: "Planned" },
    { area: "Billing", level: "Planned" },
    { area: "Agents", level: "Planned" },
    { area: "CRM Pipeline", level: "Planned" },
    { area: "Marketplace", level: "Planned" },
  ],
};

const LEVEL_TONE: Record<Level, string> = {
  All: "text-accent-green",
  Read: "text-accent-blue",
  Own: "text-accent-amber",
  None: "text-ink-tertiary",
  Planned: "text-ink-tertiary italic",
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default function UsersPage() {
  const [data, setData] = useState<UsersPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filterRole, setFilterRole] = useState<Role | "All">("All");
  const [openInvite, setOpenInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("Operator");
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Live snapshot of the email check from /api/admin/system-health so we
  // can warn the operator BEFORE they click Invite that delivery won't
  // actually happen. Saves the "I sent the invite but they didn't get it"
  // confusion that prompted this whole slice.
  const [emailHealth, setEmailHealth] = useState<{
    ok: boolean;
    provider?: string;
    liveMode?: boolean;
    fixHint?: string;
  } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/admin/system-health", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.checks?.email) return;
        const e = d.checks.email;
        setEmailHealth({
          ok: e.ok,
          provider: e.detail?.provider as string | undefined,
          liveMode: e.detail?.liveMode as boolean | undefined,
          fixHint: e.detail?.fixHint as string | undefined,
        });
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      if (r.status === 401) {
        setLoadError("Not signed in — visit /signin and try again.");
        setData(null);
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setLoadError(`API returned ${r.status}: ${body.error ?? r.statusText}`);
        return;
      }
      const d = (await r.json()) as UsersPayload;
      setData(d);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Build the unified members list: owner + invites (each invite is a row)
  type Row =
    | { kind: "owner"; owner: Owner }
    | { kind: "invite"; invite: Invite };
  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const out: Row[] = [{ kind: "owner", owner: data.owner }];
    for (const inv of data.invites) out.push({ kind: "invite", invite: inv });
    return out;
  }, [data]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const role: Role = r.kind === "owner" ? "Owner" : r.invite.role;
      if (filterRole !== "All" && role !== filterRole) return false;
      if (query) {
        const q = query.toLowerCase();
        const email = r.kind === "owner" ? r.owner.email : r.invite.email;
        const name = r.kind === "owner" ? r.owner.name : r.invite.email;
        if (!email.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, filterRole]);

  async function submitInvite() {
    if (!inviteEmail) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Invite failed (${r.status})`);
      // Show the REAL email-send status, not a generic "Invited" success.
      // Operator was previously blind to "Postmark rejected" / "simulated
      // because no provider" / "redirected to test recipient" cases.
      const e = d.email ?? {};
      if (e.ok && !e.simulated) {
        toast(
          `Invited ${inviteEmail} as ${inviteRole} · email delivered via ${e.provider}`,
          "success",
        );
      } else if (e.simulated) {
        toast(
          `Invited ${inviteEmail} — email SIMULATED (no provider configured). Copy the accept link from the invite row.`,
          "info",
        );
      } else if (e.suppressed) {
        toast(
          `Invited ${inviteEmail} — address is on the suppression list. Un-suppress at /admin/suppressions, then Resend.`,
          "error",
        );
      } else if (e.redirectedFrom) {
        toast(
          `Invited ${inviteEmail} — email redirected to ${e.sentTo} (EMAIL_LIVE=false). Set EMAIL_LIVE=true to deliver.`,
          "info",
        );
      } else {
        toast(
          `Invited ${inviteEmail} but EMAIL FAILED${e.errorMessage ? ` — ${e.errorMessage}` : ""}. Copy the accept link from the invite row.`,
          "error",
        );
      }
      setInviteEmail("");
      setOpenInvite(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Invite failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Re-send an invite. Used when the original send failed silently
   * (Postmark not approved / EMAIL_LIVE=false / wrong domain). Reuses
   * the existing token + expiry; just hits the email path again.
   */
  const [resendingId, setResendingId] = useState<string | null>(null);
  async function resendInvite(inv: Invite) {
    setResendingId(inv.id);
    try {
      const r = await fetch(`/api/admin/invites/${inv.id}/resend`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Resend failed (${r.status})`);
      const e = d.email ?? {};
      if (e.ok && !e.simulated) {
        toast(`Resent invite to ${inv.email} via ${e.provider}`, "success");
      } else if (e.simulated) {
        toast(`Resend simulated (no provider). Copy the accept link from the invite row.`, "info");
      } else if (e.suppressed) {
        toast(`${inv.email} is on the suppression list — un-suppress first`, "error");
      } else {
        toast(
          `Resend failed${e.errorMessage ? ` — ${e.errorMessage}` : ""}. Copy the accept link from the invite row.`,
          "error",
        );
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Resend failed", "error");
    } finally {
      setResendingId(null);
    }
  }

  /**
   * Copy the accept URL to clipboard. Failsafe for when email can't be
   * delivered -- operator can paste the link to the invitee via Slack /
   * Signal / whatever channel works.
   */
  async function copyAcceptLink(inv: Invite) {
    // Server returns the token in the listing payload for this admin surface.
    // Fall back to fetching the single-invite endpoint if it's somehow missing
    // (older clients, mid-deploy, etc).
    let token = inv.token;
    if (!token) {
      try {
        const r = await fetch(`/api/admin/invites/${inv.id}`, { cache: "no-store" });
        const d = await r.json();
        token = d?.invite?.token;
      } catch {}
    }
    if (!token) {
      toast("Couldn't fetch invite token — try Resend instead", "error");
      return;
    }
    const origin = window.location.origin;
    const url = `${origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(`Copied accept link for ${inv.email}`, "success");
    } catch {
      // Some browsers block clipboard access on non-https or without focus
      toast(`Copy failed — link is ${url}`, "info");
    }
  }

  async function cancelInvite(inv: Invite) {
    if (!confirm(`Cancel invite for ${inv.email}?`)) return;
    setCancellingId(inv.id);
    try {
      const r = await fetch(`/api/admin/invites/${inv.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Cancel failed (${r.status})`);
      toast(`Cancelled invite for ${inv.email}`, "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Cancel failed", "error");
    } finally {
      setCancellingId(null);
    }
  }

  const counts = data?.counts ?? { total: 0, active: 0, pending: 0, twoFactorOn: 0 };
  const tilesData: { k: string; v: string | number; hint?: string }[] = [
    { k: "Total seats", v: counts.total },
    { k: "Active", v: counts.active, hint: "owner today" },
    { k: "Pending invites", v: counts.pending },
    {
      k: "2FA tracked",
      v: data?.capabilities.twoFactorTracked ? counts.twoFactorOn : "—",
      hint: data?.capabilities.twoFactorTracked ? undefined : "not tracked yet",
    },
  ];

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
              {counts.active} active · {counts.pending} pending invite{counts.pending === 1 ? "" : "s"}
              {data && (
                <>
                  {" · "}
                  <span className="text-ink-tertiary">
                    workspace identity from{" "}
                    <code className="rounded bg-bg-hover px-1 text-[10px]">OPERATOR_*</code> env vars
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpenInvite((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
        >
          <UserPlus className="h-4 w-4" /> {openInvite ? "Close" : "Invite member"}
        </button>
      </div>

      {/* Honest capability banner — anchored to per-user-auth status, not
          acceptance status. Acceptance now works (invitees can confirm via
          /invite/[token]) but per-user sign-in + role enforcement is the
          remaining gap. */}
      {data && !data.capabilities.perUserAuth && (
        <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
          <div className="flex items-start gap-3 text-[12px]">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
              <AlertCircle className="h-3.5 w-3.5 text-accent-amber" />
            </div>
            <div className="flex-1 text-ink-secondary">
              <span className="font-semibold text-accent-amber">Single-operator mode</span>
              {" "}
              — invites are <strong>real</strong>:
              {data.capabilities.acceptanceFlow
                ? " they're persisted, emailed with a working accept link, and the invitee can confirm via /invite/[token]."
                : " they're persisted, emailed, and cancellable."}
              {" "}Per-user sign-in + role enforcement ship in the next slice.
              Today the workspace has one privileged identity: the owner email above.
              Roles you assign are stored so the next slice can enforce them.
            </div>
          </div>
        </div>
      )}

      {/* Email-health banner -- when delivery is broken/simulated, warn
          the operator BEFORE they click Invite. Saves the "I sent the
          invite but they didn't get it" debugging cycle. Surfaces the
          specific cause + a one-click jump to the fix. */}
      {emailHealth && (!emailHealth.ok || emailHealth.liveMode === false) && (
        <div className={`rounded-xl border px-4 py-3 ${
          !emailHealth.ok
            ? "border-accent-red/40 bg-accent-red/5"
            : "border-accent-amber/30 bg-accent-amber/5"
        }`}>
          <div className="flex items-start gap-3 text-[12px]">
            <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${
              !emailHealth.ok ? "bg-accent-red/15" : "bg-accent-amber/15"
            }`}>
              <AlertCircle className={`h-3.5 w-3.5 ${
                !emailHealth.ok ? "text-accent-red" : "text-accent-amber"
              }`} />
            </div>
            <div className="flex-1 text-ink-secondary">
              <span className={`font-semibold ${
                !emailHealth.ok ? "text-accent-red" : "text-accent-amber"
              }`}>
                {!emailHealth.ok
                  ? "Email delivery is NOT configured"
                  : `Email is in test mode (provider: ${emailHealth.provider ?? "unknown"}, EMAIL_LIVE=false)`}
              </span>
              {" "}— invites will land in your invitee&apos;s inbox <strong>only after</strong> this is fixed.
              {emailHealth.fixHint && <> {emailHealth.fixHint}</>}
              {" "}Meanwhile, click <strong>Copy link</strong> on each pending invite below to send the accept URL manually (Slack / Signal / text).
              {" "}
              <Link href="/admin/system-health" className="font-semibold text-brand-300 underline hover:text-brand-200">
                Open System Health →
              </Link>
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load users:</strong> {loadError}
          <span className="ml-2 text-ink-tertiary">— click Refresh, or sign in at <a className="underline" href="/signin">/signin</a></span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tilesData.map((t) => (
          <div key={t.k} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{t.k}</div>
            <div className="mt-1 text-2xl font-bold">{t.v}</div>
            {t.hint && <div className="text-[10px] text-ink-tertiary">{t.hint}</div>}
          </div>
        ))}
      </div>

      {openInvite && (
        <div className="rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-500/5 to-transparent p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Invite a teammate</div>
            <button
              onClick={() => setOpenInvite(false)}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              aria-label="Close invite form"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-tertiary">
            Sends a notification email and saves a pending invite. They can&apos;t sign in until the
            acceptance flow ships, but the role you assign here will be honored once it does.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_auto]">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitInvite();
                }}
                type="email"
                placeholder="email@yourcompany.com"
                className="h-10 w-full rounded-lg border border-bg-border bg-bg-card pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InviteRole)}
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
            >
              {(["Admin", "Operator", "Viewer", "Billing"] as InviteRole[]).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={submitInvite}
              disabled={submitting || !inviteEmail}
              className="flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
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
                placeholder="Search by email…"
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
            <button
              onClick={load}
              disabled={loading}
              className="flex h-9 items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 text-xs hover:bg-bg-hover disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
            {data === null && !loadError ? (
              <div className="px-5 py-12 text-center text-xs text-ink-tertiary">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-12 text-center text-xs text-ink-tertiary">
                No matches — adjust filters or invite a teammate.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                    <tr className="border-b border-bg-border">
                      <th className="px-5 py-2.5 text-left font-medium">Member</th>
                      <th className="px-3 py-2.5 text-left font-medium">Role</th>
                      <th className="px-3 py-2.5 text-left font-medium">2FA</th>
                      <th className="px-3 py-2.5 text-left font-medium">Last active / Sent</th>
                      <th className="px-5 py-2.5 text-left font-medium">Status</th>
                      <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      if (row.kind === "owner") {
                        const m = row.owner;
                        return (
                          <tr key="owner" className="border-t border-bg-border hover:bg-bg-hover/30">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-brand text-xs font-bold">
                                  {m.initials}
                                </div>
                                <div>
                                  <div className="font-medium">{m.name}</div>
                                  <div className="text-[11px] text-ink-tertiary">{m.email}</div>
                                  <div className="text-[10px] text-ink-tertiary">{m.title} · {m.company}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${ROLE_TONE.Owner}`}>
                                Owner
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              {m.twoFactor === null ? (
                                <span title="Per-user 2FA tracking ships with multi-user auth" className="text-ink-tertiary">
                                  <ShieldOff className="h-4 w-4" />
                                </span>
                              ) : m.twoFactor ? (
                                <ShieldCheck className="h-4 w-4 text-accent-green" />
                              ) : (
                                <Shield className="h-4 w-4 text-ink-tertiary" />
                              )}
                            </td>
                            <td className="px-3 py-3 text-ink-secondary">
                              {relativeTime(m.lastActive)}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE.Active}`}>
                                Active
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right text-[11px] text-ink-tertiary">
                              <span title="Owner is set via OPERATOR_* env vars">env-managed</span>
                            </td>
                          </tr>
                        );
                      }
                      const inv = row.invite;
                      const initials = inv.email.slice(0, 2).toUpperCase();
                      return (
                        <tr key={inv.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="grid h-9 w-9 place-items-center rounded-full bg-bg-hover text-xs font-bold text-ink-secondary">
                                {initials}
                              </div>
                              <div>
                                <div className="font-medium text-ink-secondary">{inv.email}</div>
                                <div className="text-[10px] text-ink-tertiary">
                                  Invited by {inv.invitedBy}
                                  {inv.status === "pending" && (
                                    <> · expires {formatDate(inv.expiresAt)}</>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${ROLE_TONE[inv.role]}`}>
                              {inv.role}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-ink-tertiary"><ShieldOff className="h-4 w-4" /></span>
                          </td>
                          <td className="px-3 py-3 text-ink-secondary">
                            Sent {relativeTime(inv.createdAt)}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[inv.status]}`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            {inv.status === "pending" ? (
                              <div className="flex items-center justify-end gap-2 text-[11px]">
                                <button
                                  onClick={() => resendInvite(inv)}
                                  disabled={resendingId === inv.id}
                                  className="rounded-md border border-brand-500/40 bg-brand-500/10 px-2 py-1 font-semibold text-brand-200 hover:bg-brand-500/20 disabled:opacity-60"
                                  title="Resend the invite email (same accept link)"
                                >
                                  {resendingId === inv.id ? "Resending…" : "Resend"}
                                </button>
                                <button
                                  onClick={() => copyAcceptLink(inv)}
                                  className="rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                                  title="Copy the accept link to clipboard (paste it to the invitee via Slack / etc when email isn't working)"
                                >
                                  Copy link
                                </button>
                                <button
                                  onClick={() => cancelInvite(inv)}
                                  disabled={cancellingId === inv.id}
                                  className="text-ink-tertiary hover:text-accent-red disabled:opacity-60"
                                >
                                  {cancellingId === inv.id ? "Cancelling…" : "Cancel"}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-ink-tertiary">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-bg-border bg-bg-card">
            <div className="border-b border-bg-border px-5 py-3.5 text-sm font-semibold">
              Role permissions
            </div>
            <div className="space-y-3 p-4">
              {(Object.keys(ROLE_PERMISSIONS) as Role[]).map((r) => {
                const memberCount = r === "Owner"
                  ? 1
                  : data?.invites.filter((i) => i.role === r && i.status === "pending").length ?? 0;
                return (
                  <div key={r} className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
                    <div className="flex items-center justify-between">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${ROLE_TONE[r]}`}>
                        {r}
                      </span>
                      <span className="text-[10px] text-ink-tertiary">
                        {memberCount} {r === "Owner" ? "member" : `pending invite${memberCount === 1 ? "" : "s"}`}
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
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-sm font-semibold">Security</div>
            <p className="mt-1 text-[11px] text-ink-tertiary">
              Honest snapshot — nothing here is faked. Each row reflects what&apos;s
              actually wired today.
            </p>
            <div className="mt-3 space-y-2 text-xs">
              <Row
                k="Per-user authentication"
                v={data?.capabilities.perUserAuth ? "On" : "Single-operator"}
                tone={data?.capabilities.perUserAuth ? "text-accent-green" : "text-ink-tertiary"}
              />
              <Row
                k="2FA tracking"
                v={data?.capabilities.twoFactorTracked ? "On" : "Not yet"}
                tone={data?.capabilities.twoFactorTracked ? "text-accent-green" : "text-ink-tertiary"}
              />
              <Row
                k="SSO (SAML / OIDC)"
                v={data?.capabilities.ssoConfigured ? "Connected" : "Not configured"}
                tone={data?.capabilities.ssoConfigured ? "text-accent-green" : "text-ink-tertiary"}
              />
              <Row
                k="SCIM provisioning"
                v={data?.capabilities.scimConfigured ? "Connected" : "Not configured"}
                tone={data?.capabilities.scimConfigured ? "text-accent-green" : "text-ink-tertiary"}
              />
              <Row
                k="Invite acceptance flow"
                v={data?.capabilities.acceptanceFlow ? "Live" : "Coming next"}
                tone={data?.capabilities.acceptanceFlow ? "text-accent-green" : "text-ink-tertiary"}
              />
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
