"use client";
import {
  Calendar,
  DollarSign,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import {
  STAGES,
  STAGE_DOT,
  STAGE_TONE,
  type Deal,
  type DealStage,
} from "@/lib/deals";

type LiveDeal = Deal & { draftId?: string };

function formatMoney(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function DealCard({ d, onClick }: { d: LiveDeal; onClick: () => void }) {
  const isLive = !!d.draftId;
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-bg-border bg-bg-card p-3 text-left transition hover:border-brand-500/50 hover:shadow-glow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{d.company}</span>
            {isLive && (
              <span
                className="rounded bg-accent-green/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-accent-green"
                title="Live deal — backed by a real draft"
              >
                Live
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-ink-tertiary">{d.product}</div>
        </div>
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-brand text-[10px] font-bold">
          {d.ownerInitials}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-brand-200">{formatMoney(d.value)}</span>
        <span className="text-ink-tertiary">{d.units.toLocaleString()} units</span>
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-hover">
        <div
          className="h-full bg-gradient-brand"
          style={{ width: `${d.probability}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-ink-tertiary">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" /> {d.closeDate}
        </span>
        <span>{d.probability}%</span>
      </div>
    </button>
  );
}

function DealDetail({
  d,
  onAdvance,
  onBuildQuote,
}: {
  d: LiveDeal;
  onAdvance: (d: LiveDeal) => void;
  onBuildQuote: (d: LiveDeal) => void;
}) {
  const stages: DealStage[] = ["Prospecting", "Contacted", "Negotiation", "Quotation", "Closed Won", "Closed Lost"];
  const idx = stages.indexOf(d.stage);
  const canAdvance = idx >= 0 && idx < stages.length - 2;
  const nextStage = canAdvance ? stages[idx + 1] : null;
  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-ink-tertiary">
          Deal
        </div>
        <div className="text-xl font-bold">{d.company}</div>
        <div className="text-xs text-ink-tertiary">{d.product}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${STAGE_TONE[d.stage]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[d.stage]}`} />
            {d.stage}
          </span>
          <span className="rounded-md bg-brand-500/15 px-2 py-1 text-xs font-semibold text-brand-200">
            {formatMoney(d.value)}
          </span>
          <span className="rounded-md bg-bg-hover px-2 py-1 text-xs text-ink-secondary">
            {d.probability}% likely
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Units
          </div>
          <div className="mt-1 text-base font-semibold">
            {d.units.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Owner
          </div>
          <div className="mt-1 text-sm font-semibold">{d.owner}</div>
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Close Date
          </div>
          <div className="mt-1 text-sm font-semibold">{d.closeDate}</div>
        </div>
      </div>

      <div className="rounded-lg border border-bg-border bg-bg-card">
        <div className="border-b border-bg-border px-4 py-2.5 text-xs font-semibold">
          Activity
        </div>
        <ul className="divide-y divide-bg-border text-xs">
          <li className="px-4 py-2.5">
            <div className="text-ink-primary">Last touch: {d.lastTouch}</div>
            <div className="text-[11px] text-ink-tertiary">
              Source: {d.source}
            </div>
          </li>
          <li className="px-4 py-2.5">
            <div className="text-ink-primary">Quote v2 sent</div>
            <div className="text-[11px] text-ink-tertiary">2 days ago · {d.owner}</div>
          </li>
          <li className="px-4 py-2.5">
            <div className="text-ink-primary">Discovery call booked</div>
            <div className="text-[11px] text-ink-tertiary">1 week ago · Outreach Agent</div>
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
          <Sparkles className="h-4 w-4" /> Next Best Action
        </div>
        <p className="mt-1 text-xs text-ink-secondary">
          {d.stage === "Negotiation"
            ? `Send a revised quote with a 5% volume discount tied to a 12-month commit. Comparable deals at this stage close 14% faster with this lever.`
            : d.stage === "Quotation"
            ? `Follow up with a 1-pager case study from a similar buyer. Last-touch was ${d.lastTouch}.`
            : `Move to Contacted — schedule a discovery call within 48h to keep momentum.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 pb-2">
        <button
          onClick={() => onAdvance(d)}
          disabled={!canAdvance}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow disabled:opacity-50"
        >
          <TrendingUp className="h-4 w-4" />
          {canAdvance ? `Advance to ${nextStage}` : "Final stage"}
        </button>
        <button
          onClick={() => onBuildQuote(d)}
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <DollarSign className="h-4 w-4" /> Build Quote
        </button>
      </div>
    </div>
  );
}

export default function CrmPage() {
  const [open, setOpen] = useState<LiveDeal | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  // SAMPLE DEALS removed: no more "Sarah Chen / Marcus Brooks / Priya Patel"
  // mixed into the operator's real pipeline. Real deals come from
  // /api/crm/deals (which derives from sent OutreachDrafts that have
  // dealStage / dealValue / dealUnits set).
  const [liveDeals, setLiveDeals] = useState<LiveDeal[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  // Live deals merge: drafts (slice 35) shaped as Deal records
  async function loadLiveDeals() {
    try {
      const res = await fetch("/api/crm/deals");
      if (!res.ok) return;
      const json = await res.json();
      setLiveDeals(json.deals ?? []);
    } catch {}
  }
  useEffect(() => {
    loadLiveDeals();
    const t = setInterval(loadLiveDeals, 30_000);
    return () => clearInterval(t);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleAdvance(d: LiveDeal) {
    const stages: DealStage[] = ["Prospecting", "Contacted", "Negotiation", "Quotation", "Closed Won", "Closed Lost"];
    const idx = stages.indexOf(d.stage);
    if (idx < 0 || idx >= stages.length - 2) return;
    const next = stages[idx + 1];
    const newProb = next === "Closed Won" ? 100 : Math.min(95, d.probability + 15);

    // Every deal here is real (backed by a draft) — no client-only static
    // deals to fall through to. Persist via PATCH and update local state.
    if (!d.draftId) {
      showToast("Deal isn't backed by a draft — can't advance");
      return;
    }
    try {
      const res = await fetch("/api/crm/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: d.draftId, stage: next }),
      });
      if (!res.ok) throw new Error("Stage update failed");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Stage update failed");
      return;
    }
    setLiveDeals((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, stage: next, probability: newProb, lastTouch: "just now" } : x))
    );
    setOpen({ ...d, stage: next, probability: newProb });
    showToast(`Advanced to ${next}`);
  }

  function handleBuildQuote(d: Deal) {
    setOpen(null);
    router.push(`/deals?company=${encodeURIComponent(d.company)}&product=${encodeURIComponent(d.product)}`);
  }

  // Real-only — liveDeals is the full list now that the SAMPLE seed is gone.
  const filtered = useMemo(() => {
    if (!query) return liveDeals;
    const q = query.toLowerCase();
    return liveDeals.filter(
      (d) =>
        d.company.toLowerCase().includes(q) ||
        d.product.toLowerCase().includes(q) ||
        d.owner.toLowerCase().includes(q)
    );
  }, [query, liveDeals]);

  const byStage: Record<DealStage, LiveDeal[]> = useMemo(() => {
    const out = {} as Record<DealStage, LiveDeal[]>;
    for (const s of STAGES) out[s] = [];
    for (const d of filtered) out[d.stage].push(d);
    return out;
  }, [filtered]);

  const totalValue = filtered.reduce((s, d) => s + d.value, 0);
  const wonValue = filtered.filter((d) => d.stage === "Closed Won").reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">CRM Pipeline</h1>
            <p className="text-xs text-ink-secondary">
              {liveDeals.length === 0
                ? "No deals yet — deals appear when an OutreachDraft is sent and gets a dealStage / dealValue"
                : `${filtered.length} deal${filtered.length === 1 ? "" : "s"} · ${formatMoney(totalValue)} pipeline value · ${formatMoney(wonValue)} closed won`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search deals…"
              className="h-9 w-64 rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-bg-border">
            <button
              onClick={() => setView("kanban")}
              className={`px-3 text-xs ${
                view === "kanban" ? "bg-brand-500/15 text-brand-200" : "bg-bg-card text-ink-secondary"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 text-xs ${
                view === "list" ? "bg-brand-500/15 text-brand-200" : "bg-bg-card text-ink-secondary"
              }`}
            >
              List
            </button>
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow">
            <Plus className="h-4 w-4" /> New Deal
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const deals = byStage[stage];
            const sum = deals.reduce((s, d) => s + d.value, 0);
            return (
              <div key={stage} className={`rounded-xl border ${STAGE_TONE[stage]} flex flex-col`}>
                <div className="flex items-center justify-between border-b border-bg-border px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
                    <span className="text-xs font-semibold">{stage}</span>
                  </div>
                  <span className="rounded-md bg-bg-hover/60 px-1.5 py-0.5 text-[10px] text-ink-secondary">
                    {deals.length}
                  </span>
                </div>
                <div className="px-3 py-2 text-[11px] text-ink-tertiary">
                  {formatMoney(sum)}
                </div>
                <div className="flex-1 space-y-2 px-2 pb-3">
                  {deals.map((d) => (
                    <DealCard key={d.id} d={d} onClick={() => setOpen(d)} />
                  ))}
                  {deals.length === 0 && (
                    <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-bg-border text-[11px] text-ink-tertiary">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr className="border-b border-bg-border">
                <th className="px-5 py-2.5 text-left font-medium">Deal</th>
                <th className="px-3 py-2.5 text-left font-medium">Stage</th>
                <th className="px-3 py-2.5 text-left font-medium">Value</th>
                <th className="px-3 py-2.5 text-left font-medium">Owner</th>
                <th className="px-3 py-2.5 text-left font-medium">Close</th>
                <th className="px-3 py-2.5 text-left font-medium">% to win</th>
                <th className="px-5 py-2.5 text-left font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Workflow className="mx-auto mb-2 h-6 w-6 text-ink-tertiary" />
                    <div className="text-sm font-semibold">
                      {liveDeals.length === 0 ? "No deals in your pipeline yet" : "No deals match your search"}
                    </div>
                    <p className="mx-auto mt-1 max-w-md text-xs text-ink-tertiary">
                      {liveDeals.length === 0
                        ? <>Deals appear here when an outreach draft is sent and the operator (or the Negotiation Agent) sets a deal stage. Run a pipeline from <a href="/pipeline" className="text-brand-300 hover:underline">/pipeline</a> to start.</>
                        : "Clear the search box to see all deals."}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setOpen(d)}
                  className="cursor-pointer border-t border-bg-border hover:bg-bg-hover/30"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium">{d.company}</div>
                    <div className="text-[11px] text-ink-tertiary">{d.product}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${STAGE_TONE[d.stage]}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[d.stage]}`} />
                      {d.stage}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-semibold text-brand-200">
                    {formatMoney(d.value)}
                  </td>
                  <td className="px-3 py-3 text-ink-secondary">{d.owner}</td>
                  <td className="px-3 py-3 text-ink-secondary">{d.closeDate}</td>
                  <td className="px-3 py-3">{d.probability}%</td>
                  <td className="px-5 py-3 text-ink-secondary">{d.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title="Deal Details">
        {open && <DealDetail d={open} onAdvance={handleAdvance} onBuildQuote={handleBuildQuote} />}
      </Drawer>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="pointer-events-auto rounded-lg border border-accent-green/40 bg-bg-panel px-4 py-2.5 text-xs shadow-2xl shadow-accent-green/20">
            <span className="font-semibold text-accent-green">✓</span>{" "}
            <span className="text-ink-secondary">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
