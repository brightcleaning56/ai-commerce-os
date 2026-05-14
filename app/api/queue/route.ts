import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import {
  computeQueue,
  type QueueChannel,
  type QueueDirection,
  type QueueFilter,
  type QueueStatus,
} from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/queue — unified outreach inbox.
 *
 * Slice 1 is read-only and the items are derived at request time from
 * existing stores (tasks, voicemails, lead.inboundSms[], lead-followup
 * candidates, brand-new leads). No writes; status/done state lives in
 * the underlying source records and the queue follows.
 *
 * Capability gating: leads:read is the broadest gate that covers every
 * source we aggregate — voice:read alone wouldn't cover lead-followup
 * candidates, and outreach:read alone wouldn't cover voicemails. We
 * pick the broadest because the queue is meant to be the operator's
 * single landing surface; if you can see leads at all, you should see
 * the queue.
 *
 * Filters (all optional, all from query params):
 *   ?channel=call|email|sms
 *   ?direction=outbound|inbound
 *   ?status=pending|in_progress|done|skipped|failed
 *   ?since=ISO8601    only items dueAt >= this
 *   ?until=ISO8601    only items dueAt <= this
 *   ?limit=N          cap result set (default 500)
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const filter: QueueFilter = {};

  const channel = sp.get("channel");
  if (channel === "call" || channel === "email" || channel === "sms") {
    filter.channel = channel as QueueChannel;
  }
  const direction = sp.get("direction");
  if (direction === "outbound" || direction === "inbound") {
    filter.direction = direction as QueueDirection;
  }
  const status = sp.get("status");
  if (
    status === "pending" ||
    status === "in_progress" ||
    status === "done" ||
    status === "skipped" ||
    status === "failed"
  ) {
    filter.status = status as QueueStatus;
  }
  const since = sp.get("since");
  if (since && !Number.isNaN(Date.parse(since))) filter.sinceIso = since;
  const until = sp.get("until");
  if (until && !Number.isNaN(Date.parse(until))) filter.untilIso = until;
  const limitRaw = sp.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 500;
  filter.limit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 2000) : 500;

  try {
    const items = await computeQueue(filter);
    return NextResponse.json({
      items,
      count: items.length,
      generatedAt: new Date().toISOString(),
      // Helpful debug header for the operator: lets them see which sources
      // contributed to this snapshot. Slice 2 surfaces this in the page UI.
      sources: {
        tasks: items.filter((i) => i.ref.kind === "task").length,
        voicemails: items.filter((i) => i.ref.kind === "voicemail").length,
        leadSms: items.filter((i) => i.ref.kind === "lead-sms").length,
        leadFollowups: items.filter((i) => i.ref.kind === "lead-followup").length,
        newLeads: items.filter((i) => i.ref.kind === "lead").length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Queue computation failed" },
      { status: 500 },
    );
  }
}
