import { NextRequest, NextResponse } from "next/server";
import {
  listDocumentsForSession,
  removeDocument,
  saveDocument,
} from "@/lib/onboardingVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    /api/onboarding/documents      list metadata for the cookie session
 * POST   /api/onboarding/documents      upload a document
 *   Body: multipart/form-data with fields:
 *     kind:     question id, e.g. "businessLicense"
 *     file:     the file blob
 *   2 MB cap. Replaces any prior upload for the same (session, kind).
 * DELETE /api/onboarding/documents      remove an uploaded document
 *   Body: { kind: string }
 *
 * Cookie-driven (avyn_onboarding). No public fetch -- only the session
 * owner can list / upload / delete via their own cookie.
 */

function readSessionId(req: NextRequest): string | null {
  return req.cookies.get("avyn_onboarding")?.value ?? null;
}

export async function GET(req: NextRequest) {
  const sessionId = readSessionId(req);
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 404 });
  const docs = await listDocumentsForSession(sessionId);
  return NextResponse.json({ documents: docs });
}

export async function POST(req: NextRequest) {
  const sessionId = readSessionId(req);
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 404 });

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Use multipart/form-data" }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Bad form data" }, { status: 400 });

  const kind = (form.get("kind") as string | null)?.trim();
  const file = form.get("file");
  if (!kind) return NextResponse.json({ error: "kind required" }, { status: 400 });
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  // Buffer the file + base64-encode. 2 MB cap is enforced by saveDocument.
  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");
  const r = await saveDocument({
    sessionId,
    kind,
    filename: file.name || "upload.bin",
    contentType: file.type || "application/octet-stream",
    base64,
  });
  if (!r.ok) return NextResponse.json(r, { status: 413 });
  // Strip base64 from the response -- client doesn't need it back
  const meta = r.document
    ? {
        sessionId: r.document.sessionId,
        kind: r.document.kind,
        filename: r.document.filename,
        contentType: r.document.contentType,
        sizeBytes: r.document.sizeBytes,
        uploadedAt: r.document.uploadedAt,
      }
    : null;
  return NextResponse.json({ ok: true, document: meta });
}

export async function DELETE(req: NextRequest) {
  const sessionId = readSessionId(req);
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 404 });
  let body: { kind?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.kind) return NextResponse.json({ error: "kind required" }, { status: 400 });
  const removed = await removeDocument({ sessionId, kind: body.kind });
  return NextResponse.json({ ok: true, removed });
}
