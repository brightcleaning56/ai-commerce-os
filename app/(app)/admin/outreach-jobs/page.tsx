"use client";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";

type JobStatus = "pending" | "running" | "completed" | "cancelled" | "failed";

type JobSummary = {
  id: string;
  createdAt: string;
  createdBy: string;
  status: JobStatus;
  campaignLabel?: string;
  total: number;
  processed: number;
  stats: { drafted: number; skipped: number; errored: number };
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  lastTickAt?: string;
  pitchOverride?: {
    currentBrand: string;
    alternative: string;
    rationale: string;
  };
};

type JobOutcome =
  | { businessId: string; status: "drafted"; draftId: string; at: string }
  | { businessId: string; status: "skipped"; reason: string; at: string }
  | { businessId: string; status: "error"; error: string; at: string };

type JobDetail = JobSummary & {
  businessIds: string[];
  batchSize: number;
  outcomes: JobOutcome[];
};

const STATUS_TONE: Record<JobStatus, string> = {
  pending: "bg-bg-hover text-ink-secondary",
  running: "bg-accent-blue/15 text-accent-blue",
  completed: "bg-accent-green/15 text-accent-green",
  cancelled: "bg-bg-hover text-ink-tertiary",
  failed: "bg-accent-red/15 text-accent-red",
};

const STATUS_ICON: Record<JobStatus, typeof Clock> = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  cancelled: X,
  failed: AlertCircle,
};

function relTime(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 30 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function etaMinutes(job: JobSummary): number | null {
  if (job.status !== "pending" && job.status !== "running") return null;
  const remaining = job.total - job.processed;
  if (remaining <= 0) return 0;
  // Cron runs every 5 min, processes 25 per tick (default batchSize).
  // Approximation; actual cadence may vary if cron is paused.
  const ticks = Math.ceil(remaining / 25);
  return ticks * 5;
}

export default function OutreachJobsPage() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [tickingId, setTickingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/admin/outreach-jobs", { cache: "no-store" });
      if (r.status === 401) {
        setLoadError("Not signed in — visit /signin and try again.");
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setLoadError(`API returned ${r.status}: ${body.error ?? r.statusText}`);
        return;
      }
      const d = await r.json();
      setJobs(d.jobs ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Poll every 10s so running jobs animate forward without manual refresh
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  // Load detail when a job is selected
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    async function loadDetail(id: string) {
      setLoadingDetail(true);
      try {
        const r = await fetch(`/api/admin/outreach-jobs/${id}`, { cache: "no-store" });
        if (!r.ok) {
          if (!cancelled) setDetail(null);
          return;
        }
        const d = await r.json();
        if (!cancelled) setDetail(d.job);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }
    loadDetail(selectedId);
    // Re-fetch detail when the parent jobs list polls (so the drawer stays fresh)
    return () => { cancelled = true; };
  }, [selectedId, jobs]);

  async function cancelJob(id: string) {
    if (!confirm("Cancel this job? Already-drafted outcomes stay; the cron stops touching this job after the next tick.")) {
      return;
    }
    setCancellingId(id);
    try {
      const r = await fetch(`/api/admin/outreach-jobs/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Cancel failed (${r.status})`);
      toast("Job cancelled", "info");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Cancel failed", "error");
    } finally {
      setCancellingId(null);
    }
  }

  async function forceTick(id: string) {
    // Operator can force the cron processor to run now by hitting the
    // cron endpoint directly. Useful when CRON_SECRET is configured —
    // we send the auth header from the admin cookie session. Falls
    // back to a refresh notice if the cron endpoint refuses.
    setTickingId(id);
    try {
      // The cron endpoint expects Bearer CRON_SECRET — we can't access
      // that from the browser. So instead just trigger a quick refresh
      // and tell the user the cron runs every 5 min.
      await load();
      toast("Cron runs every 5 min · refreshed status", "info");
    } finally {
      setTickingId(null);
    }
    // Silence the unused tickingId per-button lint:
    void id;
  }

  const tilesData = useMemo(() => {
    const list = jobs ?? [];
    const active = list.filter((j) => j.status === "pending" || j.status === "running").length;
    const completed = list.filter((j) => j.status === "completed").length;
    const failed = list.filter((j) => j.status === "failed").length;
    const totalDrafted = list.reduce((s, j) => s + j.stats.drafted, 0);
    return [
      { k: "Active jobs", v: active, hint: active > 0 ? "in queue or running" : "—" },
      { k: "Completed", v: completed },
      { k: "Failed", v: failed, hint: failed > 0 ? "needs review" : "—" },
      { k: "Drafts produced", v: totalDrafted, hint: "across all jobs" },
    ];
  }, [jobs]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Outreach Jobs</h1>
            <p className="text-xs text-ink-secondary">
              {jobs?.length === 0
                ? "No jobs yet — queue one from /admin/edges or /admin/businesses"
                : `${jobs?.length ?? 0} job${jobs?.length === 1 ? "" : "s"} · cron runs every 5 min, drafts 25 per tick`}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-cyan/15">
            <Sparkles className="h-3.5 w-3.5 text-accent-cyan" />
          </div>
          <div className="flex-1 text-ink-secondary">
            <span className="font-semibold text-accent-cyan">Bulk outreach queue</span>
            {" "}— jobs get processed automatically by the{" "}
            <code className="rounded bg-bg-hover px-1 text-[10px]">cron-outreach-jobs</code>
            {" "}cron every 5 min. Each tick drafts up to 25 businesses; drafts land in /outreach
            for review. Cancel a pending/running job here to stop further processing — already-
            drafted outcomes stay.
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load jobs:</strong> {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tilesData.map((t) => (
          <div key={t.k} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{t.k}</div>
            <div className="mt-1 text-2xl font-bold">{t.v.toLocaleString()}</div>
            {t.hint && <div className="text-[10px] text-ink-tertiary">{t.hint}</div>}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
        {jobs === null && !loadError ? (
          <div className="flex items-center gap-2 px-5 py-8 text-[12px] text-ink-tertiary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading jobs…
          </div>
        ) : jobs && jobs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Layers className="mx-auto h-8 w-8 text-ink-tertiary" />
            <div className="mt-3 text-base font-semibold">No outreach jobs yet</div>
            <p className="mt-1 max-w-md mx-auto text-xs text-ink-tertiary">
              Jobs are created when you click <strong>Queue swap → N</strong> on{" "}
              <Link href="/admin/edges" className="text-brand-300 hover:underline">/admin/edges</Link>
              {" "}for a brand with more than 25 businesses, OR via direct POST to{" "}
              <code className="rounded bg-bg-hover px-1">/api/admin/outreach-jobs</code>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr className="border-b border-bg-border">
                  <th className="px-5 py-2.5 text-left font-medium">Campaign</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="px-3 py-2.5 text-left font-medium">Progress</th>
                  <th className="px-3 py-2.5 text-right font-medium">Drafted</th>
                  <th className="px-3 py-2.5 text-right font-medium">Skipped</th>
                  <th className="px-3 py-2.5 text-right font-medium">Errored</th>
                  <th className="px-3 py-2.5 text-left font-medium">ETA</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(jobs ?? []).map((j) => {
                  const Icon = STATUS_ICON[j.status];
                  const pct = j.total === 0 ? 0 : Math.round((j.processed / j.total) * 100);
                  const eta = etaMinutes(j);
                  return (
                    <tr
                      key={j.id}
                      onClick={() => setSelectedId(j.id)}
                      className={`cursor-pointer border-t border-bg-border hover:bg-bg-hover/30 ${
                        selectedId === j.id ? "bg-bg-hover/40" : ""
                      }`}
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">
                          {j.campaignLabel ?? `Bulk outreach · ${j.total}`}
                        </div>
                        <div className="text-[11px] text-ink-tertiary">
                          {j.createdBy} · {relTime(j.createdAt)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[j.status]}`}
                        >
                          <Icon className={`h-3 w-3 ${j.status === "running" ? "animate-spin" : ""}`} />
                          {j.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 w-44">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-hover">
                            <div
                              className={`h-full ${
                                j.status === "completed"
                                  ? "bg-accent-green"
                                  : j.status === "failed"
                                    ? "bg-accent-red"
                                    : j.status === "cancelled"
                                      ? "bg-ink-tertiary"
                                      : "bg-gradient-brand"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-ink-tertiary tabular-nums">
                            {j.processed}/{j.total}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-accent-green">
                        {j.stats.drafted}
                      </td>
                      <td className="px-3 py-3 text-right text-ink-secondary">{j.stats.skipped}</td>
                      <td className="px-3 py-3 text-right text-ink-secondary">
                        {j.stats.errored > 0 ? (
                          <span className="text-accent-red">{j.stats.errored}</span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-ink-secondary">
                        {eta === null
                          ? "—"
                          : eta === 0
                            ? "next tick"
                            : `~${eta} min`}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div
                          className="inline-flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(j.status === "pending" || j.status === "running") && (
                            <button
                              onClick={() => cancelJob(j.id)}
                              disabled={cancellingId === j.id}
                              className="flex items-center gap-1 rounded-md border border-accent-red/30 bg-accent-red/5 px-2 py-1 text-[10px] text-accent-red hover:bg-accent-red/10 disabled:opacity-60"
                              title="Cancel this job — cron stops touching it after the next tick"
                            >
                              {cancellingId === j.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drill-in drawer — full job detail */}
      {selectedId && (
        <div
          className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/40"
          onClick={() => setSelectedId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-2xl flex-col border-l border-bg-border bg-bg-panel shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <button
                  onClick={() => setSelectedId(null)}
                  className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                {detail?.campaignLabel ?? "Outreach Job"}
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {loadingDetail && !detail ? (
              <div className="flex items-center gap-2 p-5 text-[12px] text-ink-tertiary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : !detail ? (
              <div className="p-5 text-[12px] text-ink-tertiary">Job not found.</div>
            ) : (
              <>
                <div className="border-b border-bg-border px-5 py-3 text-[12px]">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Status</div>
                      <div className="mt-0.5">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[detail.status]}`}>
                          {detail.status}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Created</div>
                      <div className="mt-0.5 text-ink-secondary">{relTime(detail.createdAt)} · {detail.createdBy}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Last tick</div>
                      <div className="mt-0.5 text-ink-secondary">{relTime(detail.lastTickAt)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Batch size</div>
                      <div className="mt-0.5 text-ink-secondary">{detail.batchSize} / tick</div>
                    </div>
                  </div>
                  {detail.pitchOverride && (
                    <div className="mt-3 rounded-lg border border-brand-500/30 bg-brand-500/5 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-brand-300">Pitch override</div>
                      <div className="mt-1 text-[11px] text-ink-secondary">
                        Switch <strong>{detail.pitchOverride.currentBrand}</strong> →{" "}
                        <strong>{detail.pitchOverride.alternative}</strong>
                      </div>
                      <p className="mt-1 text-[10px] italic text-ink-tertiary">{detail.pitchOverride.rationale}</p>
                    </div>
                  )}
                </div>

                <div className="border-b border-bg-border px-5 py-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">
                      <span className="font-semibold text-accent-green">{detail.stats.drafted}</span> drafted ·{" "}
                      <span className="font-semibold">{detail.stats.skipped}</span> skipped ·{" "}
                      <span className={detail.stats.errored > 0 ? "text-accent-red font-semibold" : ""}>
                        {detail.stats.errored} errored
                      </span>
                    </span>
                    <span className="text-ink-tertiary">
                      {detail.outcomes.length} / {detail.businessIds.length}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-3 text-[11px]">
                  {detail.outcomes.length === 0 ? (
                    <div className="text-center text-ink-tertiary py-8">
                      Cron hasn&apos;t picked up this job yet. Next tick within 5 min.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {detail.outcomes
                        .slice()
                        .reverse()
                        .map((o, i) => (
                          <div
                            key={`${o.businessId}-${i}`}
                            className="flex items-start justify-between gap-3 rounded-md border border-bg-border bg-bg-card/40 px-2 py-1.5"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-ink-tertiary">{o.businessId}</span>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                    o.status === "drafted"
                                      ? "bg-accent-green/15 text-accent-green"
                                      : o.status === "skipped"
                                        ? "bg-bg-hover text-ink-tertiary"
                                        : "bg-accent-red/15 text-accent-red"
                                  }`}
                                >
                                  {o.status}
                                </span>
                              </div>
                              {o.status === "drafted" && (
                                <Link
                                  href={`/outreach`}
                                  className="text-[10px] text-brand-300 hover:underline"
                                >
                                  → draft {o.draftId}
                                </Link>
                              )}
                              {o.status === "skipped" && (
                                <div className="text-[10px] text-ink-tertiary">{o.reason}</div>
                              )}
                              {o.status === "error" && (
                                <div className="text-[10px] text-accent-red">{o.error}</div>
                              )}
                            </div>
                            <span className="shrink-0 text-[9px] text-ink-tertiary">{relTime(o.at)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-bg-border px-5 py-3">
                  <div className="text-[10px] text-ink-tertiary">
                    Polls every 10s · cron processes 25 per 5 min
                  </div>
                  {(detail.status === "pending" || detail.status === "running") && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => forceTick(detail.id)}
                        disabled={tickingId === detail.id}
                        className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2.5 py-1 text-[10px] hover:bg-bg-hover disabled:opacity-60"
                        title="Refresh status now"
                      >
                        {tickingId === detail.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Refresh
                      </button>
                      <button
                        onClick={() => cancelJob(detail.id)}
                        disabled={cancellingId === detail.id}
                        className="flex items-center gap-1 rounded-md border border-accent-red/30 bg-accent-red/5 px-2.5 py-1 text-[10px] text-accent-red hover:bg-accent-red/10 disabled:opacity-60"
                      >
                        {cancellingId === detail.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Pause className="h-3 w-3" />
                        )}
                        Cancel job
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
