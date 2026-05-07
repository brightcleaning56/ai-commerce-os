"use client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  Mail,
  Package,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Run = {
  id: string;
  shareToken: string;
  triggeredBy: "manual" | "cron";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totals: {
    products: number;
    buyers: number;
    suppliers: number;
    drafts: number;
    riskFlags: number;
    totalCost: number;
  };
  productSummaries: any[];
  buyerSummaries: any[];
  supplierSummaries: any[];
  draftSummaries: any[];
  riskFlagSummaries: any[];
  steps: { agent: string; status: "success" | "error"; durationMs: number; detail: string }[];
};

const AGENT_LABEL: Record<string, string> = {
  "trend-hunter": "Trend Hunter",
  "buyer-discovery": "Buyer Discovery",
  "supplier-finder": "Supplier Finder",
  outreach: "Outreach",
  negotiation: "Negotiation",
  risk: "Risk Agent",
};

function fmtCurrency(n: number) {
  if (n === 0) return "fallback mode";
  return `$${n.toFixed(5)}`;
}

export default function SharePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const token = search.get("t") || "";
  const [run, setRun] = useState<Run | null>(null);
  const [scope, setScope] = useState<"full" | "recipient">("full");
  const [linkLabel, setLinkLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [expiredAt, setExpiredAt] = useState<string | null>(null);
  const [revokedAt, setRevokedAt] = useState<string | null>(null);
  const [reason, setReason] = useState<"expired" | "revoked" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/share/${id}?t=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setErrorStatus(res.status);
          if (res.status === 410) {
            if (data.reason === "revoked") {
              setReason("revoked");
              if (data.revokedAt) setRevokedAt(data.revokedAt);
            } else {
              setReason("expired");
              if (data.expiredAt) setExpiredAt(data.expiredAt);
            }
          }
          throw new Error(data.error ?? `${res.status}`);
        }
        setRun(data.run);
        if (data.scope === "recipient" || data.scope === "full") setScope(data.scope);
        if (typeof data.linkLabel === "string") setLinkLabel(data.linkLabel);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center text-sm text-ink-tertiary">
          Loading run…
        </div>
      </div>
    );
  }

  if (error || !run) {
    const isExpired = errorStatus === 410 && reason === "expired";
    const isRevoked = errorStatus === 410 && reason === "revoked";
    const Icon = isRevoked ? ShieldOff : isExpired ? Clock : Lock;
    const tone = isRevoked
      ? { bg: "bg-accent-red/15", text: "text-accent-red" }
      : isExpired
      ? { bg: "bg-accent-amber/15", text: "text-accent-amber" }
      : { bg: "bg-bg-card", text: "text-ink-tertiary" };
    const heading = isRevoked
      ? "This share link has been revoked"
      : isExpired
      ? "This share link has expired"
      : "Run unavailable";
    const detail = isRevoked
      ? `The sender revoked this link${
          revokedAt ? ` on ${new Date(revokedAt).toLocaleString()}` : ""
        }. The data is no longer accessible — ask the sender for a new link if you still need it.`
      : isExpired
      ? `The sender set this link to expire${
          expiredAt ? ` on ${new Date(expiredAt).toLocaleString()}` : ""
        }. Ask them to generate a new one with a longer TTL.`
      : error === "Invalid or missing share token"
      ? "This share link is missing its access token or the token doesn't match. Ask the sender for the full URL."
      : error === "Run not found or expired"
      ? "The pipeline run for this URL is no longer available. Persistence is per-instance and may have rotated."
      : `Couldn't load this run: ${error}`;
    return (
      <div className="min-h-screen bg-bg-base">
        <div className="mx-auto max-w-2xl px-6 py-32 text-center">
          <div className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${tone.bg}`}>
            <Icon className={`h-7 w-7 ${tone.text}`} />
          </div>
          <h1 className="mt-6 text-xl font-bold">{heading}</h1>
          <p className="mt-2 text-sm text-ink-secondary">{detail}</p>
          <Link
            href="/welcome"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-4 py-2 text-sm hover:bg-bg-hover"
          >
            <ArrowRight className="h-4 w-4" /> AI Commerce OS home
          </Link>
        </div>
      </div>
    );
  }

  const startedDate = new Date(run.startedAt);
  const fmt = startedDate.toLocaleString();

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Branded header */}
      <header className="border-b border-bg-border bg-bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand shadow-glow">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">AI Commerce OS</div>
              <div className="text-[10px] text-ink-tertiary">
                {linkLabel && linkLabel !== "Default link"
                  ? `Shared pipeline run for ${linkLabel}`
                  : "Shared pipeline run"}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2 text-right">
            {scope === "recipient" && (
              <span className="rounded-md bg-brand-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-200">
                Recipient view
              </span>
            )}
            <span className="rounded-md bg-accent-green/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-green">
              Read-only
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        {/* Headline */}
        <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent p-8 shadow-glow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-300">
                <Sparkles className="h-3.5 w-3.5" /> Pipeline run
              </div>
              <h1 className="mt-2 font-mono text-2xl font-bold">{run.id}</h1>
              <p className="mt-1 text-xs text-ink-tertiary">
                {fmt} · {run.triggeredBy === "cron" ? "Auto-triggered (cron)" : "Manually triggered"} ·{" "}
                {(run.durationMs / 1000).toFixed(2)}s · {fmtCurrency(run.totals.totalCost)}
              </p>
            </div>
            <Link
              href="/welcome"
              className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
            >
              See the platform <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div
            className={`mt-6 grid grid-cols-2 gap-3 ${
              scope === "recipient" ? "sm:grid-cols-3" : "sm:grid-cols-5"
            }`}
          >
            <Tile label="Products" v={run.totals.products} Icon={Package} tone="brand" />
            {scope === "full" && (
              <Tile label="Buyers" v={run.totals.buyers} Icon={Users} tone="blue" />
            )}
            <Tile label="Suppliers" v={run.totals.suppliers} Icon={Package} tone="amber" />
            <Tile label="Risk flags" v={run.totals.riskFlags} Icon={ShieldAlert} tone="red" />
            {scope === "full" && (
              <Tile label="Drafts" v={run.totals.drafts} Icon={Mail} tone="cyan" />
            )}
          </div>
        </div>

        {/* Step timeline */}
        <Section title="Step timeline" Icon={Clock}>
          <ol className="divide-y divide-bg-border">
            {run.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3">
                <div
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${
                    s.status === "success" ? "bg-accent-green/15" : "bg-accent-red/15"
                  }`}
                >
                  {s.status === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-accent-red" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{AGENT_LABEL[s.agent] ?? s.agent}</div>
                  <div className="text-[11px] text-ink-tertiary">{s.detail}</div>
                </div>
                <div className="text-[11px] text-ink-tertiary">{(s.durationMs / 1000).toFixed(2)}s</div>
              </li>
            ))}
          </ol>
        </Section>

        {/* Products */}
        {run.productSummaries.length > 0 && (
          <Section title={`Trending products (${run.productSummaries.length})`} Icon={Package}>
            <ul className="divide-y divide-bg-border">
              {run.productSummaries.map((p) => (
                <li key={p.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-card text-xl">
                    {p.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.name}</span>
                      <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-200">
                        {p.demandScore}
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-tertiary">{p.category}</div>
                    {p.rationale && (
                      <p className="mt-1 text-xs text-ink-secondary">{p.rationale}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Suppliers */}
        {run.supplierSummaries.length > 0 && (
          <Section title={`Suppliers (${run.supplierSummaries.length})`} Icon={Package}>
            <ul className="divide-y divide-bg-border">
              {run.supplierSummaries.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-amber/15 text-accent-amber text-lg">
                    🏭
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.name}</span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                          s.riskScore >= 60
                            ? "bg-accent-red/15 text-accent-red"
                            : s.riskScore >= 30
                            ? "bg-accent-amber/15 text-accent-amber"
                            : "bg-accent-green/15 text-accent-green"
                        }`}
                      >
                        risk {s.riskScore}
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-tertiary">
                      {s.type} · {s.country} · ${s.unitPrice}/unit · MOQ {s.moq} · {s.leadTimeDays}d lead
                    </div>
                    {s.rationale && <p className="mt-1 text-xs text-ink-secondary">{s.rationale}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Buyers */}
        {run.buyerSummaries.length > 0 && (
          <Section title={`Buyer leads (${run.buyerSummaries.length})`} Icon={Users}>
            <ul className="divide-y divide-bg-border">
              {run.buyerSummaries.map((b) => (
                <li key={b.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent-blue/15 text-[10px] font-bold text-accent-blue">
                    {b.company.split(" ").slice(0, 2).map((w: string) => w[0]).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{b.company}</span>
                      <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-200">
                        intent {b.intentScore}
                      </span>
                      <span className="rounded-md bg-bg-hover px-1.5 py-0.5 text-[10px] font-bold text-ink-secondary">
                        fit {b.fit}%
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-tertiary">
                      {b.type} · {b.location} · for{" "}
                      <span className="text-brand-300">{b.forProduct}</span>
                    </div>
                    {b.rationale && <p className="mt-1 text-xs text-ink-secondary">{b.rationale}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Risk flags */}
        {run.riskFlagSummaries.length > 0 && (
          <Section title={`Risk flags (${run.riskFlagSummaries.length})`} Icon={ShieldAlert}>
            <ul className="divide-y divide-bg-border">
              {run.riskFlagSummaries.map((f, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3">
                  <div
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${
                      f.severity === "Critical"
                        ? "bg-accent-red/15 text-accent-red"
                        : f.severity === "High"
                        ? "bg-accent-amber/15 text-accent-amber"
                        : "bg-accent-blue/15 text-accent-blue"
                    }`}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                          f.severity === "Critical"
                            ? "bg-accent-red/15 text-accent-red"
                            : f.severity === "High"
                            ? "bg-accent-amber/15 text-accent-amber"
                            : "bg-accent-blue/15 text-accent-blue"
                        }`}
                      >
                        {f.severity}
                      </span>
                      <span className="rounded-md bg-bg-hover/60 px-2 py-0.5 text-[10px] text-ink-secondary">
                        {f.category}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-semibold">{f.title}</div>
                    <p className="mt-0.5 text-xs text-ink-secondary">{f.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Drafts */}
        {run.draftSummaries.length > 0 && (
          <Section title={`Outreach drafts (${run.draftSummaries.length})`} Icon={Mail}>
            <ul className="divide-y divide-bg-border">
              {run.draftSummaries.map((d) => (
                <li key={d.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
                    <span className="font-semibold text-ink-primary">{d.emailSubject}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-tertiary">
                    → {d.buyerName} @ {d.buyerCompany} · for{" "}
                    <span className="text-brand-300">{d.productName}</span>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-ink-secondary">
                    {d.emailPreview}
                    {d.emailPreview.length >= 240 ? "…" : ""}
                  </pre>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Footer / trust marker */}
        <div className="rounded-xl border border-bg-border bg-bg-card p-5 text-xs text-ink-secondary">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent-green" />
            <span className="font-semibold text-ink-primary">
              {scope === "recipient" ? "Read-only recipient view" : "Read-only snapshot"}
            </span>
          </div>
          <p className="mt-1">
            {scope === "recipient" ? (
              <>
                This is a per-recipient view: trends, suppliers, and risk flags only.
                The full pipeline run includes additional internal data (other prospects,
                outreach drafts) that is intentionally not shown here.
              </>
            ) : (
              <>
                This URL contains an unguessable share token. No edit controls, no logged-in
                surface, no buyer email addresses. Anyone with the link can view this run;
                without the token, the URL returns 403.
              </>
            )}
          </p>
          <p className="mt-2">
            Generated by <Link href="/welcome" className="text-brand-300 hover:text-brand-200">AI Commerce OS</Link>{" "}
            — an autonomous commerce agent network.
          </p>
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
      <div className="flex items-center gap-2 border-b border-bg-border px-5 py-3 text-sm font-semibold">
        <Icon className="h-4 w-4 text-brand-300" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Tile({
  label,
  v,
  Icon,
  tone,
}: {
  label: string;
  v: number;
  Icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "blue" | "amber" | "red" | "cyan";
}) {
  const map = {
    brand: { bg: "bg-brand-500/15", text: "text-brand-300" },
    blue: { bg: "bg-accent-blue/15", text: "text-accent-blue" },
    amber: { bg: "bg-accent-amber/15", text: "text-accent-amber" },
    red: { bg: "bg-accent-red/15", text: "text-accent-red" },
    cyan: { bg: "bg-accent-cyan/15", text: "text-accent-cyan" },
  };
  const t = map[tone];
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3">
      <div className={`grid h-8 w-8 place-items-center rounded-lg ${t.bg}`}>
        <Icon className={`h-4 w-4 ${t.text}`} />
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-0.5 text-2xl font-bold">{v}</div>
    </div>
  );
}
