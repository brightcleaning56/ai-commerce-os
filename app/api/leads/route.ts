import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { store, type Lead } from "@/lib/store";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { requireAdmin } from "@/lib/auth";
import { generateLeadFollowup } from "@/lib/agents/lead-followup";

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

  const lead: Lead = {
    id: `lead_${crypto.randomBytes(8).toString("hex")}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
    source,
    status: "new",
    ipHash: hashIp(ip),
    userAgent: trim(req.headers.get("user-agent") || "", 300),
  };

  await store.addLead(lead);

  // Fire-and-forget operator notification — don't block the response on email.
  void notifyOperator(lead).catch((err) => {
    console.error("[leads] operator notification failed", err);
  });

  // Fire-and-forget AI auto-reply to the lead. Doesn't block the form submit
  // response so the user sees "Request received" instantly while we generate
  // + send the personalized first-touch in the background.
  void autoReplyToLead(lead).catch((err) => {
    console.error("[leads] auto-reply failed", err);
  });

  return NextResponse.json({ ok: true, id: lead.id });
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

/**
 * Generate + send a personalized first-touch reply to the lead immediately
 * after their submission. Email always fires; SMS only fires when Twilio is
 * configured AND the lead provided a phone number. Stores everything in
 * lead.aiReply so the operator can see what we sent from /leads.
 *
 * Failures fall back to a deterministic template (Anthropic absent) or
 * just mark the AI reply as "error" (transport failed) so the lead still
 * appears in the inbox with a status the operator can act on.
 */
async function autoReplyToLead(lead: Lead): Promise<void> {
  const startedAt = new Date().toISOString();
  // Mark pending immediately so the operator UI shows "AI follow-up in flight"
  // even if the generation/send takes a few seconds.
  await store.updateLead(lead.id, {
    aiReply: { status: "pending", at: startedAt, channel: [] },
  });

  let subject = "";
  let body = "";
  let smsBody: string | undefined;
  let model = "fallback (no API key)";
  let estCostUsd: number | undefined;
  let usedFallback = true;

  try {
    const result = await generateLeadFollowup(lead);
    subject = result.subject;
    body = result.body;
    smsBody = result.smsBody;
    model = result.model;
    estCostUsd = result.estCostUsd;
    usedFallback = result.usedFallback;
  } catch (err) {
    await store.updateLead(lead.id, {
      aiReply: {
        status: "error",
        at: new Date().toISOString(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    return;
  }

  const channels: ("email" | "sms")[] = [];

  // Email path — always fires if we have a subject + body.
  const emailRes = await sendEmail({
    to: lead.email,
    subject,
    textBody: body,
    // Replies route to the operator's inbox so Eric stays in the loop.
    replyTo: process.env.OPERATOR_EMAIL || undefined,
    metadata: { lead_id: lead.id, kind: "lead-followup" },
  });
  if (emailRes.ok) channels.push("email");

  // SMS path — only if Twilio is configured AND lead provided a phone.
  let smsSentTo: string | undefined;
  if (smsBody && lead.phone) {
    const smsRes = await sendSms({ to: lead.phone, body: smsBody });
    if (smsRes.ok) {
      channels.push("sms");
      smsSentTo = smsRes.sentTo;
    }
  }

  await store.updateLead(lead.id, {
    aiReply: {
      status: channels.length > 0 ? "sent" : "skipped",
      at: new Date().toISOString(),
      subject,
      body,
      smsBody,
      smsSentTo,
      channel: channels,
      model,
      estCostUsd: usedFallback ? undefined : estCostUsd,
      errorMessage: channels.length === 0 ? emailRes.errorMessage : undefined,
    },
  });
}

// Suppress unused-key warning while keeping schema documented inline.
void BODY_SCHEMA_KEYS;
