"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { PRIMARY_NAV, ADMIN_NAV } from "@/lib/nav";
import { Sparkles, X } from "lucide-react";

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
            // Numeric badges that are >0 → red urgency style
            /^[1-9]\d*$/.test(badge)
              ? "bg-accent-red/20 text-accent-red"
              : badge === "0"
              ? "bg-bg-hover text-ink-tertiary"
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

  // Live pending-approvals count for the sidebar badge
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  // Workspace owner profile (from /api/operator)
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
        const [d, f] = await Promise.all([
          fetch("/api/drafts").then((r) => r.json()),
          fetch("/api/risk-flags").then((r) => r.json()),
        ]);
        if (cancelled) return;
        const drafts = (d.drafts ?? []).filter((x: any) => x.status === "draft").length;
        // Read snoozed/etc. local state too
        let actions: Record<string, string> = {};
        try {
          const raw = localStorage.getItem("aicos:risk-actions:v1");
          if (raw) actions = JSON.parse(raw);
        } catch {}
        const flags = (f.flags ?? []).filter(
          (x: any) => (x.severity === "Critical" || x.severity === "High") && !actions[x.id]
        ).length;
        setPendingApprovals(drafts + flags);
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
    return defaultBadge;
  }

  return (
    <>
      {/* Mobile overlay */}
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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand shadow-glow">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">AI Commerce OS</div>
              <div className="text-[11px] text-ink-tertiary">Autonomous Agent Network</div>
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

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {PRIMARY_NAV.map((item) => (
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

          <div className="pt-4">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Admin
            </div>
            {ADMIN_NAV.map((item) => (
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
        </nav>

        <div className="border-t border-bg-border p-3 space-y-2">
          {/* Workspace owner */}
          {owner && (
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
          )}
          <div className="rounded-xl border border-bg-border bg-bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">System Status</span>
              <span className="flex items-center gap-1.5 text-[11px] text-accent-green">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_8px_#22c55e]" />
                Online
              </span>
            </div>
            <div className="mt-1 text-[11px] text-ink-tertiary">All systems operational</div>
            <button className="mt-3 w-full rounded-md border border-bg-border bg-bg-hover py-1.5 text-[11px] text-ink-secondary hover:text-ink-primary">
              View Status
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
