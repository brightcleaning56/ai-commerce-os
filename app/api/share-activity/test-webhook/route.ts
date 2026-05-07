import { NextResponse } from "next/server";
import { fireFirstViewWebhook } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fires a synthetic first-view webhook with mock data.
 * Useful for verifying SHARE_FIRSTVIEW_WEBHOOK_URL receivers without waiting
 * for a real recipient to open a tracked link.
 *
 * No auth in the demo — same single-tenant assumption as the rest of the app.
 */
export async function POST() {
  const url = process.env.SHARE_FIRSTVIEW_WEBHOOK_URL;
  if (!url) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SHARE_FIRSTVIEW_WEBHOOK_URL is not set. Add it to .env.local and restart the dev server.",
      },
      { status: 400 },
    );
  }

  await fireFirstViewWebhook({
    event: "share.first_view",
    ts: new Date().toISOString(),
    pipelineId: "pl_test123",
    linkLabel: "TEST RECIPIENT — fired from /share-activity",
    linkToken: "0123456789abcdef0123456789",
    scope: "recipient",
    viewer: {
      ip: "127.0.0.1",
      userAgent: "AICommerceOS/test-webhook",
      referer: "",
    },
    dashboardUrl: process.env.NEXT_PUBLIC_APP_ORIGIN
      ? `${process.env.NEXT_PUBLIC_APP_ORIGIN}/share-activity`
      : "/share-activity",
  });

  return NextResponse.json({
    ok: true,
    message: "Synthetic first-view webhook fired. Check your receiver and the dev console for any errors.",
    target: url,
    signed: !!process.env.SHARE_FIRSTVIEW_WEBHOOK_SECRET,
  });
}
