import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getDocument } from "@/lib/onboardingVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/onboarding-sessions/[id]/document?kind=businessLicense
 *
 * Operator-side document retrieval. Returns the binary inline so the
 * browser can render PDFs / images directly in the detail view.
 *
 * Capability: users:read -- same gate as session reads.
 *
 * Why a separate route from /api/onboarding/documents (which is
 * cookie-driven for the session owner): the session-owner cookie is
 * the visitor's cookie, not the operator's. The admin needs to read
 * docs uploaded by ANY session, gated by the admin token instead.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "users:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("kind");
  if (!kind) return NextResponse.json({ error: "kind required" }, { status: 400 });

  const doc = await getDocument({ sessionId: id, kind });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Decode the base64 + serve as the original content type. Inline
  // disposition so PDFs/images render in the browser; operator can
  // still right-click "save as".
  const buf = Buffer.from(doc.base64, "base64");
  // Build a fresh ArrayBuffer copy so the response body type accepts
  // it (Buffer-backed slices have ArrayBufferLike, not ArrayBuffer).
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return new NextResponse(ab, {
    status: 200,
    headers: {
      "Content-Type": doc.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
