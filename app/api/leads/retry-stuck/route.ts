import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runLeadFirstReply } from "@/lib/leadFirstReply";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/leads/retry-stuck â€” admin-only.
 *
 * Bulk-retries the AI first-touch reply for every lead whose aiReply is
 * missing, errored, or skipped. Designed for the recovery case after:
 *  - Postmark approval was pending and is now granted
 *  - ANTHROPIC_API_KEY was missing during a burst of submissions
 *  - A transient provider outage caused a batch to fail
 *
 * Optional body:
 *   { max?: number }   â€” cap per-request batch size (default 20, max 100)
 *                         to stay inside the platform 60s function timeout.
 *                         Each Anthropic call is ~1-3s, each Postmark call
 *                         ~0.3s, so 20 = ~60s worst-case.
 *
 * The operator can re-click the button to drain the queue. Status === "new"
 * is required so we never re-blast someone who's actively conversing with
 * the operator (status !== "new" means they've engaged).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const requestedMax = Number(body?.max);
  const max = Number.isFinite(requestedMax) ? Math.min(Math.max(1, requestedMax), 100) : 20;

  const all = await store.getLeads();
  const candidates = all.filter((l) => {
    if (l.status !== "new") return false;
    if (!l.aiReply) return true;
    if (l.aiReply.status === "error") return true;
    if (l.aiReply.status === "skipped") return true;
    if (l.aiReply.status === "pending") return true;
    return false;
  });
  const batch = candidates.slice(0, max);
  const remaining = Math.max(0, candidates.length - batch.length);

  const results: Array<{
    leadId: string;
    company: string;
    email: string;
    status: "sent" | "skipped" | "error";
    channels: ("email" | "sms")[];
    errorMessage?: string;
  }> = [];

  for (const lead of batch) {
    const r = await runLeadFirstReply(lead);
    results.push({
      leadId: lead.id,
      company: lead.company,
      email: lead.email,
      status: r.status,
      channels: r.channels,
      errorMessage: r.errorMessage,
    });
  }

  return NextResponse.json({
    ok: true,
    processed: batch.length,
    candidates: candidates.length,
    remaining,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errored: results.filter((r) => r.status === "error").length,
    results,
  });
}
