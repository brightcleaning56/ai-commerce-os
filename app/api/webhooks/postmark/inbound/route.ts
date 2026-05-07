import { NextRequest, NextResponse } from "next/server";
import { processInbound } from "@/lib/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Postmark Inbound webhook.
 *
 * In Postmark dashboard:
 *   Servers → your server → Inbound stream → Settings
 *     - Webhook URL: https://YOUR-DOMAIN/api/webhooks/postmark/inbound
 *     - (optional) Basic Auth username + password
 *
 * Set the same Basic Auth in env vars:
 *   POSTMARK_INBOUND_USER
 *   POSTMARK_INBOUND_PASSWORD
 *
 * Without those env vars, all requests are accepted — useful for local
 * testing through ngrok / curl, but you should set them in production.
 */
export async function POST(req: NextRequest) {
  // Auth — Basic if env vars are set
  const expectedUser = process.env.POSTMARK_INBOUND_USER;
  const expectedPass = process.env.POSTMARK_INBOUND_PASSWORD;
  if (expectedUser || expectedPass) {
    const auth = req.headers.get("authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return NextResponse.json({ error: "Missing Basic auth" }, { status: 401 });
    }
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
    const [user, pass] = decoded.split(":");
    if (user !== expectedUser || pass !== expectedPass) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromEmail =
    payload?.FromFull?.Email || payload?.From || payload?.FromEmail || "";
  const fromName =
    payload?.FromFull?.Name || payload?.FromName || undefined;
  const subject = payload?.Subject || "";
  const textBody = payload?.TextBody || payload?.HtmlBody || "";
  const headers: Array<{ Name: string; Value: string }> = payload?.Headers || [];
  const inReplyTo = headers.find(
    (h) => h.Name?.toLowerCase() === "in-reply-to"
  )?.Value;

  if (!fromEmail || !textBody) {
    return NextResponse.json(
      { error: "Inbound payload missing From/TextBody", payload: redactPayload(payload) },
      { status: 400 }
    );
  }

  try {
    const result = await processInbound({
      fromEmail,
      fromName,
      subject,
      textBody,
      inReplyToMessageId: inReplyTo,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 202 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Inbound processing failed" },
      { status: 500 }
    );
  }
}

function redactPayload(p: any) {
  if (!p) return p;
  // Only echo top-level shape so we don't dump message bodies into error responses
  return {
    From: p?.From,
    Subject: p?.Subject,
    To: p?.To,
    HasTextBody: typeof p?.TextBody === "string",
    HasHeaders: Array.isArray(p?.Headers),
  };
}
