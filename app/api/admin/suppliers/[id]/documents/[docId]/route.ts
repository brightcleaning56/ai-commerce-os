import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { supplierDocs, type SupplierDocStatus } from "@/lib/supplierDocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: SupplierDocStatus[] = ["pending", "approved", "rejected"];

/**
 * GET /api/admin/suppliers/[id]/documents/[docId]
 *   Default: returns metadata only.
 *   With ?download=1: streams the binary back with the original
 *   filename + mime. Capability: leads:read.
 *
 * PATCH /api/admin/suppliers/[id]/documents/[docId]
 *   Review action — body { status: "approved" | "rejected" | "pending",
 *   reviewNotes?: string }. Capability: leads:write. Stamps
 *   reviewedAt + reviewedBy from the auth context.
 *
 * DELETE /api/admin/suppliers/[id]/documents/[docId]
 *   Remove. Capability: leads:write.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id, docId } = await params;
  const doc = await supplierDocs.get(docId);
  if (!doc || doc.supplierId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("download") === "1") {
    // Stream the file back. Convert base64 to bytes; set the right
    // content-disposition so the browser triggers a download.
    const bytes = Buffer.from(doc.contentBase64, "base64");
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": `attachment; filename="${doc.filename.replace(/"/g, "")}"`,
        "Content-Length": String(bytes.byteLength),
      },
    });
  }

  // Metadata only — never echo the content
  const { contentBase64: _content, ...meta } = doc;
  return NextResponse.json({ document: meta });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id, docId } = await params;
  const doc = await supplierDocs.get(docId);
  if (!doc || doc.supplierId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Parameters<typeof supplierDocs.update>[1] = {};
  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status as SupplierDocStatus)) {
    patch.status = body.status as SupplierDocStatus;
    const op = getOperator();
    const isOwner = auth.mode === "production" ? !auth.user : true;
    patch.reviewedBy = isOwner ? op.email : (auth.user?.email ?? "unknown");
    patch.reviewedAt = new Date().toISOString();
  }
  if (typeof body.reviewNotes === "string") {
    patch.reviewNotes = body.reviewNotes.slice(0, 1000);
  }
  if (typeof body.kind === "string") {
    patch.kind = body.kind as typeof doc.kind;
  }

  const updated = await supplierDocs.update(docId, patch);
  return NextResponse.json({ ok: true, document: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id, docId } = await params;
  const doc = await supplierDocs.get(docId);
  if (!doc || doc.supplierId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await supplierDocs.remove(docId);
  return NextResponse.json({ ok: true });
}
