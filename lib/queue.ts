/**
 * Unified outreach queue — slice 1 (data model + read-only backfill).
 *
 * Today, "what should the operator do next" is fragmented across five
 * surfaces:
 *   - /tasks            outbound CALL queue (server-side tasks store)
 *   - /calls            CALL log + voicemails
 *   - /leads            inbound LEADS + their inboundSms[] + aiFollowups
 *   - /outreach         derived campaigns from drafts
 *   - /admin/outreach-jobs    bulk-draft job runner
 *
 * The QueueItem type below is one row in a unified inbox that crosses
 * channel (call / email / sms) and direction (outbound / inbound), so
 * the operator can sit at one screen and work the queue top-down.
 *
 * Slice 1 is *read-only*: there is no QueueItem store. computeQueue()
 * synthesizes items from existing sources (open tasks, unread voicemails,
 * lead.inboundSms[], lead-followup candidates). This proves the model
 * against real data before slice 2 builds the UI on top of it. Slice 3
 * introduces a persistent QueueItem store for cadence-driven scheduled
 * outbound that can't be derived (e.g. "send SMS on day 5").
 *
 * Why derive instead of writing a new store immediately:
 *   - Zero migration risk — existing data keeps flowing through its
 *     existing stores, the queue is just a view.
 *   - The shape can iterate without losing data — if QueueItem grows
 *     a field, we re-derive next request and the field shows up.
 *   - Operator can compare the queue surface to the legacy /tasks etc.
 *     and report "I don't see X here" before we cut over.
 *
 * Node-only.
 */
import { cadenceQueueItemsStore } from "@/lib/cadences";
import { findLeadFollowupCandidates } from "@/lib/leadFollowup";
import { store } from "@/lib/store";
import { tasksStore } from "@/lib/tasks";
import { listVoicemails } from "@/lib/voicemails";

export type QueueChannel = "call" | "email" | "sms";
export type QueueDirection = "outbound" | "inbound";
export type QueueStatus =
  | "pending"      // not yet acted on
  | "in_progress"  // operator opened it / draft started
  | "done"         // sent / acted on
  | "skipped"      // operator dismissed
  | "failed";      // adapter returned ok:false

/**
 * The kind of source record a queue item points back to. Lets the UI
 * deep-link into the right detail view (open the task, open the lead,
 * play the voicemail, etc.) and lets later slices write the "done"
 * state back to the right store.
 */
export type QueueRefKind =
  | "task"          // open phone task
  | "lead"          // inbound contact form lead awaiting first reply
  | "lead-followup" // lead-followup cron candidate (auto-second-touch)
  | "lead-sms"      // inbound SMS appended to a Lead
  | "voicemail"     // unread voicemail
  | "draft"         // outreach draft awaiting send (slice 2/3)
  | "cadence";      // cadence-scheduled outbound (slice 3)

export type QueueItem = {
  /** Stable id for deduplication across requests. Format depends on the
   *  source kind so we can locate the underlying record:
   *   q_task_<taskId>           — outbound call from /tasks
   *   q_vm_<voicemailId>        — inbound voicemail
   *   q_leadsms_<leadId>_<idx>  — inbound SMS line on a lead
   *   q_leadfu_<leadId>         — outbound lead followup candidate
   *   q_lead_<leadId>           — inbound lead awaiting first reply
   */
  id: string;
  channel: QueueChannel;
  direction: QueueDirection;
  status: QueueStatus;

  // Who / what
  buyerId?: string;
  buyerName?: string;
  buyerCompany?: string;
  /** Phone (E.164 preferred) or email. Format depends on channel. */
  to?: string;
  /** Inbound only — the from-number / from-email so the operator sees
   *  the raw caller ID even when we couldn't match to a known buyer. */
  from?: string;

  // Payload (outbound) / received content (inbound)
  subject?: string;     // email
  body?: string;        // email/sms preview, voicemail transcription, lead message

  // Scheduling. For outbound: when it should be acted on. For inbound:
  // when it landed. Sort key for the queue.
  dueAt: string;        // ISO
  doneAt?: string;      // ISO
  /** Coarse priority bucket so the inbox can sort cross-channel without
   *  faking a numeric score. Rules:
   *   urgent:  inbound voicemail/sms/lead, or task overdue >24h
   *   today:   outbound due today
   *   later:   outbound due >today */
  priority: "urgent" | "today" | "later";

  // Provenance
  ref: { kind: QueueRefKind; id: string };
  source: string;       // human-readable origin label, shown in the UI

  // Outcome (set once status→done)
  outcome?: string;
  notes?: string;
  /** Set true by the cadence runner when workspace approval mode says
   *  the operator must sign off before this item can be acted on.
   *  Surfaces as a "Needs approval" badge on /queue + filter pill. */
  requiresApproval?: boolean;

  createdAt: string;    // ISO
  updatedAt: string;    // ISO
};

export type QueueFilter = {
  channel?: QueueChannel;
  direction?: QueueDirection;
  status?: QueueStatus;
  /** ISO; only items dueAt >= this. */
  sinceIso?: string;
  /** ISO; only items dueAt <= this. */
  untilIso?: string;
  limit?: number;
};

export type QueueSummary = {
  total: number;
  byChannel: Record<QueueChannel, number>;
  byDirection: Record<QueueDirection, number>;
  byStatus: Record<QueueStatus, number>;
  /** Inbound items where status=pending — the "needs your attention now" count. */
  unreadInbound: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function priorityFor(args: {
  direction: QueueDirection;
  channel: QueueChannel;
  dueIso: string;
  status: QueueStatus;
}): QueueItem["priority"] {
  // Inbound is always urgent until the operator marks it done. Missed
  // calls / texts / leads can't sit on a "later" pile — that's how
  // buyers fall through.
  if (args.direction === "inbound" && args.status !== "done") return "urgent";

  const dueMs = new Date(args.dueIso).getTime();
  const now = Date.now();
  // Overdue outbound (due >24h ago and still pending) escalates to urgent —
  // a phone task that's been sitting for two days is a leak, not a "later."
  if (args.status === "pending" && dueMs < now - DAY_MS) return "urgent";

  // Due today (or already due, but within the last day)
  if (dueMs < now + DAY_MS) return "today";

  return "later";
}

/**
 * Pull tasks where done !== true and synthesize an outbound-call queue
 * item per task. Already-attempted tasks still count — operator may
 * need to retry / leave a voicemail / try a different time.
 */
async function deriveFromTasks(): Promise<QueueItem[]> {
  const all = await tasksStore.list();
  const out: QueueItem[] = [];
  for (const t of all) {
    if (t.done) continue;
    if (t.type !== "phone") continue; // sequence tasks are not yet single-touches
    // dueAt: if the latest attempt scheduled a callback, prefer that;
    // otherwise the task createdAt (oldest open task floats to top).
    const lastAttempt = t.attempts?.[t.attempts.length - 1];
    const dueAt = lastAttempt?.callbackAt || t.createdAt;
    const status: QueueStatus = "pending";
    out.push({
      id: `q_task_${t.id}`,
      channel: "call",
      direction: "outbound",
      status,
      buyerId: t.buyerId,
      buyerName: t.buyerName,
      buyerCompany: t.buyerCompany,
      to: t.buyerPhone,
      dueAt,
      priority: priorityFor({ direction: "outbound", channel: "call", dueIso: dueAt, status }),
      ref: { kind: "task", id: t.id },
      source: "Task",
      notes: lastAttempt?.notes,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    });
  }
  return out;
}

/**
 * Unread voicemails → inbound-call queue items. Read voicemails are
 * filtered out because the operator already dismissed them (acts as
 * the queue's done state for voicemails).
 */
async function deriveFromVoicemails(): Promise<QueueItem[]> {
  const all = await listVoicemails();
  const out: QueueItem[] = [];
  for (const vm of all) {
    if (vm.read) continue;
    out.push({
      id: `q_vm_${vm.id}`,
      channel: "call",
      direction: "inbound",
      status: "pending",
      from: vm.from,
      to: vm.from, // for callback-from-this-row UX in slice 2
      body: vm.transcription || `Voicemail (${vm.durationSec}s)`,
      dueAt: vm.recordedAt,
      priority: "urgent",
      ref: { kind: "voicemail", id: vm.id },
      source: "Voicemail",
      createdAt: vm.recordedAt,
      updatedAt: vm.recordedAt,
    });
  }
  return out;
}

/**
 * Inbound SMS lines from leads → inbound-sms queue items. We emit one
 * row per inbound message (not one per lead) so a thread of three texts
 * shows three rows — matches operator mental model of "three things to
 * read." Older messages sort below newer ones.
 *
 * Status starts as "pending"; slice 2 will let the operator mark
 * individual messages done. Slice 4 introduces a per-lead unread
 * cursor so the queue auto-collapses once the operator has read the
 * thread.
 */
async function deriveFromLeadInboundSms(): Promise<QueueItem[]> {
  const leads = await store.getLeads();
  const out: QueueItem[] = [];
  for (const lead of leads) {
    const msgs = lead.inboundSms ?? [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      out.push({
        id: `q_leadsms_${lead.id}_${i}`,
        channel: "sms",
        direction: "inbound",
        status: "pending",
        buyerId: lead.id,
        buyerName: lead.name,
        buyerCompany: lead.company,
        from: m.from,
        to: m.from,
        body: m.body,
        dueAt: m.at,
        priority: "urgent",
        ref: { kind: "lead-sms", id: `${lead.id}:${i}` },
        source: "Inbound SMS",
        createdAt: m.at,
        updatedAt: m.at,
      });
    }
  }
  return out;
}

/**
 * Lead-followup candidates → outbound-email queue items. These are the
 * leads the daily cron WOULD send a second-touch to tonight. Surfacing
 * them on the queue lets the operator see what's about to fire and
 * intervene (skip / edit / send-now) before the cron does.
 */
async function deriveFromLeadFollowups(): Promise<QueueItem[]> {
  const candidates = await findLeadFollowupCandidates().catch(() => []);
  const out: QueueItem[] = [];
  for (const c of candidates) {
    const lead = c.lead;
    out.push({
      id: `q_leadfu_${lead.id}`,
      channel: "email",
      direction: "outbound",
      status: "pending",
      buyerId: lead.id,
      buyerName: lead.name,
      buyerCompany: lead.company,
      to: lead.email,
      subject: `Following up — ${lead.company}`,
      body: lead.aiReply?.body ? `(prior touch sent ${lead.aiReply.at})` : undefined,
      dueAt: new Date().toISOString(), // due now — cron is gated by daysBetweenTouches
      priority: "today",
      ref: { kind: "lead-followup", id: lead.id },
      source: `Auto-followup (day ${c.daysSinceLastTouch})`,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    });
  }
  return out;
}

/**
 * Brand new inbound leads where the AI auto-reply hasn't fired yet
 * (status="new", aiReply.status not "sent"). These need either:
 *   - the auto-reply to fire (handled elsewhere)
 *   - or operator intervention (manual response) when the auto-reply
 *     was skipped/errored
 *
 * Surfaces them so a "skipped" lead doesn't sit invisible.
 */
async function deriveFromNewLeads(): Promise<QueueItem[]> {
  const leads = await store.getLeads();
  const out: QueueItem[] = [];
  for (const lead of leads) {
    if (lead.status !== "new") continue;
    if (lead.aiReply?.status === "sent") continue;
    // Skip leads younger than 60s — give the auto-reply a chance to fire
    // before we surface them as "needs operator response."
    if (Date.now() - new Date(lead.createdAt).getTime() < 60_000) continue;
    out.push({
      id: `q_lead_${lead.id}`,
      channel: "email",
      direction: "inbound",
      status: "pending",
      buyerId: lead.id,
      buyerName: lead.name,
      buyerCompany: lead.company,
      from: lead.email,
      to: lead.email,
      subject: `New lead — ${lead.company}`,
      body: lead.message?.slice(0, 280) || "(no message body)",
      dueAt: lead.createdAt,
      priority: "urgent",
      ref: { kind: "lead", id: lead.id },
      source: lead.aiReply?.status
        ? `Inbound lead (auto-reply ${lead.aiReply.status})`
        : "Inbound lead",
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    });
  }
  return out;
}

/**
 * Cadence-scheduled queue items live in their own persistent store
 * (created by runCadenceTick in lib/cadences.ts). Unlike the other
 * sources which derive from existing records at request time, these
 * items ARE the source of truth — operator marking one done writes
 * back to the cadenceQueueItems store and the parent enrollment.
 *
 * Filter to status="pending" so done/skipped items don't pile up on
 * the inbox after they've been acted on. They stay in the store for
 * audit but drop off the queue surface.
 */
async function deriveFromCadenceItems(): Promise<QueueItem[]> {
  const all = await cadenceQueueItemsStore.list();
  const out: QueueItem[] = [];
  for (const c of all) {
    if (c.status !== "pending") continue;
    const status: QueueStatus = "pending";
    out.push({
      id: c.id,
      channel: c.channel,
      direction: "outbound",
      status,
      buyerId: c.buyerId,
      buyerName: c.buyerName,
      buyerCompany: c.buyerCompany,
      to: c.to,
      subject: c.subject,
      body: c.body,
      dueAt: c.dueAt,
      priority: priorityFor({
        direction: "outbound",
        channel: c.channel,
        dueIso: c.dueAt,
        status,
      }),
      ref: { kind: "cadence", id: c.id },
      source: `Cadence · ${c.cadenceName} · step ${c.stepIndex + 1}`,
      requiresApproval: c.requiresApproval,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
  }
  return out;
}

/**
 * Compose the unified queue across all derived sources, then apply
 * filter + sort. Sort is: priority (urgent → today → later), then
 * dueAt ascending so the most-overdue thing in each priority bucket
 * floats to the top.
 */
export async function computeQueue(filter: QueueFilter = {}): Promise<QueueItem[]> {
  const [tasks, voicemails, leadSms, leadFollowups, newLeads, cadenceItems] = await Promise.all([
    deriveFromTasks(),
    deriveFromVoicemails(),
    deriveFromLeadInboundSms(),
    deriveFromLeadFollowups(),
    deriveFromNewLeads(),
    deriveFromCadenceItems(),
  ]);
  let items: QueueItem[] = [
    ...tasks,
    ...voicemails,
    ...leadSms,
    ...leadFollowups,
    ...newLeads,
    ...cadenceItems,
  ];

  // Apply filters
  if (filter.channel) items = items.filter((i) => i.channel === filter.channel);
  if (filter.direction) items = items.filter((i) => i.direction === filter.direction);
  if (filter.status) items = items.filter((i) => i.status === filter.status);
  if (filter.sinceIso) {
    const t = new Date(filter.sinceIso).getTime();
    items = items.filter((i) => new Date(i.dueAt).getTime() >= t);
  }
  if (filter.untilIso) {
    const t = new Date(filter.untilIso).getTime();
    items = items.filter((i) => new Date(i.dueAt).getTime() <= t);
  }

  // Sort: priority bucket then due ascending
  const PRIORITY_ORDER: Record<QueueItem["priority"], number> = {
    urgent: 0,
    today: 1,
    later: 2,
  };
  items.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority];
    const pb = PRIORITY_ORDER[b.priority];
    if (pa !== pb) return pa - pb;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  if (filter.limit && filter.limit > 0) items = items.slice(0, filter.limit);
  return items;
}

/**
 * Counts for the sidebar badge / dashboard tile. Computed by running
 * computeQueue() with no filter and aggregating — slice 4 will optimize
 * with a dedicated count query if needed.
 */
export async function getQueueSummary(): Promise<QueueSummary> {
  const items = await computeQueue();
  const byChannel: Record<QueueChannel, number> = { call: 0, email: 0, sms: 0 };
  const byDirection: Record<QueueDirection, number> = { outbound: 0, inbound: 0 };
  const byStatus: Record<QueueStatus, number> = {
    pending: 0,
    in_progress: 0,
    done: 0,
    skipped: 0,
    failed: 0,
  };
  let unreadInbound = 0;
  for (const i of items) {
    byChannel[i.channel] += 1;
    byDirection[i.direction] += 1;
    byStatus[i.status] += 1;
    if (i.direction === "inbound" && i.status === "pending") unreadInbound += 1;
  }
  return {
    total: items.length,
    byChannel,
    byDirection,
    byStatus,
    unreadInbound,
  };
}
