import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { store, type EmailSuppressionSource } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SOURCES: EmailSuppressionSource[] = [
  "unsubscribe",
  "complaint",
  "operator",
  "import",
  "hard_bounce",
];

/**
 * GET /api/admin/suppressions — list every contact on the suppression
 * list (email or phone). Sorted newest-first. Supports filtering by
 * source, channel scope, and free-text query.
 *
 * Query params:
 *   q        text search across email + phone + reason
 *   source   exact match on source enum
 *   channel  "email" | "sms" | "both"  (filters by scope. "both" = entries
 *            with channel=undefined that block both channels.)
 *   limit    max rows (default 500, max 5000)
 *
 * Returns:
 *   { suppressions, total, filteredTotal,
 *     counts: { bySource, byChannel: { both, email, sms } } }
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "system:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const sourceFilter = sp.get("source") as EmailSuppressionSource | null;
  const channelFilter = sp.get("channel"); // "email" | "sms" | "both" | null
  const limitRaw = parseInt(sp.get("limit") ?? "500", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 500;

  const all = await store.getEmailSuppressions();
  const sorted = all
    .slice()
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

  // Counts BEFORE filtering — operator sees the real distribution
  const bySource: Record<string, number> = {};
  const byChannel = { both: 0, email: 0, sms: 0 };
  for (const s of sorted) {
    bySource[s.source] = (bySource[s.source] ?? 0) + 1;
    if (s.channel === "email") byChannel.email += 1;
    else if (s.channel === "sms") byChannel.sms += 1;
    else byChannel.both += 1;
  }

  const filtered = sorted.filter((s) => {
    if (sourceFilter && VALID_SOURCES.includes(sourceFilter) && s.source !== sourceFilter) {
      return false;
    }
    if (channelFilter === "both" && s.channel !== undefined) return false;
    if (channelFilter === "email" && s.channel !== "email") return false;
    if (channelFilter === "sms" && s.channel !== "sms") return false;
    if (q) {
      const hay = `${s.email} ${s.phone ?? ""} ${s.reason ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return NextResponse.json({
    suppressions: filtered.slice(0, limit),
    total: all.length,
    filteredTotal: filtered.length,
    counts: { bySource, byChannel },
  });
}

/**
 * POST /api/admin/suppressions â€” operator manually adds an email to
 * the suppression list. Source is forced to "operator" for audit
 * clarity. The body's reason is preserved.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "system:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: {
    email?: unknown;
    phone?: unknown;
    channel?: unknown;
    reason?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";
  const channel: "email" | "sms" | undefined =
    body.channel === "email" || body.channel === "sms" ? body.channel : undefined;

  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json({ error: "Email is malformed" }, { status: 400 });
  }
  if (!emailRaw && !phoneRaw) {
    return NextResponse.json({ error: "Email or phone required" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined;
  const op = getOperator();

  const sup = await store.addEmailSuppression({
    email: emailRaw,
    phone: phoneRaw || undefined,
    channel,
    source: "operator",
    reason: reason ?? `Manually added by ${op.email}`,
  });

  // Same defense-in-depth as the public unsubscribe endpoint -- propagate
  // DNC to BusinessRecord. Skip the propagation when the operator
  // explicitly scoped the suppression to a single channel; the
  // BusinessRecord.doNotContact flag is global and would over-suppress.
  // Phone-only operator entries also skip (no email to look up).
  if (emailRaw && channel === undefined) {
    try {
      const biz = await store.getBusinessByEmail(emailRaw);
      if (biz && !biz.doNotContact) {
        await store.updateBusiness(biz.id, {
          doNotContact: true,
          optedOutAt: new Date().toISOString(),
          optedOutReason: reason ?? "operator-added DNC",
          status: "do_not_contact",
        });
      }
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ ok: true, suppression: sup });
}
