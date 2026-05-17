"use client";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Upload,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * /cadences — admin surface for the slice 3 cadence engine.
 *
 * Three jobs:
 *   1. List existing cadences with their step recipes + enrollment counts
 *   2. Create a new cadence (channels, delays, subject/body templates,
 *      branching on outcome)
 *   3. View enrollments per cadence + pause/resume/stop them
 *
 * Without this surface, slice 3 is API-only and the operator can't see
 * what they've configured. With it, the cadence engine is end-to-end
 * usable: define the recipe here, enroll buyers from /buyers, watch
 * scheduled steps land on /queue, mark them done, branch on outcome.
 *
 * Capability gating: the underlying APIs require outreach:write to
 * mutate. The page itself is rendered behind the same gate via the
 * layout-level capability guard (see lib/nav.ts entry below).
 */

type Channel = "call" | "email" | "sms";
type CadenceStep = {
  channel: Channel;
  delayHours: number;
  label?: string;
  subject?: string;
  bodyTemplate?: string;
  branches?: Array<{ ifOutcome: string; gotoIndex: number }>;
};
type Cadence = {
  id: string;
  name: string;
  description?: string;
  steps: CadenceStep[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};
type Enrollment = {
  id: string;
  cadenceId: string;
  buyerId: string;
  buyerName: string;
  buyerCompany: string;
  buyerEmail?: string;
  buyerPhone?: string;
  currentStepIndex: number;
  nextStepDueAt: string;
  status: "active" | "completed" | "stopped" | "paused";
  startedAt: string;
  lastStepOutcome?: string;
  queueItemIds: string[];
};

const CHANNEL_ICON: Record<Channel, typeof Phone> = {
  call: Phone,
  email: Mail,
  sms: MessageSquare,
};

const STATUS_TONE: Record<Enrollment["status"], string> = {
  active: "bg-accent-green/15 text-accent-green",
  paused: "bg-accent-amber/15 text-accent-amber",
  stopped: "bg-bg-hover text-ink-tertiary",
  completed: "bg-accent-blue/15 text-accent-blue",
};

/**
 * Slice 59: substitute every supported merge tag with sample values.
 * The runner's actual merge logic (lib/cadences.ts) only handles
 * {{name}} + {{company}}. Slice 59.5 will extend the runner to
 * pull freight_* values from the buyer's most recent quote so
 * the preview stays in sync with what's actually sent.
 */
function applyPreviewTags(input: string): string {
  return input
    .replace(/\{\{\s*name\s*\}\}/gi, "Sarah")
    .replace(/\{\{\s*company\s*\}\}/gi, "FitLife Co.")
    .replace(/\{\{\s*freight_lane\s*\}\}/gi, "CN -> US-CA")
    .replace(/\{\{\s*freight_cheapest\s*\}\}/gi, "$4,200")
    .replace(/\{\{\s*freight_mode\s*\}\}/gi, "ocean-fcl")
    .replace(/\{\{\s*freight_transit\s*\}\}/gi, "21-45 days");
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    const future = -ms;
    if (future < 3_600_000) return `in ${Math.ceil(future / 60_000)}m`;
    if (future < 86_400_000) return `in ${Math.ceil(future / 3_600_000)}h`;
    return `in ${Math.ceil(future / 86_400_000)}d`;
  }
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function CadencesPage() {
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [enrollmentsByCadence, setEnrollmentsByCadence] = useState<Record<string, Enrollment[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/cadences", { cache: "no-store", credentials: "include" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Load failed (${r.status})`);
      }
      const d = await r.json();
      const list: Cadence[] = d.cadences ?? [];
      setCadences(list);
      // Best-effort prefetch of enrollments for each cadence so the
      // count badges + drill-down render without a second click.
      const enrMap: Record<string, Enrollment[]> = {};
      await Promise.all(
        list.map(async (c) => {
          try {
            const er = await fetch(`/api/cadences/${c.id}/enroll`, {
              cache: "no-store",
              credentials: "include",
            });
            if (er.ok) {
              const ed = await er.json();
              enrMap[c.id] = ed.enrollments ?? [];
            }
          } catch {
            /* ignore -- empty map = "no enrollments shown" */
          }
        }),
      );
      setEnrollmentsByCadence(enrMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load cadences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalActiveEnrollments = useMemo(() => {
    return Object.values(enrollmentsByCadence)
      .flat()
      .filter((e) => e.status === "active").length;
  }, [enrollmentsByCadence]);

  async function toggleActive(c: Cadence) {
    try {
      const r = await fetch(`/api/cadences/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: !c.active }),
      });
      if (!r.ok) throw new Error("Toggle failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  }

  async function pauseAll(c: Cadence, mode: "pause" | "resume" | "stop") {
    const enrs = enrollmentsByCadence[c.id] ?? [];
    const candidates =
      mode === "resume"
        ? enrs.filter((e) => e.status === "paused").length
        : mode === "stop"
          ? enrs.filter((e) => e.status === "active" || e.status === "paused").length
          : enrs.filter((e) => e.status === "active").length;
    if (candidates === 0) {
      setError(`No enrollments to ${mode}.`);
      return;
    }
    const verb = mode === "pause" ? "Pause" : mode === "resume" ? "Resume" : "Stop";
    const ok = confirm(
      `${verb} ${candidates} enrollment${candidates === 1 ? "" : "s"} in "${c.name}"?`,
    );
    if (!ok) return;
    try {
      const r = await fetch(`/api/cadences/${c.id}/pause-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Pause-all failed (${r.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pause-all failed");
    }
  }

  async function deleteCadence(c: Cadence) {
    const enrs = enrollmentsByCadence[c.id] ?? [];
    const active = enrs.filter((e) => e.status === "active" || e.status === "paused").length;
    const ok = confirm(
      `Delete cadence "${c.name}"?\n\n` +
        (active > 0
          ? `${active} active or paused enrollment${active === 1 ? "" : "s"} will be stopped on the next cron tick.\n\n`
          : "") +
        `Pending queue items will be cleaned up. This can't be undone.`,
    );
    if (!ok) return;
    try {
      const r = await fetch(`/api/cadences/${c.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Delete failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function patchEnrollment(eid: string, status: Enrollment["status"]) {
    try {
      const r = await fetch(`/api/enrollments/${eid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Patch failed (${r.status})`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Patch failed");
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cadences</h1>
          <p className="text-[12px] text-ink-tertiary">
            Sequenced multi-touch outreach. Each cadence is a static recipe
            (Day 1 email → Day 3 call → Day 5 SMS). Enroll a buyer from
            their detail page; the runner schedules the next step on
            /queue every 15 minutes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-accent-blue px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New cadence
          </button>
        </div>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <SummaryTile label="Cadences" value={cadences.length} Icon={Workflow} />
        <SummaryTile
          label="Active"
          value={cadences.filter((c) => c.active).length}
          tone="green"
          Icon={Play}
        />
        <SummaryTile
          label="Active enrollments"
          value={totalActiveEnrollments}
          tone="blue"
          Icon={Clock}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}

      {showCreate && <CreateCadenceForm onClose={() => setShowCreate(false)} onCreated={load} />}

      {/* Cadence list */}
      {loading && cadences.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-ink-tertiary">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading cadences…
        </div>
      ) : cadences.length === 0 ? (
        <div className="rounded-xl border border-bg-border bg-bg-card p-10 text-center">
          <Workflow className="mx-auto mb-3 h-8 w-8 text-ink-tertiary/60" />
          <div className="text-sm font-semibold">No cadences yet</div>
          <p className="mt-1 text-[12px] text-ink-tertiary">
            Create your first sequence — e.g. "Day 1 email → Day 3 call →
            Day 5 SMS → Day 7 final email".
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-1 rounded-md bg-accent-blue px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New cadence
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cadences.map((c) => {
            const enrs = enrollmentsByCadence[c.id] ?? [];
            const isExpanded = expandedId === c.id;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-bg-border bg-bg-card"
              >
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className="text-ink-tertiary hover:text-ink-primary"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{c.name}</span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          c.active ? "bg-accent-green/15 text-accent-green" : "bg-bg-hover text-ink-tertiary"
                        }`}
                      >
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {c.description && (
                      <p className="mt-0.5 text-[11px] text-ink-tertiary">{c.description}</p>
                    )}
                  </div>
                  <StepStrip steps={c.steps} />
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Enrolled</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {enrs.filter((e) => e.status === "active").length}/{enrs.length}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Slice 28: pause-all + resume-all + stop-all controls.
                        Operate on every enrollment in this cadence at once. */}
                    {(enrs.filter((e) => e.status === "active").length > 0) && (
                      <button
                        type="button"
                        onClick={() => void pauseAll(c, "pause")}
                        title="Pause every active enrollment in this cadence"
                        className="rounded-md border border-accent-amber/30 bg-accent-amber/5 px-2 py-1 text-[11px] text-accent-amber hover:bg-accent-amber/15"
                      >
                        Pause all
                      </button>
                    )}
                    {(enrs.filter((e) => e.status === "paused").length > 0) && (
                      <button
                        type="button"
                        onClick={() => void pauseAll(c, "resume")}
                        title="Resume every paused enrollment in this cadence"
                        className="rounded-md border border-accent-green/30 bg-accent-green/5 px-2 py-1 text-[11px] text-accent-green hover:bg-accent-green/15"
                      >
                        Resume all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void toggleActive(c)}
                      title={c.active ? "Block NEW enrollments (existing keep running)" : "Resume accepting NEW enrollments"}
                      className="rounded-md border border-bg-border bg-bg-app px-2 py-1 text-[11px] text-ink-secondary hover:bg-bg-hover"
                    >
                      {c.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteCadence(c)}
                      title="Delete cadence"
                      className="rounded-md border border-accent-red/30 bg-accent-red/5 p-1.5 text-accent-red hover:bg-accent-red/15"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded: enrollments table */}
                {isExpanded && (
                  <div className="border-t border-bg-border px-4 py-3">
                    <BulkEnrollPanel cadenceId={c.id} onEnrolled={load} />
                    {enrs.length === 0 ? (
                      <div className="py-6 text-center text-[11px] text-ink-tertiary">
                        No enrollments yet. Use the bulk-enroll above or open a buyer
                        detail page and click "Enroll in cadence".
                      </div>
                    ) : (
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-bg-border text-left text-[10px] uppercase tracking-wider text-ink-tertiary">
                            <th className="py-1.5">Buyer</th>
                            <th className="py-1.5">Status</th>
                            <th className="py-1.5">Step</th>
                            <th className="py-1.5">Next due</th>
                            <th className="py-1.5">Last outcome</th>
                            <th className="py-1.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrs.map((e) => (
                            <tr key={e.id} className="border-b border-bg-border/40 last:border-0">
                              <td className="py-1.5">
                                <div className="font-medium">{e.buyerName}</div>
                                <div className="text-[10px] text-ink-tertiary">{e.buyerCompany}</div>
                              </td>
                              <td className="py-1.5">
                                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[e.status]}`}>
                                  {e.status}
                                </span>
                              </td>
                              <td className="py-1.5 tabular-nums">
                                {e.currentStepIndex + 1}/{c.steps.length}
                              </td>
                              <td className="py-1.5 font-mono text-[10px] text-ink-tertiary">
                                {e.status === "active" ? relTime(e.nextStepDueAt) : "—"}
                              </td>
                              <td className="py-1.5 text-[10px] text-ink-tertiary">
                                {e.lastStepOutcome ?? "—"}
                              </td>
                              <td className="py-1.5 text-right">
                                <div className="inline-flex items-center gap-1">
                                  {e.status === "active" && (
                                    <button
                                      type="button"
                                      onClick={() => void patchEnrollment(e.id, "paused")}
                                      title="Pause"
                                      className="rounded-md border border-bg-border bg-bg-app p-1 text-ink-secondary hover:bg-bg-hover"
                                    >
                                      <Pause className="h-3 w-3" />
                                    </button>
                                  )}
                                  {e.status === "paused" && (
                                    <button
                                      type="button"
                                      onClick={() => void patchEnrollment(e.id, "active")}
                                      title="Resume"
                                      className="rounded-md border border-bg-border bg-bg-app p-1 text-accent-green hover:bg-bg-hover"
                                    >
                                      <Play className="h-3 w-3" />
                                    </button>
                                  )}
                                  {(e.status === "active" || e.status === "paused") && (
                                    <button
                                      type="button"
                                      onClick={() => void patchEnrollment(e.id, "stopped")}
                                      title="Stop (clears pending queue items)"
                                      className="rounded-md border border-accent-red/30 bg-accent-red/5 p-1 text-accent-red hover:bg-accent-red/15"
                                    >
                                      <Square className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  tone?: "green" | "blue";
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const toneClasses =
    tone === "green"
      ? "border-accent-green/40 bg-accent-green/5"
      : tone === "blue"
      ? "border-accent-blue/40 bg-accent-blue/5"
      : "border-bg-border bg-bg-card";
  const iconTone =
    tone === "green" ? "text-accent-green" : tone === "blue" ? "text-accent-blue" : "text-ink-tertiary";
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${toneClasses}`}>
      <Icon className={`h-4 w-4 ${iconTone}`} />
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

/** Tiny channel-icon strip rendered on the cadence header row so the
 *  operator can read the recipe at a glance: 📧 → 📞 → 💬 → 📧 */
function StepStrip({ steps }: { steps: CadenceStep[] }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const Icon = CHANNEL_ICON[s.channel];
        return (
          <div key={i} className="flex items-center gap-1">
            <div
              className="grid h-6 w-6 place-items-center rounded-md bg-bg-app"
              title={`Step ${i + 1}: ${s.channel} after ${s.delayHours}h${s.label ? ` — ${s.label}` : ""}`}
            >
              <Icon className="h-3 w-3 text-ink-secondary" />
            </div>
            {i < steps.length - 1 && (
              <span className="text-[10px] text-ink-tertiary">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Create form ────────────────────────────────────────────────────

type DraftBranch = { ifOutcome: string; gotoIndex: string };
type DraftStep = {
  channel: Channel;
  delayHours: string;       // string in form so we can validate empty
  label: string;
  subject: string;
  bodyTemplate: string;
  branches: DraftBranch[];
  maxRetries: string;       // string for empty-state
  retryDelayMinutes: string;
};

function blankStep(channel: Channel = "email"): DraftStep {
  return {
    channel,
    delayHours: "0",
    label: "",
    subject: "",
    bodyTemplate: "",
    branches: [],
    maxRetries: "0",
    retryDelayMinutes: "30",
  };
}

// ─── Cadence templates (slice 36) ────────────────────────────────────

type CadenceTemplate = {
  id: string;
  name: string;
  description: string;
  cadenceName: string;
  cadenceDescription: string;
  steps: DraftStep[];
  /** "seed" = built-in. "custom" = operator-created via
   *  POST /api/cadences/templates. Set on server-fetched entries
   *  (slice 44+); the local fallback const is "seed" only. */
  source?: "seed" | "custom";
};

/**
 * Server template shape (slice 44 API). Numeric values; we convert
 * to DraftStep on hydration so the create-form's string-typed inputs
 * still work.
 */
type ServerTemplate = {
  id: string;
  name: string;
  description: string;
  cadenceName: string;
  cadenceDescription: string;
  source: "seed" | "custom";
  createdAt?: string;
  createdBy?: string;
  steps: Array<{
    channel: Channel;
    delayHours: number;
    label?: string;
    subject?: string;
    bodyTemplate?: string;
    branches?: Array<{ ifOutcome: string; gotoIndex: number }>;
    maxRetries?: number;
    retryDelayMinutes?: number;
  }>;
};

function serverTemplateToDraft(t: ServerTemplate): CadenceTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    cadenceName: t.cadenceName,
    cadenceDescription: t.cadenceDescription,
    source: t.source,
    steps: t.steps.map((s) => ({
      channel: s.channel,
      delayHours: String(s.delayHours),
      label: s.label ?? "",
      subject: s.subject ?? "",
      bodyTemplate: s.bodyTemplate ?? "",
      branches: (s.branches ?? []).map((b) => ({
        ifOutcome: b.ifOutcome,
        gotoIndex: String(b.gotoIndex),
      })),
      maxRetries: String(s.maxRetries ?? 0),
      retryDelayMinutes: String(s.retryDelayMinutes ?? 30),
    })),
  };
}

// Local fallback gallery -- used only when /api/cadences/templates
// fails or hasn't returned yet. Mirrors the slice 44 SEED_TEMPLATES
// content so the operator always sees something even if the API
// degrades.
const CADENCE_TEMPLATES: CadenceTemplate[] = [
  {
    id: "b2b-3-touch",
    name: "B2B intro · 3-touch",
    description: "Email today → call in 3 days → SMS nudge in 5. Conservative.",
    cadenceName: "B2B intro · 3-touch",
    cadenceDescription: "Standard B2B intro sequence. First-touch email, follow-up call, then SMS nudge.",
    steps: [
      {
        channel: "email", delayHours: "0", label: "Day 1 — intro",
        subject: "Quick intro for {{company}}",
        bodyTemplate:
          "Hi {{name}},\n\nNoticed {{company}} has been growing in your category. We've got a product mix that could fit -- happy to send a one-pager or hop on a 15-min call.\n\nWhich works?",
        branches: [{ ifOutcome: "replied", gotoIndex: "-1" }],
        maxRetries: "2", retryDelayMinutes: "60",
      },
      {
        channel: "call", delayHours: "48", label: "Day 3 — call",
        subject: "", bodyTemplate: "",
        branches: [{ ifOutcome: "voicemail", gotoIndex: "2" }, { ifOutcome: "wrong-number", gotoIndex: "-1" }],
        maxRetries: "0", retryDelayMinutes: "30",
      },
      {
        channel: "sms", delayHours: "48", label: "Day 5 — SMS nudge",
        subject: "",
        bodyTemplate: "Hey {{name}} — left you a voicemail Tue. Easier to text? Quick yes/no on whether to send the one-pager.",
        branches: [],
        maxRetries: "1", retryDelayMinutes: "30",
      },
    ],
  },
  {
    id: "supplier-revival",
    name: "Supplier revival · 4-touch",
    description: "Bring back lapsed suppliers. Personalized + escalation.",
    cadenceName: "Supplier revival",
    cadenceDescription: "Re-engage suppliers who haven't shipped in 90+ days. Soft -> hard escalation.",
    steps: [
      {
        channel: "email", delayHours: "0", label: "Day 1 — friendly check-in",
        subject: "Long time, {{name}} — anything new at {{company}}?",
        bodyTemplate:
          "Hi {{name}},\n\nIt's been a while since we worked together. Curious what's been happening at {{company}} -- new product lines? Capacity changes?\n\nWe've got a couple of buyers asking about your category lately. Worth a 15-min catch-up?",
        branches: [{ ifOutcome: "replied", gotoIndex: "-1" }],
        maxRetries: "2", retryDelayMinutes: "60",
      },
      {
        channel: "email", delayHours: "120", label: "Day 6 — concrete offer",
        subject: "Two buyers in your category looking right now",
        bodyTemplate:
          "Hi {{name}},\n\nDidn't hear back -- thought I'd send something concrete. Two of our active buyers are sourcing in your category this month. If you've got capacity I can intro you.\n\nReply with a yes and I'll send their briefs.",
        branches: [{ ifOutcome: "replied", gotoIndex: "-1" }],
        maxRetries: "2", retryDelayMinutes: "60",
      },
      {
        channel: "call", delayHours: "120", label: "Day 11 — call",
        subject: "", bodyTemplate: "",
        branches: [{ ifOutcome: "voicemail", gotoIndex: "3" }],
        maxRetries: "0", retryDelayMinutes: "30",
      },
      {
        channel: "sms", delayHours: "48", label: "Day 13 — final nudge",
        subject: "",
        bodyTemplate: "Hey {{name}} -- quick text. Still interested in working with {{company}} on AVYN buyers? Yes/no is plenty.",
        branches: [],
        maxRetries: "1", retryDelayMinutes: "30",
      },
    ],
  },
  {
    id: "buyer-onboarding",
    name: "Buyer onboarding · 5-touch",
    description: "Activate new buyers in their first 14 days.",
    cadenceName: "Buyer onboarding",
    cadenceDescription: "Help fresh buyers complete their first transaction. Day 1 welcome, day 7 check-in, day 14 escalation.",
    steps: [
      {
        channel: "email", delayHours: "0", label: "Day 1 — welcome",
        subject: "Welcome to AVYN, {{name}}",
        bodyTemplate:
          "Hi {{name}},\n\nWelcome aboard. {{company}} is now in our verified buyer network.\n\nThree quick wins to get you to your first transaction:\n1. Set your sourcing preferences -- /onboarding/buyer\n2. Browse trending products in your industries -- /products\n3. Use the marketplace search to find verified suppliers -- /marketplace\n\nQuestions? Just reply.",
        branches: [],
        maxRetries: "2", retryDelayMinutes: "60",
      },
      {
        channel: "email", delayHours: "72", label: "Day 4 — first product picks",
        subject: "3 products trending in your industry this week",
        bodyTemplate:
          "Hi {{name}},\n\nBased on your industry preferences, three products are trending hard right now. I picked three suppliers worth a look:\n[product 1] -- [supplier]\n[product 2] -- [supplier]\n[product 3] -- [supplier]\n\nReply 'send' if you want me to make warm intros.",
        branches: [{ ifOutcome: "replied", gotoIndex: "-1" }],
        maxRetries: "2", retryDelayMinutes: "60",
      },
      {
        channel: "call", delayHours: "168", label: "Day 11 — onboarding call",
        subject: "", bodyTemplate: "",
        branches: [{ ifOutcome: "voicemail", gotoIndex: "3" }],
        maxRetries: "0", retryDelayMinutes: "30",
      },
      {
        channel: "sms", delayHours: "48", label: "Day 13 — quick check",
        subject: "",
        bodyTemplate: "Hi {{name}} -- {{company}} hasn't placed a first order yet. Anything blocking? Reply or grab 15 min: [calendly]",
        branches: [],
        maxRetries: "1", retryDelayMinutes: "30",
      },
      {
        channel: "email", delayHours: "72", label: "Day 16 — final",
        subject: "Still looking for the right fit?",
        bodyTemplate:
          "Hi {{name}},\n\nLast email from me on this. If {{company}} is still figuring out the right supplier match, here's the easiest next step: reply with the SKU or category, I'll have a verified supplier ready to talk by tomorrow.\n\nIf timing isn't right, no worries -- archive this and we'll resurface trending products to you monthly.",
        branches: [],
        maxRetries: "2", retryDelayMinutes: "60",
      },
    ],
  },
];

function CreateCadenceForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([
    {
      channel: "email", delayHours: "0", label: "Day 1 — intro",
      subject: "Quick intro for {{company}}", bodyTemplate: "",
      branches: [], maxRetries: "0", retryDelayMinutes: "30",
    },
    {
      channel: "call", delayHours: "48", label: "Day 3 — call",
      subject: "", bodyTemplate: "",
      branches: [], maxRetries: "0", retryDelayMinutes: "30",
    },
    {
      channel: "sms", delayHours: "48", label: "Day 5 — SMS nudge",
      subject: "", bodyTemplate: "Hey {{name}} — quick follow-up?",
      branches: [], maxRetries: "0", retryDelayMinutes: "30",
    },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Slice 48: hydrate templates from /api/cadences/templates so
  // operator-created customs (slice 44 POST) appear alongside seeds.
  // Falls back to the local CADENCE_TEMPLATES const on fetch failure
  // so the gallery never goes blank.
  const [templates, setTemplates] = useState<CadenceTemplate[]>(CADENCE_TEMPLATES);
  // Slice 64: paste-to-import. Opens an inline panel with a textarea
  // for the JSON envelope produced by /api/cadences/templates/[id]/export.
  // Server-side validation is the source of truth -- this UI only
  // surfaces the error string and (on success) the new template id.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // Slice 74: gallery filter -- once you have 8+ customs the grid
  // gets unwieldy. Matches against name + description + cadenceName
  // (case-insensitive), so "supplier" finds both "Supplier revival"
  // and a custom titled "Bring back supplier".
  const [templateFilter, setTemplateFilter] = useState("");
  const filteredTemplates = (() => {
    const q = templateFilter.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      [t.name, t.description, t.cadenceName].some((f) =>
        f?.toLowerCase().includes(q),
      ),
    );
  })();

  async function submitImport() {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError("Not valid JSON. Paste the contents of a .cadence-template.json file.");
      return;
    }
    setImportBusy(true);
    try {
      const r = await fetch("/api/cadences/templates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `Import failed (${r.status})`);
      // Slice 64 ships single-template ({ template }); slice 70 adds
      // bulk-bundle ({ templates: [...] }) for backup restores. Handle
      // both so the operator can paste either envelope into the same box.
      if (d.template) {
        const draft = serverTemplateToDraft(d.template as ServerTemplate);
        setTemplates((prev) => [...prev, draft]);
      } else if (Array.isArray(d.templates)) {
        const drafts = (d.templates as ServerTemplate[]).map(serverTemplateToDraft);
        setTemplates((prev) => [...prev, ...drafts]);
      }
      setImportOpen(false);
      setImportText("");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cadences/templates", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.templates) return;
        const hydrated = (d.templates as ServerTemplate[]).map(serverTemplateToDraft);
        if (hydrated.length > 0) setTemplates(hydrated);
      })
      .catch(() => {
        // Keep the local fallback when the API is unreachable
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyTemplate(t: CadenceTemplate) {
    setName(t.cadenceName);
    setDescription(t.cadenceDescription);
    // Deep-clone the steps so the template stays immutable across applies
    setSteps(t.steps.map((s) => ({ ...s, branches: s.branches.map((b) => ({ ...b })) })));
  }

  function updateStep(i: number, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, blankStep()]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (steps.length === 0) {
      setError("At least one step is required");
      return;
    }
    // Coerce + validate
    const payloadSteps = steps.map((s, i) => {
      const delay = Number.parseFloat(s.delayHours || "0");
      if (Number.isNaN(delay) || delay < 0) {
        throw new Error(`Step ${i + 1}: delayHours must be a non-negative number`);
      }
      const maxRetries = Number.parseInt(s.maxRetries || "0", 10);
      const retryDelayMinutes = Number.parseInt(s.retryDelayMinutes || "30", 10);
      const branches = s.branches
        .filter((b) => b.ifOutcome.trim() !== "" && b.gotoIndex.trim() !== "")
        .map((b, bi) => {
          const idx = Number.parseInt(b.gotoIndex, 10);
          if (Number.isNaN(idx) || idx < -1 || idx >= steps.length) {
            throw new Error(`Step ${i + 1} branch ${bi + 1}: gotoIndex must be -1 (stop) or 0..${steps.length - 1}`);
          }
          return { ifOutcome: b.ifOutcome.trim(), gotoIndex: idx };
        });
      return {
        channel: s.channel,
        delayHours: delay,
        label: s.label.trim() || undefined,
        subject: s.subject.trim() || undefined,
        bodyTemplate: s.bodyTemplate.trim() || undefined,
        branches: branches.length > 0 ? branches : undefined,
        maxRetries: maxRetries > 0 ? maxRetries : undefined,
        retryDelayMinutes: maxRetries > 0 ? retryDelayMinutes : undefined,
      };
    });

    setSubmitting(true);
    try {
      const r = await fetch("/api/cadences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          steps: payloadSteps,
          active: true,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Create failed (${r.status})`);
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-accent-blue/40 bg-accent-blue/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">New cadence</h2>
        <button onClick={onClose} className="text-ink-tertiary hover:text-ink-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Slice 36: template gallery -- one-click pre-fill of name +
          description + steps. Operator can edit anything afterwards.
          Slice 64: Import button opens a paste-JSON panel that hits
          /api/cadences/templates/import (envelope from slice 61). */}
      <div className="mb-3 rounded-md border border-bg-border bg-bg-card/40 p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Start from a template
          </div>
          <div className="flex items-center gap-1.5">
            {/* Slice 70: bulk backup of every custom template -- one
                file the operator can keep offline and re-import whole. */}
            {templates.some((t) => t.source === "custom") && (
              <a
                href="/api/cadences/templates/export-all"
                download
                className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-app px-2 py-0.5 text-[10px] font-semibold text-ink-secondary hover:bg-bg-hover"
                title="Download a bundle of every custom template"
              >
                <Download className="h-3 w-3" /> Export all
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setImportError(null);
                setImportOpen((v) => !v);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-app px-2 py-0.5 text-[10px] font-semibold text-ink-secondary hover:bg-bg-hover"
              title="Import a template (single or bundle) from a previously-exported JSON file"
            >
              <Upload className="h-3 w-3" /> Import
            </button>
          </div>
        </div>
        {importOpen && (
          <div className="mb-2 rounded-md border border-accent-blue/30 bg-accent-blue/5 p-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent-blue">
              Paste exported template JSON
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`{\n  "format": "avyn-cadence-template/v1",\n  "exportedAt": "...",\n  "template": { "name": "...", "steps": [...] }\n}`}
              rows={6}
              className="w-full rounded-md border border-bg-border bg-bg-app p-2 font-mono text-[10px] text-ink-primary placeholder:text-ink-tertiary focus:border-accent-blue focus:outline-none"
            />
            {importError && (
              <div className="mt-1 rounded-md border border-accent-red/30 bg-accent-red/5 px-2 py-1 text-[10px] text-accent-red">
                {importError}
              </div>
            )}
            <div className="mt-2 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setImportOpen(false);
                  setImportText("");
                  setImportError(null);
                }}
                className="rounded-md border border-bg-border bg-bg-app px-2 py-1 text-[10px] text-ink-secondary hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitImport}
                disabled={importBusy || !importText.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-accent-blue px-2 py-1 text-[10px] font-semibold text-white hover:bg-accent-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Import as new
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-ink-tertiary">
              A fresh id is assigned -- imports never overwrite existing templates.
            </p>
          </div>
        )}
        {/* Slice 74: filter input -- only shows once the library is
            big enough to need it (>= 6 templates), so a fresh
            workspace with 3 seeds doesn't see clutter. */}
        {templates.length >= 6 && (
          <div className="mb-1.5 flex items-center gap-2">
            <input
              type="text"
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              placeholder={`Filter ${templates.length} templates…`}
              className="h-7 flex-1 rounded-md border border-bg-border bg-bg-app px-2 text-[11px] placeholder:text-ink-tertiary focus:border-accent-blue focus:outline-none"
            />
            {templateFilter && (
              <span className="text-[10px] text-ink-tertiary">
                {filteredTemplates.length} match{filteredTemplates.length === 1 ? "" : "es"}
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {filteredTemplates.length === 0 && templateFilter && (
            <div className="col-span-full rounded-md border border-dashed border-bg-border px-2 py-3 text-center text-[11px] text-ink-tertiary">
              No templates match &ldquo;{templateFilter}&rdquo;
            </div>
          )}
          {filteredTemplates.map((t) => (
            <div
              key={t.id}
              className="group relative rounded-md border border-bg-border bg-bg-app text-left text-[11px] transition-colors hover:border-accent-blue/50 hover:bg-bg-hover"
            >
              <button
                type="button"
                onClick={() => applyTemplate(t)}
                className="block w-full px-2.5 py-1.5 text-left"
              >
                <div className="flex items-center gap-1.5 pr-5">
                  <span className="font-semibold">{t.name}</span>
                  {t.source === "custom" && (
                    <span className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-1 py-0 text-[8px] font-semibold uppercase tracking-wider text-accent-blue">
                      custom
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-tertiary">{t.description}</div>
              </button>
              {/* Slice 65: export download. Works for both seed +
                  custom templates -- operator can use a seed as a
                  starting point and share their tweaks. The export
                  endpoint enforces outreach:read which the gallery
                  already requires to render.
                  Slice 71: customs also get a rename pencil; seeds
                  don't (they're immutable). Both icons sit to the
                  LEFT of the delete X (right-6 / right-11 stacking). */}
              <a
                href={`/api/cadences/templates/${t.id}/export`}
                onClick={(e) => e.stopPropagation()}
                className={`absolute top-1 ${t.source === "custom" ? "right-11" : "right-1"} rounded p-0.5 text-ink-tertiary opacity-0 transition-opacity hover:bg-accent-blue/15 hover:text-accent-blue group-hover:opacity-100`}
                title="Download template JSON"
                aria-label="Export template"
                download
              >
                <Download className="h-3 w-3" />
              </a>
              {t.source === "custom" && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const nextName = window.prompt(
                      `Rename custom template:`,
                      t.name,
                    );
                    if (nextName === null) return; // cancelled
                    const trimmed = nextName.trim();
                    if (!trimmed || trimmed === t.name) return;
                    try {
                      const r = await fetch(`/api/cadences/templates/${t.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ name: trimmed }),
                      });
                      const d = await r.json().catch(() => ({}));
                      if (!r.ok) throw new Error(d.error ?? `Rename failed (${r.status})`);
                      if (d.template) {
                        const draft = serverTemplateToDraft(d.template as ServerTemplate);
                        setTemplates((prev) => prev.map((x) => (x.id === t.id ? draft : x)));
                      }
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "Rename failed");
                    }
                  }}
                  className="absolute right-6 top-1 rounded p-0.5 text-ink-tertiary opacity-0 transition-opacity hover:bg-accent-amber/15 hover:text-accent-amber group-hover:opacity-100"
                  title="Rename this custom template"
                  aria-label="Rename template"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {/* Slice 56: delete button for custom templates only.
                  Seed templates can't be removed (the API rejects). */}
              {t.source === "custom" && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm(`Delete custom template "${t.name}"?`)) return;
                    try {
                      const r = await fetch(`/api/cadences/templates/${t.id}`, {
                        method: "DELETE",
                        credentials: "include",
                      });
                      if (!r.ok) {
                        const d = await r.json().catch(() => ({}));
                        throw new Error(d.error ?? `Delete failed (${r.status})`);
                      }
                      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "Delete failed");
                    }
                  }}
                  className="absolute right-1 top-1 rounded p-0.5 text-ink-tertiary opacity-0 transition-opacity hover:bg-accent-red/15 hover:text-accent-red group-hover:opacity-100"
                  title="Delete this custom template"
                  aria-label="Delete template"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "B2B intro · 3-touch"'
              className="mt-1 h-8 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
              maxLength={120}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note for teammates"
              className="mt-1 h-8 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
              maxLength={500}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Steps · {steps.length}
            </label>
            <button
              type="button"
              onClick={addStep}
              className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-app px-2 py-0.5 text-[11px] text-ink-secondary hover:bg-bg-hover"
            >
              <Plus className="h-3 w-3" /> Add step
            </button>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => {
              const Icon = CHANNEL_ICON[s.channel];
              return (
                <div key={i} className="rounded-md border border-bg-border bg-bg-card p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-bg-app text-ink-secondary">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-mono text-[11px] text-ink-tertiary">#{i + 1}</span>
                    <select
                      value={s.channel}
                      onChange={(e) => updateStep(i, { channel: e.target.value as Channel })}
                      className="h-7 rounded-md border border-bg-border bg-bg-app px-1 text-[12px]"
                    >
                      <option value="email">email</option>
                      <option value="call">call</option>
                      <option value="sms">sms</option>
                    </select>
                    <label className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                      Delay
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={s.delayHours}
                      onChange={(e) => updateStep(i, { delayHours: e.target.value })}
                      className="h-7 w-20 rounded-md border border-bg-border bg-bg-app px-1.5 text-right text-[12px] tabular-nums"
                    />
                    <span className="text-[10px] text-ink-tertiary">hours from prev</span>
                    <input
                      type="text"
                      value={s.label}
                      onChange={(e) => updateStep(i, { label: e.target.value })}
                      placeholder="Label (optional)"
                      className="h-7 flex-1 min-w-[140px] rounded-md border border-bg-border bg-bg-app px-2 text-[12px]"
                      maxLength={80}
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="rounded-md border border-accent-red/30 bg-accent-red/5 p-1 text-accent-red hover:bg-accent-red/15"
                      title="Remove step"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {s.channel === "email" && (
                    <input
                      type="text"
                      value={s.subject}
                      onChange={(e) => updateStep(i, { subject: e.target.value })}
                      placeholder="Email subject — supports {{name}} {{company}}"
                      className="mt-2 h-7 w-full rounded-md border border-bg-border bg-bg-app px-2 text-[12px]"
                    />
                  )}
                  {(s.channel === "email" || s.channel === "sms") && (
                    <>
                      <textarea
                        value={s.bodyTemplate}
                        onChange={(e) => updateStep(i, { bodyTemplate: e.target.value })}
                        placeholder={
                          s.channel === "email"
                            ? "Email body — supports {{name}} {{company}}"
                            : "SMS body — keep it short. Supports {{name}} {{company}}"
                        }
                        rows={s.channel === "email" ? 4 : 2}
                        className="mt-2 w-full rounded-md border border-bg-border bg-bg-app px-2 py-1.5 text-[12px]"
                      />
                      {/* Slice 29: SMS character counter + GSM validation.
                          GSM-7 is the basic SMS encoding (160 chars per
                          segment). Non-GSM characters (emoji, smart quotes,
                          most accents) push the message into UCS-2 which
                          caps each segment at 70 chars and ~2x the cost. */}
                      {s.channel === "sms" && <SmsCounter body={s.bodyTemplate} />}
                    </>
                  )}

                  {/* Slice 27 + 59: live merge-tag preview. Renders
                      every supported merge tag with sample values so
                      the operator catches typos + sees what gets
                      substituted at send time. Slice 59 adds the
                      freight_* family (lane / cheapest / mode /
                      transit) for cadences that reference shipping. */}
                  {(s.channel === "email" || s.channel === "sms") && s.bodyTemplate.trim() && (
                    <div className="mt-2 rounded-md border border-accent-blue/20 bg-accent-blue/5 px-2.5 py-2">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent-blue">
                        <span>Preview · sample values substituted</span>
                        <details className="font-normal normal-case tracking-normal">
                          <summary className="cursor-pointer text-accent-blue/70 hover:text-accent-blue">
                            Tags
                          </summary>
                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-ink-secondary">
                            <code>{`{{name}}`}</code><span>Sarah</span>
                            <code>{`{{company}}`}</code><span>FitLife Co.</span>
                            <code>{`{{freight_lane}}`}</code><span>CN -&gt; US-CA</span>
                            <code>{`{{freight_cheapest}}`}</code><span>$4,200</span>
                            <code>{`{{freight_mode}}`}</code><span>ocean-fcl</span>
                            <code>{`{{freight_transit}}`}</code><span>21-45 days</span>
                          </div>
                        </details>
                      </div>
                      {s.channel === "email" && s.subject.trim() && (
                        <div className="mb-1 text-[11px] font-semibold text-ink-primary">
                          Subject: {applyPreviewTags(s.subject)}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap text-[11px] text-ink-secondary">
                        {applyPreviewTags(s.bodyTemplate)}
                      </div>
                    </div>
                  )}

                  {s.channel === "call" && (
                    <p className="mt-2 text-[11px] text-ink-tertiary">
                      Call steps are operator-led — the runner schedules a queue item;
                      you click through to dial. Subject/body don't apply.
                    </p>
                  )}

                  {/* Slice 23: branching + retry policy controls */}
                  <details className="mt-3 rounded-md border border-bg-border bg-bg-app/40 px-2.5 py-2">
                    <summary className="cursor-pointer text-[11px] font-medium text-ink-secondary hover:text-ink-primary">
                      Advanced — branching + retry
                    </summary>
                    <div className="mt-2 space-y-3">
                      {/* Branching */}
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                          Outcome branches
                        </div>
                        <p className="mb-1.5 text-[10px] text-ink-tertiary">
                          When the previous step's outcome matches, jump to a different step
                          instead of advancing. Use index <span className="font-mono">-1</span> to
                          stop the cadence (e.g. "if buyer replied, end").
                        </p>
                        {s.branches.map((b, bi) => (
                          <div key={bi} className="mb-1 flex items-center gap-1.5">
                            <span className="text-[10px] text-ink-tertiary">if outcome =</span>
                            <input
                              type="text"
                              value={b.ifOutcome}
                              onChange={(e) =>
                                updateStep(i, {
                                  branches: s.branches.map((bb, bbi) =>
                                    bbi === bi ? { ...bb, ifOutcome: e.target.value } : bb,
                                  ),
                                })
                              }
                              placeholder="voicemail"
                              className="h-6 w-32 rounded border border-bg-border bg-bg-card px-1.5 text-[11px]"
                            />
                            <span className="text-[10px] text-ink-tertiary">goto step</span>
                            <input
                              type="number"
                              value={b.gotoIndex}
                              onChange={(e) =>
                                updateStep(i, {
                                  branches: s.branches.map((bb, bbi) =>
                                    bbi === bi ? { ...bb, gotoIndex: e.target.value } : bb,
                                  ),
                                })
                              }
                              placeholder="0"
                              className="h-6 w-14 rounded border border-bg-border bg-bg-card px-1.5 text-right text-[11px] tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateStep(i, {
                                  branches: s.branches.filter((_, bbi) => bbi !== bi),
                                })
                              }
                              className="rounded border border-accent-red/30 bg-accent-red/5 p-0.5 text-accent-red hover:bg-accent-red/15"
                              aria-label="Remove branch"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            updateStep(i, {
                              branches: [...s.branches, { ifOutcome: "", gotoIndex: "" }],
                            })
                          }
                          className="inline-flex items-center gap-1 rounded border border-bg-border bg-bg-app px-1.5 py-0.5 text-[10px] text-ink-secondary hover:bg-bg-hover"
                        >
                          <Plus className="h-2.5 w-2.5" /> Add branch
                        </button>
                      </div>

                      {/* Retry policy */}
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                          Retry on transient failure
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-ink-tertiary">max retries</span>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={s.maxRetries}
                            onChange={(e) => updateStep(i, { maxRetries: e.target.value })}
                            className="h-6 w-12 rounded border border-bg-border bg-bg-card px-1.5 text-right text-[11px] tabular-nums"
                          />
                          <span className="text-[10px] text-ink-tertiary">delay (min)</span>
                          <input
                            type="number"
                            min="1"
                            max="1440"
                            value={s.retryDelayMinutes}
                            onChange={(e) => updateStep(i, { retryDelayMinutes: e.target.value })}
                            className="h-6 w-14 rounded border border-bg-border bg-bg-card px-1.5 text-right text-[11px] tabular-nums"
                          />
                          <span className="text-[10px] text-ink-tertiary">
                            (0 = no retries; rate-limit + timeout + 5xx auto-retry)
                          </span>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover"
          >
            Cancel
          </button>
          {/* Slice 55: save the in-progress cadence definition as a
              reusable template via the slice 44 API. Creates the
              template only -- doesn't also create the cadence (that's
              what "Create cadence" does). */}
          <SaveAsTemplateButton
            name={name}
            description={description}
            steps={steps}
            disabled={submitting}
            onSaved={() => setTemplates((prev) => prev /* fetch will refresh on next mount */)}
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-md bg-accent-blue px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            Create cadence
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SaveAsTemplateButton (slice 55) ────────────────────────────────

function SaveAsTemplateButton({
  name,
  description,
  steps,
  disabled,
  onSaved,
}: {
  name: string;
  description: string;
  steps: DraftStep[];
  disabled?: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) {
      alert("Set a cadence name first -- it doubles as the template name.");
      return;
    }
    if (steps.length === 0) {
      alert("Add at least one step before saving as template.");
      return;
    }
    const tplName = window.prompt(
      "Template name (shown in the gallery):",
      `${name.trim()} template`,
    );
    if (!tplName?.trim()) return;
    const tplDescription = window.prompt(
      "Short description (1 sentence, shown under the name):",
      description.trim() || `Custom cadence created ${new Date().toLocaleDateString()}`,
    );
    if (tplDescription === null) return;
    setBusy(true);
    try {
      // Coerce DraftStep -> server step shape (numeric values, only
      // include branches/retries when meaningful)
      const serverSteps = steps.map((s) => {
        const delay = Number.parseFloat(s.delayHours || "0");
        const maxRetries = Number.parseInt(s.maxRetries || "0", 10);
        const retryDelayMinutes = Number.parseInt(s.retryDelayMinutes || "30", 10);
        const branches = s.branches
          .filter((b) => b.ifOutcome.trim() && b.gotoIndex.trim())
          .map((b) => ({
            ifOutcome: b.ifOutcome.trim(),
            gotoIndex: Number.parseInt(b.gotoIndex, 10),
          }));
        return {
          channel: s.channel,
          delayHours: Number.isFinite(delay) && delay >= 0 ? delay : 0,
          label: s.label.trim() || undefined,
          subject: s.subject.trim() || undefined,
          bodyTemplate: s.bodyTemplate.trim() || undefined,
          branches: branches.length > 0 ? branches : undefined,
          maxRetries: maxRetries > 0 ? maxRetries : undefined,
          retryDelayMinutes: maxRetries > 0 ? retryDelayMinutes : undefined,
        };
      });
      const r = await fetch("/api/cadences/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: tplName.trim(),
          description: tplDescription.trim(),
          cadenceName: name.trim(),
          cadenceDescription: description.trim(),
          steps: serverSteps,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Save failed (${r.status})`);
      alert(`Saved "${tplName.trim()}" -- it'll appear in the gallery on next form open.`);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void save()}
      disabled={busy || disabled}
      className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
      title="Save the current step recipe as a reusable template"
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      Save as template
    </button>
  );
}

// ─── Bulk-enroll panel (slice 24) ────────────────────────────────────

/**
 * CSV-paste bulk enrollment for a single cadence. Each line is a
 * buyer in the format:
 *   buyerId,buyerName,buyerCompany[,email][,phone]
 *
 * Comma-quoted fields aren't supported -- this is a paste-from-spreadsheet
 * shortcut, not a full RFC 4180 parser. Operator can also paste from
 * /buyers CSV export which uses the same column order.
 */
function BulkEnrollPanel({ cadenceId, onEnrolled }: { cadenceId: string; onEnrolled: () => void }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    tone: "ok" | "err";
    text: string;
    failures: Array<{ row: number; reason: string }>;
  } | null>(null);

  function parseCsv(text: string): Array<{
    buyerId: string;
    buyerName: string;
    buyerCompany: string;
    buyerEmail?: string;
    buyerPhone?: string;
  }> {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("buyerId,"))
      .map((line) => {
        const cols = line.split(",").map((c) => c.trim());
        return {
          buyerId: cols[0] ?? "",
          buyerName: cols[1] ?? "",
          buyerCompany: cols[2] ?? "",
          buyerEmail: cols[3] || undefined,
          buyerPhone: cols[4] || undefined,
        };
      });
  }

  async function submit() {
    const buyers = parseCsv(csv);
    if (buyers.length === 0) {
      setResult({ tone: "err", text: "No rows parsed", failures: [] });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch(`/api/cadences/${cadenceId}/enroll/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ buyers }),
      });
      const d = await r.json();
      if (!r.ok && r.status !== 207) {
        throw new Error(d.error ?? `Bulk enroll failed (${r.status})`);
      }
      const failures = (d.results ?? [])
        .filter((rr: { ok: boolean; skipped?: boolean }) => !rr.ok && !rr.skipped)
        .map((rr: { row: number; reason: string }) => ({ row: rr.row, reason: rr.reason }));
      setResult({
        tone: d.summary?.failed === 0 ? "ok" : "err",
        text: `${d.summary?.enrolled ?? 0} enrolled, ${d.summary?.skipped ?? 0} skipped (already enrolled), ${d.summary?.failed ?? 0} failed of ${d.summary?.total ?? buyers.length}`,
        failures,
      });
      if ((d.summary?.enrolled ?? 0) > 0) {
        setCsv("");
        onEnrolled();
      }
    } catch (e) {
      setResult({
        tone: "err",
        text: e instanceof Error ? e.message : "Bulk enroll failed",
        failures: [],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-md border border-bg-border bg-bg-app/40 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-[11px] font-medium text-ink-secondary hover:text-ink-primary"
      >
        <span>Bulk enroll via CSV</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[10px] text-ink-tertiary">
            One buyer per line: <span className="font-mono">buyerId,buyerName,buyerCompany,email,phone</span>{" "}
            (email + phone optional). Header line + lines starting with <span className="font-mono">#</span> are
            skipped. Max 500 per call.
          </p>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            placeholder="biz_abc123,Sarah Lee,FitLife Co.,sarah@fitlife.com,+15551234567"
            className="w-full rounded-md border border-bg-border bg-bg-card px-2 py-1.5 font-mono text-[11px]"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-ink-tertiary">
              {csv.trim() ? `${csv.split(/\r?\n/).filter((l) => l.trim()).length} lines` : ""}
            </span>
            <button
              type="button"
              disabled={busy || !csv.trim()}
              onClick={() => void submit()}
              className="inline-flex items-center gap-1 rounded-md bg-accent-blue px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              Enroll all
            </button>
          </div>
          {result && (
            <div
              className={`rounded-md border px-2 py-1.5 text-[11px] ${
                result.tone === "ok"
                  ? "border-accent-green/30 bg-accent-green/5 text-accent-green"
                  : "border-accent-red/30 bg-accent-red/5 text-accent-red"
              }`}
            >
              <div>{result.text}</div>
              {result.failures.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {result.failures.slice(0, 10).map((f) => (
                    <li key={f.row} className="text-[10px]">
                      row {f.row + 1}: {f.reason}
                    </li>
                  ))}
                  {result.failures.length > 10 && (
                    <li className="text-[10px] text-ink-tertiary">
                      + {result.failures.length - 10} more failures
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SMS counter (slice 29) ────────────────────────────────────────

/** GSM-7 default + extension table. Anything outside this set forces
 *  the message into UCS-2 encoding (70-char segments instead of 160). */
const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""),
);
const GSM_EXTENDED = new Set("\f^{}\[~]|€".split(""));

function isGsm7(body: string): boolean {
  for (const ch of body) {
    if (!GSM_BASIC.has(ch) && !GSM_EXTENDED.has(ch)) return false;
  }
  return true;
}

function countSmsSegments(body: string): { length: number; segments: number; encoding: "GSM-7" | "UCS-2"; perSegment: number } {
  const isGsm = isGsm7(body);
  // GSM extended chars count as 2 (each takes an escape sequence).
  let length = 0;
  if (isGsm) {
    for (const ch of body) length += GSM_EXTENDED.has(ch) ? 2 : 1;
  } else {
    // UCS-2 counts each code point as 2 bytes (1 char in JS string for BMP).
    length = [...body].length;
  }
  // Single segment caps: 160 GSM, 70 UCS-2.
  // Multi-segment caps: 153 GSM, 67 UCS-2 (UDH overhead).
  const single = isGsm ? 160 : 70;
  const multi = isGsm ? 153 : 67;
  const segments =
    length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  const perSegment = segments <= 1 ? single : multi;
  return { length, segments, encoding: isGsm ? "GSM-7" : "UCS-2", perSegment };
}

function SmsCounter({ body }: { body: string }) {
  // Use the merge-tagged body for the count -- otherwise the operator
  // sees an artificially low count when the template has placeholders
  // that expand at send time.
  const merged = body
    .replace(/\{\{\s*name\s*\}\}/gi, "Sarah")
    .replace(/\{\{\s*company\s*\}\}/gi, "FitLife Co.");
  const m = countSmsSegments(merged);
  const tone =
    m.segments >= 3 ? "text-accent-red" : m.segments === 2 ? "text-accent-amber" : "text-ink-tertiary";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
      <span className={`font-mono ${tone}`}>
        {m.length} chars · {m.segments} segment{m.segments === 1 ? "" : "s"} · {m.encoding}
      </span>
      {m.encoding === "UCS-2" && (
        <span className="rounded border border-accent-amber/40 bg-accent-amber/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent-amber">
          Non-GSM detected — emoji/smart-quote/accent doubles cost
        </span>
      )}
      {m.segments > 1 && (
        <span className="text-ink-tertiary">
          ({m.length}/{m.perSegment} per segment)
        </span>
      )}
    </div>
  );
}
