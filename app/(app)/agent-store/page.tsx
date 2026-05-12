"use client";
import {
  ArrowUpRight,
  Award,
  Check,
  CheckCircle2,
  Download,
  Plug,
  Search,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { useToast } from "@/components/Toast";
import { useLocalSet } from "@/lib/useLocalSet";
import {
  CATEGORIES,
  STORE_AGENTS,
  type StoreAgent,
} from "@/lib/agentStore";

function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function AgentDetail({
  a,
  installed,
  onToggleInstall,
  onConfigure,
}: {
  a: StoreAgent;
  installed: boolean;
  onToggleInstall: (a: StoreAgent) => void;
  onConfigure: (a: StoreAgent) => void;
}) {
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-xl bg-gradient-card text-3xl">
          {a.emoji}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-xl font-bold">{a.name}</div>
            {installed && (
              <span className="rounded-md bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                Installed
              </span>
            )}
          </div>
          <div className="text-xs text-ink-tertiary">{a.tagline}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1 text-ink-secondary">
              <Star className="h-3 w-3 fill-accent-amber text-accent-amber" />
              {a.rating} · {a.reviewCount} reviews
            </span>
            <span className="text-ink-tertiary">·</span>
            <span className="flex items-center gap-1 text-ink-secondary">
              <Download className="h-3 w-3" />
              {fmtNum(a.installs)} installs
            </span>
            <span className="text-ink-tertiary">·</span>
            <span className="flex items-center gap-1 text-ink-secondary">
              {a.publisher}
              {a.publisherVerified && (
                <CheckCircle2 className="h-3 w-3 text-accent-green" />
              )}
            </span>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm text-ink-secondary">{a.description}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Monthly
          </div>
          <div className="mt-1 text-base font-semibold">
            {a.monthly === 0 ? "Free" : `$${a.monthly}`}
          </div>
          {a.setupFee ? (
            <div className="text-[11px] text-ink-tertiary">+ ${a.setupFee} setup</div>
          ) : null}
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Platform Fee
          </div>
          <div className="mt-1 text-base font-semibold">
            {a.revShare ? `${(a.revShare * 100).toFixed(0)}%` : "—"}
          </div>
          <div className="text-[11px] text-ink-tertiary">of agent revenue</div>
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Category
          </div>
          <div className="mt-1 text-sm font-semibold">{a.category}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Capabilities</div>
        <ul className="space-y-1.5">
          {a.capabilities.map((c) => (
            <li
              key={c}
              className="flex items-start gap-2 rounded-lg border border-bg-border bg-bg-hover/30 px-3 py-2 text-xs text-ink-secondary"
            >
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent-green" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Integrations</div>
        <div className="flex flex-wrap gap-1.5">
          {a.integrations.map((i) => (
            <span
              key={i}
              className="rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[11px] text-ink-secondary"
            >
              {i}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
          <Sparkles className="h-4 w-4" /> What you get when installed
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-ink-secondary">
          <li>• Drops into your AI Agents control room with its own logs + permissions</li>
          <li>• Counts against your plan token cap — pause anytime</li>
          <li>• Approval mode + auto mode (you choose)</li>
          {a.revShare && <li>• Revenue passes through your billing — you keep {(100 - a.revShare * 100).toFixed(0)}%</li>}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2 pb-2">
        {installed ? (
          <>
            <button
              onClick={() => onConfigure(a)}
              className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
            >
              Configure
            </button>
            <button
              onClick={() => onToggleInstall(a)}
              className="flex items-center justify-center gap-2 rounded-lg border border-accent-red/30 bg-accent-red/5 py-2.5 text-sm text-accent-red hover:bg-accent-red/10"
            >
              Uninstall
            </button>
          </>
        ) : (
          <button
            onClick={() => onToggleInstall(a)}
            className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow"
          >
            <Plug className="h-4 w-4" />
            {a.monthly === 0 ? "Install for Free" : `Install · $${a.monthly}/mo`}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AgentStorePage() {
  const [open, setOpen] = useState<StoreAgent | null>(null);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [query, setQuery] = useState("");
  const [showInstalled, setShowInstalled] = useState(false);
  const installs = useLocalSet("aicos:installed-agents:v1");
  const { toast } = useToast();

  // Seed initial installed set from static data on first ever visit
  useEffect(() => {
    if (!installs.hydrated) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem("aicos:installed-agents:v1:seeded")) return;
    const seed = STORE_AGENTS.filter((a) => a.installed).map((a) => a.id);
    seed.forEach((id) => installs.add(id));
    try {
      localStorage.setItem("aicos:installed-agents:v1:seeded", "1");
    } catch {}
  }, [installs.hydrated, installs]);

  const isInstalled = (a: StoreAgent) =>
    installs.hydrated ? installs.has(a.id) : a.installed;

  function handleToggleInstall(a: StoreAgent) {
    const wasInstalled = isInstalled(a);
    installs.toggle(a.id);
    toast(
      wasInstalled
        ? `Uninstalled "${a.name}"`
        : a.monthly === 0
        ? `Installed "${a.name}" (free)`
        : `Installed "${a.name}" — $${a.monthly}/mo billed`
    );
  }

  function handleConfigure(a: StoreAgent) {
    toast(`Opening configuration for "${a.name}"`, "info");
  }

  const list = useMemo(() => {
    return STORE_AGENTS.filter((a) => {
      if (cat !== "All" && a.category !== cat) return false;
      if (query && !a.name.toLowerCase().includes(query.toLowerCase()) &&
        !a.tagline.toLowerCase().includes(query.toLowerCase())) return false;
      if (showInstalled && !isInstalled(a)) return false;
      return true;
    });
  }, [cat, query, showInstalled, installs.items, installs.hydrated]);

  const featured = STORE_AGENTS.filter((a) => a.featured);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Agent Store</h1>
            <p className="text-xs text-ink-secondary">
              {STORE_AGENTS.length} agents from {new Set(STORE_AGENTS.map((a) => a.publisher)).size} publishers ·{" "}
              {STORE_AGENTS.filter((a) => isInstalled(a)).length} installed
            </p>
          </div>
        </div>
        <a
          href="mailto:hello@avyncommerce.com?subject=Agent%20Store%20publisher%20application"
          className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
        >
          <ArrowUpRight className="h-4 w-4" /> Publish your own agent
        </a>
      </div>

      {/* Preview banner — agent installation flow not yet live */}
      <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
            <Award className="h-3.5 w-3.5 text-accent-amber" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-accent-amber">Catalog preview</span>
            <span className="text-ink-secondary">
              {" "}
              — Browse-and-install for third-party agents is in active build. Install actions below
              persist locally so you can shape your shortlist; the runtime install pipeline lands
              with the next release. The 9 first-party agents that ship with AVYN are live now —
              see them on{" "}
              <a href="/agents" className="text-brand-300 hover:text-brand-200 underline">/agents</a>.
            </span>
          </div>
        </div>
      </div>

      {!showInstalled && cat === "All" && !query && (
        <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-200">
            <Award className="h-4 w-4" /> Featured this week
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {featured.map((a) => (
              <button
                key={a.id}
                onClick={() => setOpen(a)}
                className="rounded-xl border border-brand-500/40 bg-bg-card p-4 text-left transition hover:shadow-glow"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-card text-2xl">
                    {a.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{a.name}</div>
                    <div className="truncate text-[11px] text-ink-tertiary">
                      {a.tagline}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-accent-amber text-accent-amber" />
                    {a.rating}
                  </span>
                  <span className="font-semibold text-brand-200">
                    {a.monthly === 0 ? "Free" : `$${a.monthly}/mo`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-md px-3 py-1.5 ${
                cat === c
                  ? "bg-brand-500/15 text-brand-200"
                  : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={showInstalled}
            onChange={(e) => setShowInstalled(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-500"
          />
          Installed only
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => (
          <button
            key={a.id}
            onClick={() => setOpen(a)}
            className="group relative rounded-xl border border-bg-border bg-bg-card p-4 text-left transition hover:border-brand-500/50 hover:shadow-glow"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-card text-2xl">
                {a.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{a.name}</span>
                  {isInstalled(a) && (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent-green" />
                  )}
                </div>
                <div className="text-[11px] text-ink-tertiary">
                  {a.publisher}
                  {a.publisherVerified && " · ✓"}
                </div>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-xs text-ink-secondary">
              {a.tagline}
            </p>

            <div className="mt-3 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 text-ink-secondary">
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-accent-amber text-accent-amber" />
                  {a.rating}
                </span>
                <span className="text-ink-tertiary">·</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {fmtNum(a.installs)}
                </span>
              </div>
              <span className="rounded-md bg-bg-hover/60 px-2 py-0.5 text-[10px] text-ink-secondary">
                {a.category}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-bg-border pt-3 text-xs">
              <span className="font-semibold">
                {a.monthly === 0 ? "Free" : `$${a.monthly}/mo`}
              </span>
              {isInstalled(a) ? (
                <span className="text-accent-green">Installed</span>
              ) : (
                <span className="rounded-md bg-gradient-brand px-2 py-1 text-[11px] font-semibold">
                  Install
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
            <ArrowUpRight className="h-5 w-5 text-brand-200" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">
              Earn revenue by publishing your own agent
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              Build a vertical AI agent (e.g. a cannabis dispensary buyer finder, a generic-pharma sourcing bot, a Faire boutique negotiator), publish it here, and the platform handles billing, sandbox, monitoring, and rev-share. Publishers keep <span className="text-brand-300">70%</span> of every dollar.
            </p>
            <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200">
              Apply to become a publisher <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title="Agent Details"
        width="max-w-2xl"
      >
        {open && (
          <AgentDetail
            a={open}
            installed={isInstalled(open)}
            onToggleInstall={handleToggleInstall}
            onConfigure={handleConfigure}
          />
        )}
      </Drawer>
    </div>
  );
}
