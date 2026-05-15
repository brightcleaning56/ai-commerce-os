"use client";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
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
                    <button
                      type="button"
                      onClick={() => void toggleActive(c)}
                      title={c.active ? "Pause new enrollments" : "Resume accepting enrollments"}
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
                    {enrs.length === 0 ? (
                      <div className="py-6 text-center text-[11px] text-ink-tertiary">
                        No enrollments yet. Open a buyer detail page and click
                        "Enroll in cadence" to add one (slice 5.5 ships the
                        button; for now POST <span className="font-mono">/api/cadences/{c.id}/enroll</span>).
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
