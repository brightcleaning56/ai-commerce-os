"use client";
import { Bell, Bot, ChevronDown, Mail, Menu, Package, Search, Send, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCommandPalette } from "./CommandPalette";
import ThemeToggle from "./ThemeToggle";

type OperatorProfile = { name: string; title: string; initials: string };

type AgentRunPreview = {
  id: string;
  agent: "trend-hunter" | "buyer-discovery" | "outreach";
  startedAt: string;
  status: "success" | "error";
  productCount: number;
  buyerCount?: number;
  inputProductName?: string;
};

type DraftPreview = {
  id: string;
  buyerCompany: string;
  buyerName: string;
  productName: string;
  status: "draft" | "approved" | "sent" | "rejected";
  email: { subject: string };
  createdAt: string;
};

const AGENT_LABEL: Record<string, string> = {
  "trend-hunter": "Trend Hunter",
  "buyer-discovery": "Buyer Discovery",
  "supplier-finder": "Supplier Finder",
  outreach: "Outreach",
  negotiation: "Negotiation",
  risk: "Risk Agent",
};

const AGENT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "trend-hunter": Package,
  "buyer-discovery": Users,
  "supplier-finder": Package,
  outreach: Send,
  negotiation: Send,
  risk: Bot,
};

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const palette = useCommandPalette();
  const [isMac, setIsMac] = useState(true);
  const [bellOpen, setBellOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [runs, setRuns] = useState<AgentRunPreview[]>([]);
  const [drafts, setDrafts] = useState<DraftPreview[]>([]);
  const [operator, setOperator] = useState<OperatorProfile>({ name: "", title: "", initials: "" });
  const bellRef = useRef<HTMLDivElement>(null);
  const mailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
    }
  }, []);

  // Identity is API-authoritative. Server-side `getOperator()` (lib/operator.ts)
  // is the single source of truth — driven by OPERATOR_* env vars or built-in
  // defaults. localStorage is treated as a *write target* only: after the API
  // resolves we sync localStorage to match, so the Settings page never shows
  // a stale name like "John Smith" left over from the original demo seed.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/operator", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((op) => {
        if (cancelled || !op?.name) return;
        const next = {
          name: op.name as string,
          title: (op.title as string) || "Owner",
          initials:
            (op.initials as string) ||
            (op.name as string).split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("") ||
            "?",
        };
        setOperator(next);

        // Sync localStorage so Settings page shows the same identity. Only
        // write keys we own; preserve other settings the user may have set.
        try {
          const raw = localStorage.getItem("aicos:settings:v1");
          const prev = raw ? JSON.parse(raw) : {};
          const merged = { ...prev, name: op.name, email: op.email ?? prev.email };
          localStorage.setItem("aicos:settings:v1", JSON.stringify(merged));
        } catch {}
      })
      .catch(() => {
        // Last-resort fallback to localStorage if the API genuinely fails (offline, etc.)
        try {
          const raw = localStorage.getItem("aicos:settings:v1");
          if (raw) {
            const s = JSON.parse(raw);
            if (s.name && typeof s.name === "string" && s.name !== "John Smith") {
              setOperator({
                name: s.name,
                title: "Owner",
                initials:
                  s.name.split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("") || "?",
              });
            }
          }
        } catch {}
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch latest runs + drafts when a panel opens
  useEffect(() => {
    if (!bellOpen) return;
    fetch("/api/agent-runs")
      .then((r) => r.json())
      .then((d) => setRuns((d.runs ?? []).slice(0, 8)))
      .catch(() => {});
  }, [bellOpen]);

  useEffect(() => {
    if (!mailOpen) return;
    fetch("/api/drafts")
      .then((r) => r.json())
      .then((d) => setDrafts((d.drafts ?? []).slice(0, 8)))
      .catch(() => {});
  }, [mailOpen]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
      if (mailRef.current && !mailRef.current.contains(e.target as Node)) {
        setMailOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-bg-border bg-bg-panel/80 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onMenuClick}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-bg-border bg-bg-card hover:bg-bg-hover lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4 text-ink-secondary" />
      </button>

      <button
        onClick={() => palette?.open()}
        className="group relative flex flex-1 items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 text-left h-10 max-w-2xl hover:bg-bg-hover"
      >
        <Search className="h-4 w-4 shrink-0 text-ink-tertiary" />
        <span className="flex-1 truncate text-sm text-ink-tertiary">
          <span className="hidden sm:inline">Search anything... (Products, Buyers, Suppliers, Actions…)</span>
          <span className="sm:hidden">Search…</span>
        </span>
        <kbd className="ml-auto rounded border border-bg-border bg-bg-hover px-1.5 py-0.5 text-[10px] text-ink-tertiary">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <Link
        href="/pipeline"
        className="hidden items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-1.5 hover:bg-bg-hover lg:flex"
      >
        <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
          Automation Mode
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_8px_#22c55e]" />
          <span className="text-xs font-semibold text-accent-green">FULLY AUTONOMOUS</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-tertiary" />
        </div>
      </Link>

      <div ref={bellRef} className="relative">
        <button
          onClick={() => {
            setBellOpen((v) => !v);
            setMailOpen(false);
          }}
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-bg-border bg-bg-card hover:bg-bg-hover"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4 text-ink-secondary" />
          {runs.length > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-brand-500 px-1 text-[9px] font-bold">
              {Math.min(99, runs.length)}
            </span>
          )}
        </button>
        {bellOpen && (
          <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-bg-border bg-bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-bg-border px-4 py-3 text-sm font-semibold">
              <span>Agent activity</span>
              <button
                onClick={() => setBellOpen(false)}
                className="grid h-6 w-6 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
                aria-label="Close"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {runs.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-ink-tertiary">
                  No agent runs yet. Visit{" "}
                  <Link href="/pipeline" className="text-brand-300 hover:text-brand-200" onClick={() => setBellOpen(false)}>
                    Pipeline
                  </Link>{" "}
                  to start one.
                </div>
              ) : (
                <ul className="divide-y divide-bg-border">
                  {runs.map((r) => {
                    const Icon = AGENT_ICON[r.agent] ?? Bot;
                    return (
                      <li key={r.id}>
                        <Link
                          href="/agent-runs"
                          onClick={() => setBellOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-bg-hover/50"
                        >
                          <div
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${
                              r.status === "success" ? "bg-accent-green/15" : "bg-accent-red/15"
                            }`}
                          >
                            <Icon
                              className={`h-3.5 w-3.5 ${
                                r.status === "success" ? "text-accent-green" : "text-accent-red"
                              }`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium">{AGENT_LABEL[r.agent]}</div>
                            <div className="truncate text-[11px] text-ink-tertiary">
                              {r.agent === "outreach" || r.agent === "buyer-discovery"
                                ? `for ${r.inputProductName ?? "—"}`
                                : `${r.productCount} products`}
                            </div>
                          </div>
                          <div className="text-[10px] text-ink-tertiary">{relativeTime(r.startedAt)}</div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-bg-border px-4 py-2 text-center">
              <Link
                href="/agent-runs"
                onClick={() => setBellOpen(false)}
                className="text-xs text-brand-300 hover:text-brand-200"
              >
                View all activity →
              </Link>
            </div>
          </div>
        )}
      </div>

      <div ref={mailRef} className="relative hidden sm:block">
        <button
          onClick={() => {
            setMailOpen((v) => !v);
            setBellOpen(false);
          }}
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-bg-border bg-bg-card hover:bg-bg-hover"
          aria-label="Drafts"
        >
          <Mail className="h-4 w-4 text-ink-secondary" />
          {drafts.filter((d) => d.status === "draft").length > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-accent-red px-1 text-[9px] font-bold">
              {drafts.filter((d) => d.status === "draft").length}
            </span>
          )}
        </button>
        {mailOpen && (
          <div className="absolute right-0 top-12 w-96 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-bg-border bg-bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-bg-border px-4 py-3 text-sm font-semibold">
              <span>Outreach drafts</span>
              <button
                onClick={() => setMailOpen(false)}
                className="grid h-6 w-6 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
                aria-label="Close"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {drafts.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-ink-tertiary">
                  No drafts yet. Generate outreach from any{" "}
                  <Link href="/buyers" className="text-brand-300 hover:text-brand-200" onClick={() => setMailOpen(false)}>
                    buyer
                  </Link>
                  .
                </div>
              ) : (
                <ul className="divide-y divide-bg-border">
                  {drafts.map((d) => (
                    <li key={d.id}>
                      <Link
                        href="/outreach"
                        onClick={() => setMailOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-bg-hover/50"
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gradient-brand text-[10px] font-bold">
                          {d.buyerCompany.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">{d.email.subject}</div>
                          <div className="truncate text-[11px] text-ink-tertiary">
                            → {d.buyerName} @ {d.buyerCompany}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                              d.status === "draft"
                                ? "bg-accent-amber/15 text-accent-amber"
                                : d.status === "approved"
                                ? "bg-accent-green/15 text-accent-green"
                                : d.status === "sent"
                                ? "bg-accent-blue/15 text-accent-blue"
                                : "bg-bg-hover text-ink-tertiary"
                            }`}
                          >
                            {d.status}
                          </span>
                          <span className="text-[10px] text-ink-tertiary">{relativeTime(d.createdAt)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-bg-border px-4 py-2 text-center">
              <Link
                href="/outreach"
                onClick={() => setMailOpen(false)}
                className="text-xs text-brand-300 hover:text-brand-200"
              >
                Review drafts queue →
              </Link>
            </div>
          </div>
        )}
      </div>

      <ThemeToggle />

      <Link
        href="/settings"
        className="flex shrink-0 items-center gap-2 rounded-lg border border-bg-border bg-bg-card pl-1 pr-2 py-1 hover:bg-bg-hover sm:pr-3"
      >
        <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-brand text-xs font-bold text-white">
          {operator.initials || "?"}
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-xs font-medium leading-tight">{operator.name || "Loading…"}</div>
          <div className="text-[10px] text-brand-300">{operator.title || "Owner"}</div>
        </div>
        <ChevronDown className="hidden h-3.5 w-3.5 text-ink-tertiary sm:block" />
      </Link>
    </header>
  );
}
