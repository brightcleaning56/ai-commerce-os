import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns whether the first-view webhook is configured. Does NOT return the
 * URL or secret — those are server-only and the dashboard only needs to know
 * "is it on?" + "is it signed?" to render its status indicator.
 */
export async function GET() {
  const url = process.env.SHARE_FIRSTVIEW_WEBHOOK_URL;
  const secret = process.env.SHARE_FIRSTVIEW_WEBHOOK_SECRET;
  // Mask the URL to its host for the indicator without leaking path/query secrets
  let host: string | null = null;
  if (url) {
    try {
      host = new URL(url).host;
    } catch {
      host = "configured";
    }
  }
  return NextResponse.json({
    configured: !!url,
    signed: !!secret,
    host,
  });
}
