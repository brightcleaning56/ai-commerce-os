import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { store, type Lead } from "@/lib/store";
import { sendEmail } from "@/lib/email";
import { requireAdmin } from "@/lib/auth";
import { autoPromoteIfHot } from "@/lib/leadAutoPromote";
import { runLeadFirstReply } from "@/lib/leadFirstReply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const recent = new Map<string, number[]>();

const BODY_SCHEMA_KEYS = [
  "name", "email", "company", "phone", "companySize", "industry",
  "useCases", "timeline", "budget", "message",
] as const;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

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

/**
 * Public lead capture from /contact form. Anti-abuse: per-IP rate limit,
 * required-field validation, payload size cap.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  const log = recent.get(ip) ?? [];
  while (log.length && now - log[0] > RATE_WINDOW_MS) log.shift();
  if (log.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Too many requests. Wait a minute and try again." },
      { status: 429 },
    );
  }
  log.push(now);
  recent.set(ip, log);

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
  // Loose email check — full RFC validation is not worth the complexity.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const incomingSource = trim(body.source, 30);
  const source: Lead["source"] = incomingSource === "signup-form" ? "signup-form" : "contact-form";

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

  // ── Dedup by email ──────────────────────────────────────────────────
  // If a lead with this email already exists in the store, merge into it
  // instead of creating a duplicate. Same person submitting twice (form
  // refresh, accidental double-submit, returning visitor) should never
  // produce N records the operator has to reconcile.
  //
  //  - within 5 min of a prior submission → silent dedupe (no audit entry,
  //    no AI re-trigger). Catches double-clicks + form refreshes.
  //  - longer than 5 min → real resubmission: append an audit entry, merge
  //    new non-empty fields, fire a fresh AI reply (since the conversation
  //    may have gone cold and they're re-engaging).
  const existing = await store.getLeadByEmail(email);
  const SILENT_DEDUP_WINDOW_MS = 5 * 60 * 1000;

  if (existing) {
    const lastTouchMs = new Date(existing.lastSubmittedAt ?? existing.createdAt).getTime();
    const sinceMs = Date.now() - lastTouchMs;
    const silentDedup = sinceMs < SILENT_DEDUP_WINDOW_MS;

    // Diff incoming vs stored — fields only "merge" when incoming has a
    // value AND stored is empty. Never overwrite a value with another value
    // (we can't tell which is more accurate; operator can edit manually).
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
    // useCases — union the lists
    if (incoming.useCases.length > 0) {
      const merged = Array.from(new Set([...(existing.useCases ?? []), ...incoming.useCases]));
      if (merged.length !== existing.useCases.length) {
        patch.useCases = merged;
        changedFields.push("useCases");
      }
    }
    patch.lastSubmittedAt = new Date().toISOString();

    if (!silentDedup) {
      patch.resubmissions = [
        ...(existing.resubmissions ?? []),
        {
          at: new Date().toISOString(),
          source,
          changedFields,
          newMessage: incoming.message,
          triggeredAiReply: true,
        },
      ];
    }

    const merged = await store.updateLead(existing.id, patch);

    // Fire a fresh AI reply only if outside the silent window AND the lead
    // is still in "new" or "contacted" status (don't re-engage closed deals).
    if (!silentDedup && merged && (merged.status === "new" || merged.status === "contacted")) {
      await Promise.allSettled([
        notifyOperator(merged).catch((err) => {
          console.error("[leads] operator notification failed (resubmit)", err);
        }),
        runLeadFirstReply(merged).catch((err) => {
          console.error("[leads] auto-reply failed (resubmit)", err);
        }),
      ]);

      // Auto-promote if the resubmission pushed the score over the threshold.
      // Re-fetch since runLeadFirstReply may have updated the lead in-store.
      const fresh = (await store.getLead(existing.id)) ?? merged;
      try {
        await autoPromoteIfHot(fresh);
      } catch (err) {
        console.error("[leads] auto-promote failed (resubmit)", err);
      }
    }

    return NextResponse.json({
      ok: true,
      id: existing.id,
      deduped: true,
      silentDedup,
      changedFields: silentDedup ? [] : changedFields,
    });
  }

  // ── New lead ────────────────────────────────────────────────────────
  const lead: Lead = {
    id: `lead_${crypto.randomBytes(8).toString("hex")}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...incoming,
    source,
    status: "new",
    ipHash: hashIp(ip),
    userAgent: trim(req.headers.get("user-agent") || "", 300),
    lastSubmittedAt: new Date().toISOString(),
  };

  await store.addLead(lead);

  // CRITICAL: do NOT fire-and-forget on Netlify. Lambdas terminate as soon
  // as the response is returned — any in-flight `void promise` is killed
  // before the work completes, so the AI reply never sends and the lead
  // stays stuck at aiReply.status = "pending". Awaiting both in parallel
  // keeps total latency ~3-5s (Anthropic dominates) and well under the
  // 10s function timeout. If either fails the lead is still saved.
  await Promise.allSettled([
    notifyOperator(lead).catch((err) => {
      console.error("[leads] operator notification failed", err);
    }),
    runLeadFirstReply(lead).catch((err) => {
      console.error("[leads] auto-reply failed", err);
    }),
  ]);

  // Auto-promote hot leads to a buyer record so the Outreach Agent picks
  // them up on its next pipeline run. Re-fetch first since autoReplyToLead
  // mutates aiReply on the stored copy. No-op for cold/warm leads or when
  // AUTO_PROMOTE_LEAD_SCORE is set high enough to disable.
  const fresh = (await store.getLead(lead.id)) ?? lead;
  let autoPromoted = false;
  try {
    const r = await autoPromoteIfHot(fresh);
    autoPromoted = r.promoted;
  } catch (err) {
    console.error("[leads] auto-promote failed", err);
  }

  return NextResponse.json({ ok: true, id: lead.id, deduped: false, autoPromoted });
}

/**
 * GET — operator-only list of leads. Used by /leads admin page.
 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const leads = await store.getLeads();
  return NextResponse.json({ leads });
}

async function notifyOperator(lead: Lead): Promise<void> {
  const operatorEmail = process.env.OPERATOR_EMAIL;
  if (!operatorEmail) return;
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com";
  const linesText = [
    `New AVYN lead from ${lead.name} <${lead.email}>`,
    `Company: ${lead.company}${lead.industry ? ` · ${lead.industry}` : ""}${lead.companySize ? ` · ${lead.companySize}` : ""}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.useCases.length ? `Interested in: ${lead.useCases.join(", ")}` : null,
    lead.timeline ? `Timeline: ${lead.timeline}` : null,
    lead.budget ? `Budget: ${lead.budget}` : null,
    lead.message ? `\nMessage:\n${lead.message}` : null,
    "",
    `Open in admin: ${origin}/leads`,
  ].filter(Boolean).join("\n");

  await sendEmail({
    to: operatorEmail,
    subject: `New lead · ${lead.company} (${lead.name})`,
    textBody: linesText,
    replyTo: lead.email,
    metadata: { lead_id: lead.id, source: lead.source },
  });
}

// Suppress unused-key warning while keeping schema documented inline.
void BODY_SCHEMA_KEYS;
