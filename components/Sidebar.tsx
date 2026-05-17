"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { NAV_SECTIONS, ADMIN_NAV } from "@/lib/nav";
import { X } from "lucide-react";
import { AvynMark } from "@/components/AvynLogo";
import { useCapabilities } from "@/components/CapabilityContext";

function NavLink({
  href,
  label,
  Icon,
  badge,
  active,
  onClick,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={clsx(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-brand-500/15 text-brand-200"
          : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand-400" />
      )}
      <Icon
        className={clsx(
          "h-4 w-4 shrink-0",
          active ? "text-brand-300" : "text-ink-tertiary group-hover:text-ink-secondary"
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span
          className={clsx(
            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
            /^[1-9]\d*$/.test(badge)
              ? "bg-accent-red/20 text-accent-red"
              : badge === "0"
              ? "bg-bg-hover text-ink-tertiary"
              : badge === "NEW"
              ? "bg-accent-green/20 text-accent-green"
              : "bg-brand-500/20 text-brand-200"
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Capability-aware filtering. Owner sees everything; non-Owner roles
  // only see nav items whose `requires` is in their effective capability
  // set (resolved server-side from /admin/users matrix).
  const { can, me } = useCapabilities();

  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  // Live unread-inbound count from /api/queue/summary -- powers the
  // red badge next to "Queue" in the Outreach section. Surfaces missed
  // calls / inbound SMS / new leads without operator hopping between
  // /tasks and /calls and /leads to find them.
  const [queueUnread, setQueueUnread] = useState<number | null>(null);
  // Slice 108: count of leads in "new" status -- powers the badge next
  // to /leads so untouched leads surface in the sidebar without
  // requiring the operator to open the page.
  const [newLeads, setNewLeads] = useState<number | null>(null);
  // Slice 120: count of CUSTOM cadence templates -- powers the
  // /cadences badge so operators see at a glance how many of their
  // own templates they've built. Seeds are excluded since they're
  // shipped on every install and the count is constant.
  const [customCadenceTpls, setCustomCadenceTpls] = useState<number | null>(null);
  // Slice 127: count of drafts still in "draft" status (not yet
  // approved / sent / rejected). Same source the /approvals badge
  // already aggregates, surfaced separately so /outreach can show
  // it too without double-counting.
  const [pendingDrafts, setPendingDrafts] = useState<number | null>(null);
  const [owner, setOwner] = useState<{ name: string; email: string; company: string; title: string; initials: string } | null>(null);

  useEffect(() => {
    fetch("/api/operator").then((r) => r.json()).then((d) => {
      if (d?.name) setOwner(d);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Slice 108: leads count joins the existing parallel batch.
        // Endpoint is best-effort -- silently no-ops the badge on
        // failure (e.g. role without leads:read capability).
        const [d, f, q, l, tpls] = await Promise.all([
          fetch("/api/drafts").then((r) => r.json()),
          fetch("/api/risk-flags").then((r) => r.json()),
          // Queue summary is best-effort -- swallow failures so the
          // sidebar still renders if the queue endpoint is degraded.
          fetch("/api/queue/summary", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/api/leads", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          // Slice 120: cadence templates list -- best-effort, returns
          // both seeds + customs. We count customs only.
          fetch("/api/cadences/templates", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        if (cancelled) return;
        const drafts = (d.drafts ?? []).filter((x: any) => x.status === "draft").length;
        setPendingDrafts(drafts);
        let actions: Record<string, string> = {};
        try {
          const raw = localStorage.getItem("aicos:risk-actions:v1");
          if (raw) actions = JSON.parse(raw);
        } catch {}
        const flags = (f.flags ?? []).filter(
          (x: any) => (x.severity === "Critical" || x.severity === "High") && !actions[x.id]
        ).length;
        setPendingApprovals(drafts + flags);
        if (q?.summary) {
          setQueueUnread(typeof q.summary.unreadInbound === "number" ? q.summary.unreadInbound : 0);
        }
        if (l?.leads) {
          setNewLeads((l.leads as Array<{ status?: string }>).filter((x) => x.status === "new").length);
        }
        if (tpls?.templates) {
          setCustomCadenceTpls(
            (tpls.templates as Array<{ source?: string }>).filter((x) => x.source === "custom").length,
          );
        }
      } catch {}
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pathname]);

  function badgeFor(href: string, defaultBadge?: string): string | undefined {
    if (href === "/approvals") {
      if (pendingApprovals == null) return defaultBadge;
      if (pendingApprovals === 0) return "0";
      return String(pendingApprovals);
    }
    if (href === "/queue") {
      // Numeric unread inbound wins over the generic "NEW" badge once
      // the count is known. 0 falls back to "NEW" so a quiet queue
      // still hints that the surface exists.
      if (queueUnread == null) return defaultBadge;
      if (queueUnread === 0) return defaultBadge;
      return String(queueUnread);
    }
    if (href === "/leads") {
      // Slice 108: badge shows the count of leads still in "new" status
      // (untouched). 0 falls back to the configured default (or none)
      // so the row stays clean when the inbox is at zero.
      if (newLeads == null || newLeads === 0) return defaultBadge;
      return String(newLeads);
    }
    if (href === "/cadences") {
      // Slice 120: count of CUSTOM cadence templates (seeds excluded).
      // Tells the operator "you've built N of your own templates"
      // without opening the page. 0 falls back to default so a fresh
      // workspace doesn't show "0" as clutter.
      if (customCadenceTpls == null || customCadenceTpls === 0) return defaultBadge;
      return String(customCadenceTpls);
    }
    if (href === "/outreach") {
      // Slice 127: count of pending drafts (status:"draft" -- not yet
      // approved/sent/rejected). Tells the operator how many drafts
      // are sitting in the queue waiting for their attention.
      if (pendingDrafts == null || pendingDrafts === 0) return defaultBadge;
      return String(pendingDrafts);
    }
    return defaultBadge;
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-bg-border bg-bg-panel transition-transform lg:sticky lg:top-0 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between gap-2.5 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0a0014] shadow-glow" style={{ boxShadow: "0 0 12px rgba(147,51,234,0.4)" }}>
              <AvynMark size={28} />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">AVYN Commerce</div>
              <div className="text-[11px] text-ink-tertiary">AI · Automation · Growth</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_SECTIONS.map((section) => {
            // Drop items the user can't access. Empty sections collapse
            // entirely so we don't render a stranded section header.
            const visible = section.items.filter((item) => can(item.requires));
            if (visible.length === 0) return null;
            return (
              <div key={section.title} className="mb-1">
                <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                  {section.title}
                </div>
                <div className="space-y-0.5">
                  {visible.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      Icon={item.icon}
                      badge={badgeFor(item.href, item.badge)}
                      active={isActive(item.href)}
                      onClick={onClose}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {(() => {
            const visibleAdmin = ADMIN_NAV.filter((item) => can(item.requires));
            if (visibleAdmin.length === 0) return null;
            return (
              <div className="mb-1">
                <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                  Admin
                </div>
                <div className="space-y-0.5">
                  {visibleAdmin.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      Icon={item.icon}
                      active={isActive(item.href)}
                      onClick={onClose}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </nav>

        <div className="border-t border-bg-border p-3 space-y-2">
          {/* Identity card. For the workspace Owner we have richer info
              from /api/operator (name, title, company, initials). For
              per-user-token sessions we only know email + role from the
              token payload — display those and skip the Owner-only bits. */}
          {me?.isOwner && owner ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-bg-border bg-bg-card p-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-brand text-[11px] font-bold text-white shadow-glow">
                {owner.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-ink-primary">{owner.name}</div>
                <div className="truncate text-[10px] text-ink-tertiary" title={owner.email}>
                  {owner.title} · {owner.company}
                </div>
              </div>
              <span
                className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-200"
                title={`Owner — ${owner.email}`}
              >
                Owner
              </span>
            </div>
          ) : me ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-bg-border bg-bg-card p-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-hover text-[11px] font-bold text-ink-primary">
                {me.initials || (me.email[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-ink-primary">
                  {me.name || me.email}
                </div>
                <div className="truncate text-[10px] text-ink-tertiary" title={me.email}>
                  {me.name ? me.email : `Signed in as ${me.role}`}
                </div>
              </div>
              <span
                className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-200"
                title={`${me.role} session`}
              >
                {me.role}
              </span>
            </div>
          ) : null}
          <div className="rounded-xl border border-bg-border bg-bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">System Status</span>
              <span className="flex items-center gap-1.5 text-[11px] text-accent-green">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_8px_#22c55e]" />
                Online
              </span>
            </div>
            <div className="mt-1 text-[11px] text-ink-tertiary">All systems operational</div>
          </div>
        </div>
      </aside>
    </>
  );
}
