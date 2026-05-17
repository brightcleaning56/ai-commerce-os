"use client";
import { AlertTriangle, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCapabilities } from "./CapabilityContext";

/**
 * Slice 95: setup-health indicator in TopBar.
 *
 * Polls /api/admin/system-health every 60s and renders a small badge:
 *   - red XCircle + count   → blocking failures (features won't run)
 *   - amber AlertTriangle + count → warnings (degraded but ok)
 *   - hidden                → all green (no point cluttering)
 *
 * Click navigates to /admin/system-health so the operator can drill
 * into the specific check. Gated on system:read capability so per-
 * user sessions without admin access don't see it (and don't waste
 * a fetch on something they can't fix).
 *
 * The /api/admin/system-health endpoint is cheap (env reads + small
 * file reads, no external API calls), so 60s polling won't move the
 * needle on cost. First fetch fires on mount so the badge appears
 * within a second of page load.
 */

type CheckSeverity = "blocking" | "warning" | "info";
type CheckResult = { ok: boolean; severity: CheckSeverity };
type HealthShape = {
  overall: "green" | "yellow" | "red";
  blockingFailures: number;
  warningFailures: number;
  checks: Record<string, CheckResult>;
};

const POLL_MS = 60_000;

export default function SetupHealthBadge() {
  const { me } = useCapabilities();
  const canSee = me?.capabilities?.includes("system:read") ?? me?.isOwner ?? false;
  const [data, setData] = useState<HealthShape | null>(null);

  useEffect(() => {
    if (!canSee) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/admin/system-health", {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) return;
        const d = (await r.json()) as HealthShape;
        if (!cancelled) setData(d);
      } catch {
        /* ignore -- badge stays hidden, no spam toasts */
      }
    }
    void load();
    const iv = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [canSee]);

  if (!canSee || !data) return null;
  // All green -- don't clutter the topbar with a checkmark. The
  // /admin/system-health link still exists in the nav for operators
  // who want to verify proactively.
  if (data.overall === "green") return null;

  const isRed = data.overall === "red";
  const count = isRed ? data.blockingFailures : data.warningFailures;
  const Icon = isRed ? XCircle : AlertTriangle;

  // Slice 98: collect the first few failing check names (matching the
  // severity we're badging) so the tooltip tells the operator WHICH
  // checks are red/amber, not just "1 blocking issue." The check key
  // (e.g. "email", "voice") matches what /admin/system-health renders,
  // so the operator can find it instantly when they click through.
  const targetSeverity: CheckSeverity = isRed ? "blocking" : "warning";
  const failing = Object.entries(data.checks)
    .filter(([, c]) => !c.ok && c.severity === targetSeverity)
    .map(([k]) => k);
  const lead = failing.slice(0, 3).join(", ");
  const tail = failing.length > 3 ? ` (+${failing.length - 3} more)` : "";
  const titleText = isRed
    ? `${count} blocking config issue${count === 1 ? "" : "s"}: ${lead}${tail}`
    : `${count} warning${count === 1 ? "" : "s"}: ${lead}${tail}`;

  return (
    <Link
      href="/admin/system-health"
      title={titleText}
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border bg-bg-card transition hover:bg-bg-hover ${
        isRed ? "border-accent-red/40" : "border-accent-amber/40"
      }`}
      aria-label="Setup health"
    >
      <Icon
        className={`h-4 w-4 ${isRed ? "text-accent-red" : "text-accent-amber"}`}
      />
      {count > 0 && (
        <span
          className={`absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-bold text-white ${
            isRed ? "bg-accent-red" : "bg-accent-amber"
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

// Re-export so TopBar.tsx can spot the icon if it wants to use the
// "clean" variant later -- intentionally hidden today.
export { ShieldCheck };
