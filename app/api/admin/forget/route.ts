import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GDPR / "right to be forgotten" endpoint.
 *
 * Purges all data tied to a buyer email:
 *   - Outreach drafts to that email (and their threads)
 *   - Discovered-buyers entries with that email
 *   - Access log entries for the affected drafts' share-links
 *   - Revokes the affected named share-links so cached references return 410
 *
 * Does NOT touch pipeline-run snapshots beyond access-log filtering â€” those
 * snapshots store anonymized buyer summaries (no email is persisted there
 * in the first place).
 *
 * Request:
 *   POST /api/admin/forget
 *   Authorization: Bearer <ADMIN_TOKEN>
 *   { "email": "buyer@company.com", "confirm": true }
 *
 * Response:
 *   200 { drafts, threadMessages, discoveredBuyers, accessLogEntries }
 *
 * Caller MUST set "confirm": true. Otherwise 400. Defense against accidental
 * fat-finger purges via curl.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { email?: string; confirm?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.email || typeof body.email !== "string") {
    return NextResponse.json({ error: "Missing 'email' (string)" }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json(
      {
        error:
          "Missing 'confirm: true'. This is destructive and irreversible. Set { confirm: true } to proceed.",
      },
      { status: 400 },
    );
  }

  const result = await store.forgetBuyer(body.email);
  return NextResponse.json({
    ok: true,
    email: body.email,
    purged: result,
    note:
      "Pipeline-run snapshots are unchanged; they store anonymized summaries with no email. " +
      "Affected named share-links have been revoked.",
  });
}
