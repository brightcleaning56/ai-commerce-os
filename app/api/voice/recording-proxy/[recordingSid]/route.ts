import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { listVoiceRecordings } from "@/lib/voiceRecordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/voice/recording-proxy/[recordingSid] â€” admin-only.
 *
 * Streams a Twilio-hosted .mp3 recording through our origin so the
 * browser <audio> tag can play it. Twilio's recording URLs require
 * HTTP Basic Auth (Account SID : Auth Token) which the <audio> tag
 * can't supply -- so we fetch server-side with the credentials and
 * pipe the audio back.
 *
 * Validates the recordingSid against our recording store before
 * proxying so we don't become an open Twilio recording fetcher
 * (anyone with an admin token couldn't fetch arbitrary recordings,
 * only those we ourselves recorded).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ recordingSid: string }> },
) {
  const auth = await requireCapability(req, "voice:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { recordingSid } = await params;
  if (!recordingSid || !/^RE[a-f0-9]{32}$/i.test(recordingSid)) {
    return NextResponse.json({ error: "Invalid recording sid" }, { status: 400 });
  }

  // Make sure this sid was actually written by our recording-status
  // webhook -- prevents using this endpoint to fetch arbitrary Twilio
  // recordings on other accounts.
  const all = await listVoiceRecordings();
  const rec = all.find((r) => r.recordingSid === recordingSid);
  if (!rec) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json(
      { error: "Twilio credentials missing on server" },
      { status: 503 },
    );
  }

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const upstream = await fetch(rec.recordingUrl, {
    headers: { Authorization: `Basic ${basicAuth}` },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Twilio fetch failed: ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  // Stream the body back. Browser's <audio> tag handles range requests
  // natively if Twilio provides them; we just pass through.
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      // Hint download filename if the operator opens in a new tab
      "Content-Disposition": `inline; filename="call-${recordingSid}.mp3"`,
    },
  });
}
