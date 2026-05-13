import { NextRequest, NextResponse } from "next/server";
import { getOperator } from "@/lib/operator";
import { sendEmail } from "@/lib/email";
import {
  supplierRegistry,
  type SupplierKind,
} from "@/lib/supplierRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/portal/signup — public supplier self-registration.
 *
 * This is the supplier-side entry point Eric's spec calls out:
 * "AI finds suppliers → AI sends outreach → Supplier joins platform".
 * It's the "Supplier joins platform" step, but kicked off by the
 * supplier themselves rather than via outreach.
 *
 * Anti-abuse layers (must be solid because this is public):
 *   1. Per-IP rate limit: 5 submissions per hour. In-memory; survives
 *      function warm window. Hard caps abuse without needing Redis.
 *   2. Honeypot field "company_url_2" — bots fill every input, real
 *      humans don't see this one because it's display:none. Filled =
 *      silent reject (return ok:true to not tip them off).
 *   3. Required-field validation. We don't try to validate the data
 *      itself (that's L1 verification's job once they're in).
 *   4. Email-domain duplicate check — if a pending or active supplier
 *      already has that email, return their existing status rather
 *      than creating a duplicate record.
 *
 * Outcome:
 *   - Creates a SupplierRecord with status="pending" and
 *     source="self-signup". Tier = "unverified".
 *   - Sends a confirmation email to the supplier.
 *   - Sends a notification email to the operator ("new supplier
 *     signup: <name>, review at /admin/suppliers").
 *   - DOES NOT auto-issue a portal token. Operator reviews and
 *     issues access on /admin/suppliers — that gates against abuse
 *     even if a bot squeaks past the rate limit + honeypot.
 */

const RATE_LIMIT = 5;                  // submissions per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const ipLog = new Map<string, number[]>();

const VALID_KINDS: SupplierKind[] = ["Manufacturer", "Wholesaler", "Distributor", "Dropship"];

function checkRateLimit(ip: string): { ok: boolean; resetIn?: number } {
  const now = Date.now();
  const log = ipLog.get(ip) ?? [];
  // Drop entries outside the window
  while (log.length && now - log[0] > RATE_WINDOW_MS) log.shift();
  if (log.length >= RATE_LIMIT) {
    return { ok: false, resetIn: Math.ceil((RATE_WINDOW_MS - (now - log[0])) / 1000) };
  }
  log.push(now);
  ipLog.set(ip, log);
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rate = checkRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json(
      { error: `Too many signups from this IP. Try again in ${Math.ceil((rate.resetIn ?? 60) / 60)} minutes.` },
      { status: 429 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Honeypot — real users don't see this field. Filled = bot. We
  // return a fake success so the bot doesn't realize it tripped a
  // filter and switch tactics.
  if (typeof body.company_url_2 === "string" && body.company_url_2.trim().length > 0) {
    console.warn(`[portal/signup] honeypot tripped from ip=${ip}`);
    return NextResponse.json({ ok: true, message: "Signup received. We'll be in touch." });
  }

  // Validate required fields. Cap lengths defensively.
  const legalName = typeof body.legalName === "string" ? body.legalName.trim().slice(0, 200) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const country = typeof body.country === "string" ? body.country.trim().toUpperCase().slice(0, 2) : "";
  const kind = typeof body.kind === "string" && VALID_KINDS.includes(body.kind as SupplierKind)
    ? (body.kind as SupplierKind)
    : null;

  if (!legalName) {
    return NextResponse.json({ error: "Legal company name is required" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email address is required" }, { status: 400 });
  }
  if (!country || country.length !== 2) {
    return NextResponse.json({ error: "Country (2-letter code) is required" }, { status: 400 });
  }
  if (!kind) {
    return NextResponse.json(
      { error: `Supplier kind must be one of ${VALID_KINDS.join(", ")}` },
      { status: 400 },
    );
  }

  // Duplicate check — already in the registry?
  const existing = (await supplierRegistry.list({ query: email })).find(
    (s) => s.email === email.toLowerCase(),
  );
  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyRegistered: true,
      message: `${email} is already registered. Status: ${existing.status}. The workspace owner will follow up.`,
      supplierId: existing.id,
    });
  }

  // Optional string fields. Cap lengths.
  const str = (k: string, max = 200): string | undefined => {
    const v = body[k];
    return typeof v === "string" ? v.trim().slice(0, max) || undefined : undefined;
  };

  const categories = Array.isArray(body.categories)
    ? body.categories
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  const supplier = await supplierRegistry.create({
    legalName,
    email,
    country,
    kind,
    categories,
    dbaName: str("dbaName"),
    website: str("website"),
    phone: str("phone", 40),
    state: str("state", 80),
    city: str("city", 80),
    address1: str("address1"),
    zip: str("zip", 20),
    status: "pending",
    source: "self-signup",
    internalNotes: `Self-signup from IP ${ip} at ${new Date().toISOString()}`,
  });

  // Confirmation email to the supplier (best-effort).
  const op = getOperator();
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com";
  await sendEmail({
    to: supplier.email,
    subject: `Thanks for registering with ${op.company || "AVYN Commerce"}`,
    textBody: [
      `Hi,`,
      ``,
      `Thanks for registering ${supplier.legalName} as a supplier on`,
      `${op.company || "AVYN Commerce"}. Your application is pending review.`,
      ``,
      `What happens next:`,
      `1. Our team reviews your application (typically within 1-2 business days).`,
      `2. We'll email you a portal sign-in link so you can upload verification`,
      `   documents (business license, tax cert, insurance, etc.).`,
      `3. Once verified, you'll be visible to buyers searching for ${kind.toLowerCase()}s`,
      `   in ${country}.`,
      ``,
      `Questions? Reply to this email.`,
      ``,
      `— The ${op.company || "AVYN Commerce"} team`,
    ].join("\n"),
    metadata: { kind: "supplier-signup-confirm", supplier_id: supplier.id },
  }).catch((err) => {
    console.warn("[portal/signup] supplier confirmation email failed:", err);
  });

  // Operator notification (best-effort).
  if (op.email) {
    await sendEmail({
      to: op.email,
      subject: `🏭 New supplier signup: ${supplier.legalName}`,
      textBody: [
        `${supplier.legalName} (${supplier.email}) just registered as a`,
        `self-signup supplier on AVYN Commerce.`,
        ``,
        `Kind: ${supplier.kind}`,
        `Location: ${supplier.city ? supplier.city + ", " : ""}${supplier.country}`,
        `Categories: ${supplier.categories.join(", ") || "(none)"}`,
        `Website: ${supplier.website || "(none provided)"}`,
        ``,
        `Review and issue portal access:`,
        `${origin}/admin/suppliers`,
        ``,
        `(Source IP ${ip})`,
      ].join("\n"),
      metadata: { kind: "supplier-signup-notify", supplier_id: supplier.id },
    }).catch((err) => {
      console.warn("[portal/signup] operator notification failed:", err);
    });
  }

  return NextResponse.json({
    ok: true,
    alreadyRegistered: false,
    message: "Signup received. We'll email you a portal sign-in link after review.",
    supplierId: supplier.id,
  });
}
