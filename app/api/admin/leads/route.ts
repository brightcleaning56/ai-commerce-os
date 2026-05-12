import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { autoPromoteIfHot } from "@/lib/leadAutoPromote";
import { runLeadFirstReply } from "@/lib/leadFirstReply";
import { store, type Lead } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/leads — admin-only manual lead creation.
 *
 * For when the operator gets a referral over text, captures someone at
 * a trade show, or transcribes a phone call -- they can add the lead
 * directly from /leads instead of asking the contact to fill out the
 * public form. Mirrors /api/leads (public submit) but:
 *
 *  - Skips the per-IP rate limit (operator's own IP shouldn't throttle)
 *  - Forces source = "operator-add" so analytics distinguish it from
 *    organic web submissions
 *  - Optional `triggerAiReply` flag (default true) -- operator can tick
 *    "no" if they want to add a record without firing the AI welcome.
 *    Useful when they've already personally spoken with the lead.
 *  - Same dedupe: an existing email becomes an update, not a duplicate
 *
 * Returns the saved lead (and whether dedupe + auto-promote fired) so
 * the UI can show the new row immediately.
 */
function trim(v: unknown, max = 500): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

function trimArray(v: unknown, max = 50, perItem = 100): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, perItem))
    .filter(Boolean)
    .slice(0, max);
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = trim(body.name, 200);
  const email = trim(body.email, 200);
  const company = trim(body.company, 200);
  if (!name || !email || !company) {
    return NextResponse.json(
      { error: "name, email, and company are required" },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const triggerAiReply = body.triggerAiReply !== false; // default true

  const incoming = {
    name,
    email,
    company,
    phone: trim(body.phone, 50),
    companySize: trim(body.companySize, 30),
    industry: trim(body.industry, 80),
    useCases: trimArray(body.useCases),
    timeline: trim(body.timeline, 60),
    budget: trim(body.budget, 60),
    message: trim(body.message, 5000),
  };

  // Dedupe — same email = merge, just like the public endpoint, but record
  // an explicit "operator-add" resubmission so the audit trail is honest.
  const existing = await store.getLeadByEmail(email);
  if (existing) {
    const patch: Partial<Lead> = {};
    const changedFields: string[] = [];
    const fields = ["phone", "companySize", "industry", "timeline", "budget"] as const;
    for (const f of fields) {
      const incomingVal = (incoming as Record<string, unknown>)[f] as string | undefined;
      const storedVal = (existing as Record<string, unknown>)[f] as string | undefined;
      if (incomingVal && !storedVal) {
        (patch as Record<string, unknown>)[f] = incomingVal;
        changedFields.push(f);
      }
    }
    if (incoming.useCases.length > 0) {
      const merged = Array.from(new Set([...(existing.useCases ?? []), ...incoming.useCases]));
      if (merged.length !== existing.useCases.length) {
        patch.useCases = merged;
        changedFields.push("useCases");
      }
    }
    if (incoming.message && !existing.message) {
      patch.message = incoming.message;
      changedFields.push("message");
    }
    patch.lastSubmittedAt = new Date().toISOString();
    patch.resubmissions = [
      ...(existing.resubmissions ?? []),
      {
        at: new Date().toISOString(),
        source: "operator-add",
        changedFields,
        newMessage: incoming.message,
        triggeredAiReply: triggerAiReply,
      },
    ];
    const merged = await store.updateLead(existing.id, patch);
    return NextResponse.json({
      ok: true,
      lead: merged,
      deduped: true,
      changedFields,
    });
  }

  const lead: Lead = {
    id: `lead_${crypto.randomBytes(8).toString("hex")}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...incoming,
    source: "operator-add",
    status: "new",
    lastSubmittedAt: new Date().toISOString(),
  };
  await store.addLead(lead);

  // Optional AI auto-reply -- operator can opt out if they're going to
  // personally reach out instead.
  let aiReplyResult: Awaited<ReturnType<typeof runLeadFirstReply>> | null = null;
  if (triggerAiReply) {
    try {
      aiReplyResult = await runLeadFirstReply(lead);
    } catch (err) {
      console.error("[admin/leads] AI auto-reply failed", err);
    }
  }

  // Auto-promote if hot -- mirrors the public endpoint behavior so the
  // operator doesn't have to re-promote a lead they just typed in.
  let autoPromoted = false;
  try {
    const fresh = (await store.getLead(lead.id)) ?? lead;
    const r = await autoPromoteIfHot(fresh);
    autoPromoted = r.promoted;
  } catch (err) {
    console.error("[admin/leads] auto-promote failed", err);
  }

  // Re-read so the response includes the aiReply state set by runLeadFirstReply
  const fresh = (await store.getLead(lead.id)) ?? lead;
  return NextResponse.json({
    ok: true,
    lead: fresh,
    deduped: false,
    aiReply: aiReplyResult,
    autoPromoted,
  });
}
