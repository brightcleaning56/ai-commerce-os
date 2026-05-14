/**
 * Cadences — sequenced multi-touch outreach engine (queue slice 3).
 *
 * A Cadence is a static recipe ("Day 1: email · Day 3: call · Day 5: SMS
 * · Day 7: final email"). An Enrollment links one buyer to one cadence
 * and tracks which step they're on + when the next step fires. The
 * cron tick walks active enrollments and creates persistent QueueItems
 * for steps whose dueAt has passed — those land on /queue alongside
 * the derived items from slice 1.
 *
 * Important design point: the runner SCHEDULES (creates queue items),
 * it does NOT auto-SEND. The operator sees the scheduled email/call/SMS
 * on /queue and clicks send. That's intentional for the first prod test
 * — a misconfigured cadence shouldn't blast 50 buyers without an
 * operator-visible step. Slice 4 will add an opt-in "auto-send" flag
 * per cadence step for the operator who's confident in their templates.
 *
 * Branching: each step can declare `branches` like
 *   `{ ifOutcome: "voicemail", gotoIndex: 4 }`
 * which means "if the previous step (a phone call) ended with outcome
 * 'voicemail', skip to step 4 instead of advancing to step+1." Lets
 * the operator design "if no answer → SMS instead of next email."
 *
 * Status flow (Enrollment):
 *   active     ← created via enroll
 *   completed  ← all steps done
 *   stopped    ← operator stopped
 *   paused     ← operator paused; cron skips, doesn't advance
 *
 * Node-only.
 */
import crypto from "node:crypto";
import { getBackend } from "./store";
import type { QueueChannel, QueueStatus } from "./queue";

const CADENCES_FILE = "cadences.json";
const ENROLLMENTS_FILE = "cadence-enrollments.json";
const CADENCE_QUEUE_ITEMS_FILE = "cadence-queue-items.json";
const MAX_CADENCES = 200;
const MAX_ENROLLMENTS = 5000;
const MAX_QUEUE_ITEMS = 10_000;

// ─── Types ──────────────────────────────────────────────────────────

export type CadenceStep = {
  /** Channel the step uses. Maps to the queue's channel. */
  channel: QueueChannel;
  /** Hours to wait from the previous step's completion (or from
   *  enrollment time, for step 0) before this step becomes due. */
  delayHours: number;
  /** Optional human label for the operator ("Day 3 call", "Final email"). */
  label?: string;
  /** Email subject line (channel=email only). Supports {{name}}, {{company}} merge tags. */
  subject?: string;
  /** Body template. Supports merge tags above. SMS body is also templated. */
  bodyTemplate?: string;
  /** Branching: if the previous step's outcome matches `ifOutcome`,
   *  jump to `gotoIndex` instead of advancing to step+1. Evaluated
   *  in array order; first match wins. Use `gotoIndex: -1` to mark
   *  the enrollment complete (e.g. "if buyer replied, stop"). */
  branches?: Array<{ ifOutcome: string; gotoIndex: number }>;
};

export type Cadence = {
  id: string;
  name: string;
  description?: string;
  steps: CadenceStep[];
  active: boolean;        // false = no new enrollments, existing keep running
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};

export type EnrollmentStatus = "active" | "completed" | "stopped" | "paused";

export type Enrollment = {
  id: string;
  cadenceId: string;
  buyerId: string;
  buyerName: string;
  buyerCompany: string;
  buyerEmail?: string;
  buyerPhone?: string;
  /** Index of the step that will be scheduled NEXT. When > steps.length-1
   *  the enrollment is marked completed by the runner. */
  currentStepIndex: number;
  /** When the next step becomes due. The cron tick picks up enrollments
   *  where this is in the past and the status is "active". */
  nextStepDueAt: string;
  status: EnrollmentStatus;
  startedAt: string;
  completedAt?: string;
  stoppedAt?: string;
  pausedAt?: string;
  enrolledBy?: string;
  /** Outcome of the most recently COMPLETED step. Read by the runner
   *  to evaluate branches before scheduling the next step. */
  lastStepOutcome?: string;
  /** Persistent queue items created by this enrollment. Used to
   *  cleanup-on-stop and to surface "what's been scheduled" on the UI. */
  queueItemIds: string[];
};

export type CadenceQueueItem = {
  id: string;
  enrollmentId: string;
  cadenceId: string;
  cadenceName: string;
  stepIndex: number;
  channel: QueueChannel;
  buyerId: string;
  buyerName: string;
  buyerCompany: string;
  to?: string;
  subject?: string;
  body?: string;
  dueAt: string;
  status: QueueStatus;
  outcome?: string;
  doneAt?: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Type guards ────────────────────────────────────────────────────

function isCadence(v: unknown): v is Cadence {
  if (!v || typeof v !== "object") return false;
  const c = v as Partial<Cadence>;
  return typeof c.id === "string" && typeof c.name === "string" && Array.isArray(c.steps);
}

function isEnrollment(v: unknown): v is Enrollment {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<Enrollment>;
  return (
    typeof e.id === "string" &&
    typeof e.cadenceId === "string" &&
    typeof e.buyerId === "string" &&
    typeof e.currentStepIndex === "number"
  );
}

function isCadenceQueueItem(v: unknown): v is CadenceQueueItem {
  if (!v || typeof v !== "object") return false;
  const q = v as Partial<CadenceQueueItem>;
  return typeof q.id === "string" && typeof q.enrollmentId === "string";
}

// ─── Helpers ────────────────────────────────────────────────────────

function isoPlusHours(hours: number, base?: string): string {
  const start = base ? new Date(base).getTime() : Date.now();
  return new Date(start + hours * 60 * 60 * 1000).toISOString();
}

function applyMergeTags(
  template: string | undefined,
  merge: { name?: string; company?: string },
): string | undefined {
  if (!template) return undefined;
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, merge.name ?? "")
    .replace(/\{\{\s*company\s*\}\}/gi, merge.company ?? "");
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(7).toString("hex")}`;
}

// ─── Cadence store ──────────────────────────────────────────────────

export const cadencesStore = {
  async list(): Promise<Cadence[]> {
    const all = await getBackend().read<Cadence[]>(CADENCES_FILE, []);
    return all.filter(isCadence);
  },

  async get(id: string): Promise<Cadence | null> {
    return (await cadencesStore.list()).find((c) => c.id === id) ?? null;
  },

  async create(input: {
    name: string;
    description?: string;
    steps: CadenceStep[];
    active?: boolean;
    createdBy?: string;
  }): Promise<Cadence> {
    if (!input.name?.trim()) throw new Error("Cadence name required");
    if (!Array.isArray(input.steps) || input.steps.length === 0) {
      throw new Error("Cadence must have at least one step");
    }
    // Validate steps
    for (const [i, s] of input.steps.entries()) {
      if (s.channel !== "call" && s.channel !== "email" && s.channel !== "sms") {
        throw new Error(`Step ${i}: invalid channel "${s.channel}"`);
      }
      if (typeof s.delayHours !== "number" || s.delayHours < 0) {
        throw new Error(`Step ${i}: delayHours must be a non-negative number`);
      }
    }
    const now = new Date().toISOString();
    const cad: Cadence = {
      id: newId("cad"),
      name: input.name.trim().slice(0, 120),
      description: input.description?.trim().slice(0, 500),
      steps: input.steps,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
    };
    const existing = await cadencesStore.list();
    const next = [cad, ...existing].slice(0, MAX_CADENCES);
    await getBackend().write(CADENCES_FILE, next);
    return cad;
  },

  async patch(id: string, patch: Partial<Omit<Cadence, "id" | "createdAt">>): Promise<Cadence | null> {
    const existing = await cadencesStore.list();
    const idx = existing.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const merged: Cadence = {
      ...existing[idx],
      ...patch,
      id: existing[idx].id,
      createdAt: existing[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    existing[idx] = merged;
    await getBackend().write(CADENCES_FILE, existing);
    return merged;
  },

  async remove(id: string): Promise<boolean> {
    const existing = await cadencesStore.list();
    const next = existing.filter((c) => c.id !== id);
    if (next.length === existing.length) return false;
    await getBackend().write(CADENCES_FILE, next);
    return true;
  },
};

// ─── Enrollment store ───────────────────────────────────────────────

export const enrollmentsStore = {
  async list(filter?: { status?: EnrollmentStatus; cadenceId?: string; buyerId?: string }): Promise<Enrollment[]> {
    const all = (await getBackend().read<Enrollment[]>(ENROLLMENTS_FILE, [])).filter(isEnrollment);
    let out = all;
    if (filter?.status) out = out.filter((e) => e.status === filter.status);
    if (filter?.cadenceId) out = out.filter((e) => e.cadenceId === filter.cadenceId);
    if (filter?.buyerId) out = out.filter((e) => e.buyerId === filter.buyerId);
    return out;
  },

  async get(id: string): Promise<Enrollment | null> {
    return (await enrollmentsStore.list()).find((e) => e.id === id) ?? null;
  },

  async create(input: {
    cadenceId: string;
    buyerId: string;
    buyerName: string;
    buyerCompany: string;
    buyerEmail?: string;
    buyerPhone?: string;
    enrolledBy?: string;
  }): Promise<Enrollment> {
    const cadence = await cadencesStore.get(input.cadenceId);
    if (!cadence) throw new Error(`Cadence ${input.cadenceId} not found`);
    if (!cadence.active) throw new Error(`Cadence "${cadence.name}" is inactive`);

    // Block double-enrollment of the same buyer in the same cadence
    // while previous enrollment is still active. Operator can re-enroll
    // after stop/complete by submitting again.
    const existing = await enrollmentsStore.list({
      cadenceId: input.cadenceId,
      buyerId: input.buyerId,
    });
    const stillActive = existing.find((e) => e.status === "active" || e.status === "paused");
    if (stillActive) {
      throw new Error(`Buyer ${input.buyerId} already enrolled in this cadence (${stillActive.status})`);
    }

    const now = new Date().toISOString();
    const firstStep = cadence.steps[0];
    const enrollment: Enrollment = {
      id: newId("enr"),
      cadenceId: input.cadenceId,
      buyerId: input.buyerId,
      buyerName: input.buyerName,
      buyerCompany: input.buyerCompany,
      buyerEmail: input.buyerEmail,
      buyerPhone: input.buyerPhone,
      currentStepIndex: 0,
      nextStepDueAt: isoPlusHours(firstStep.delayHours),
      status: "active",
      startedAt: now,
      enrolledBy: input.enrolledBy,
      queueItemIds: [],
    };
    const all = await enrollmentsStore.list();
    const next = [enrollment, ...all].slice(0, MAX_ENROLLMENTS);
    await getBackend().write(ENROLLMENTS_FILE, next);
    return enrollment;
  },

  async patch(id: string, patch: Partial<Omit<Enrollment, "id">>): Promise<Enrollment | null> {
    const all = await enrollmentsStore.list();
    const idx = all.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const merged: Enrollment = {
      ...all[idx],
      ...patch,
      id: all[idx].id,
    };
    all[idx] = merged;
    await getBackend().write(ENROLLMENTS_FILE, all);
    return merged;
  },

  async remove(id: string): Promise<boolean> {
    const all = await enrollmentsStore.list();
    const next = all.filter((e) => e.id !== id);
    if (next.length === all.length) return false;
    await getBackend().write(ENROLLMENTS_FILE, next);
    return true;
  },
};

// ─── Cadence-scheduled queue items ──────────────────────────────────

export const cadenceQueueItemsStore = {
  async list(): Promise<CadenceQueueItem[]> {
    const all = await getBackend().read<CadenceQueueItem[]>(CADENCE_QUEUE_ITEMS_FILE, []);
    return all.filter(isCadenceQueueItem);
  },

  async get(id: string): Promise<CadenceQueueItem | null> {
    return (await cadenceQueueItemsStore.list()).find((q) => q.id === id) ?? null;
  },

  async create(item: Omit<CadenceQueueItem, "id" | "createdAt" | "updatedAt">): Promise<CadenceQueueItem> {
    const now = new Date().toISOString();
    const created: CadenceQueueItem = {
      ...item,
      id: newId("q_cad"),
      createdAt: now,
      updatedAt: now,
    };
    const all = await cadenceQueueItemsStore.list();
    const next = [created, ...all].slice(0, MAX_QUEUE_ITEMS);
    await getBackend().write(CADENCE_QUEUE_ITEMS_FILE, next);
    return created;
  },

  async patch(id: string, patch: Partial<Omit<CadenceQueueItem, "id" | "createdAt">>): Promise<CadenceQueueItem | null> {
    const all = await cadenceQueueItemsStore.list();
    const idx = all.findIndex((q) => q.id === id);
    if (idx === -1) return null;
    const merged: CadenceQueueItem = {
      ...all[idx],
      ...patch,
      id: all[idx].id,
      createdAt: all[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    all[idx] = merged;
    await getBackend().write(CADENCE_QUEUE_ITEMS_FILE, all);
    return merged;
  },

  async removeByEnrollment(enrollmentId: string): Promise<number> {
    const all = await cadenceQueueItemsStore.list();
    const next = all.filter((q) => q.enrollmentId !== enrollmentId);
    const removed = all.length - next.length;
    if (removed > 0) await getBackend().write(CADENCE_QUEUE_ITEMS_FILE, next);
    return removed;
  },
};

// ─── Runner ─────────────────────────────────────────────────────────

export type CadenceTickResult = {
  scannedEnrollments: number;
  scheduledItems: number;
  completedEnrollments: number;
  errors: Array<{ enrollmentId: string; error: string }>;
};

/**
 * Walk active enrollments where nextStepDueAt is in the past and
 * schedule the corresponding queue item. Branching is resolved against
 * `lastStepOutcome` if set, otherwise we advance linearly.
 *
 * Idempotent at the enrollment level: each call advances at most one
 * step per enrollment. If the cron runs every 15 min and three steps
 * are simultaneously overdue (e.g. cron downtime), it'll take three
 * ticks to catch up — that's intentional. Slice 3.5 will add a
 * "catch-up mode" if operator demand is real.
 */
export async function runCadenceTick(): Promise<CadenceTickResult> {
  const result: CadenceTickResult = {
    scannedEnrollments: 0,
    scheduledItems: 0,
    completedEnrollments: 0,
    errors: [],
  };

  const enrollments = await enrollmentsStore.list({ status: "active" });
  const now = Date.now();
  const due = enrollments.filter((e) => new Date(e.nextStepDueAt).getTime() <= now);
  result.scannedEnrollments = due.length;

  for (const enr of due) {
    try {
      const cadence = await cadencesStore.get(enr.cadenceId);
      if (!cadence) {
        // Cadence was deleted out from under us. Mark enrollment stopped
        // so we don't keep looping on it.
        await enrollmentsStore.patch(enr.id, {
          status: "stopped",
          stoppedAt: new Date().toISOString(),
        });
        continue;
      }

      // Determine which step index to schedule. Default = currentStepIndex.
      // If the previous step recorded an outcome and the previous step
      // declared a matching branch, use that branch's gotoIndex.
      let stepIndexToSchedule = enr.currentStepIndex;
      if (enr.lastStepOutcome && enr.currentStepIndex > 0) {
        const prevStep = cadence.steps[enr.currentStepIndex - 1];
        if (prevStep?.branches) {
          const branch = prevStep.branches.find(
            (b) => b.ifOutcome.toLowerCase() === enr.lastStepOutcome!.toLowerCase(),
          );
          if (branch) {
            stepIndexToSchedule = branch.gotoIndex;
          }
        }
      }

      // Past the end → enrollment complete
      if (stepIndexToSchedule < 0 || stepIndexToSchedule >= cadence.steps.length) {
        await enrollmentsStore.patch(enr.id, {
          status: "completed",
          completedAt: new Date().toISOString(),
        });
        result.completedEnrollments += 1;
        continue;
      }

      const step = cadence.steps[stepIndexToSchedule];
      const merge = { name: enr.buyerName, company: enr.buyerCompany };
      const subject = applyMergeTags(step.subject, merge);
      const body = applyMergeTags(step.bodyTemplate, merge);

      const queueItem = await cadenceQueueItemsStore.create({
        enrollmentId: enr.id,
        cadenceId: cadence.id,
        cadenceName: cadence.name,
        stepIndex: stepIndexToSchedule,
        channel: step.channel,
        buyerId: enr.buyerId,
        buyerName: enr.buyerName,
        buyerCompany: enr.buyerCompany,
        to: step.channel === "email" ? enr.buyerEmail : enr.buyerPhone,
        subject,
        body,
        dueAt: new Date().toISOString(),
        status: "pending",
      });

      // Advance enrollment to next step, schedule its dueAt based on the
      // NEXT step's delay. If the just-scheduled step was the last, mark
      // the enrollment completed on the next tick (when currentStepIndex
      // exceeds steps.length - 1).
      const nextIndex = stepIndexToSchedule + 1;
      const nextStep = cadence.steps[nextIndex];
      const nextDueAt = nextStep
        ? isoPlusHours(nextStep.delayHours)
        : new Date(0).toISOString(); // any past time → next tick marks completed
      await enrollmentsStore.patch(enr.id, {
        currentStepIndex: nextIndex,
        nextStepDueAt: nextDueAt,
        // Clear lastStepOutcome once consumed so re-runs don't re-branch
        lastStepOutcome: undefined,
        queueItemIds: [...enr.queueItemIds, queueItem.id],
      });
      result.scheduledItems += 1;
    } catch (err) {
      result.errors.push({
        enrollmentId: enr.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Mark a cadence-scheduled queue item as done (or skipped/failed) and
 * record the outcome on the parent enrollment so the next runCadenceTick
 * call can branch correctly.
 *
 * Called by the operator's "mark done" action on /queue (slice 3.5
 * will add inline action UI; for now this is callable via API).
 */
export async function recordCadenceItemOutcome(args: {
  itemId: string;
  status: QueueStatus;
  outcome?: string;
  notes?: string;
}): Promise<{ item: CadenceQueueItem | null; enrollment: Enrollment | null }> {
  const item = await cadenceQueueItemsStore.patch(args.itemId, {
    status: args.status,
    outcome: args.outcome,
    doneAt: args.status === "done" ? new Date().toISOString() : undefined,
  });
  if (!item) return { item: null, enrollment: null };
  const enrollment = await enrollmentsStore.patch(item.enrollmentId, {
    lastStepOutcome: args.outcome,
  });
  return { item, enrollment };
}
