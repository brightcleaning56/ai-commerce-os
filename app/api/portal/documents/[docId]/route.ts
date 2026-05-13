import { NextRequest, NextResponse } from "next/server";
import { requireSupplier } from "@/lib/auth";
import { supplierDocs } from "@/lib/supplierDocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/portal/documents/[docId]
 *   Metadata-only by default; ?download=1 streams the binary.
 *
 * DELETE /api/portal/documents/[docId]
 *   Supplier can delete their own pending docs. Approved/rejected docs
 *   can't be deleted from the portal — owner has to manage them via
 *   /admin/suppliers (audit trail integrity).
 *
 * Both endpoints verify the doc belongs to auth.supplierId.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const auth = await requireSupplier(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { docId } = await params;
  const doc = await supplierDocs.get(docId);
  if (!doc || doc.supplierId !== auth.supplierId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("download") === "1") {
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

  const { contentBase64: _content, ...meta } = doc;
  return NextResponse.json({ document: meta });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const auth = await requireSupplier(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { docId } = await params;
  const doc = await supplierDocs.get(docId);
  if (!doc || doc.supplierId !== auth.supplierId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json(
      {
        error: `Cannot delete a ${doc.status} document from the portal — ask the workspace owner to remove it on their end.`,
      },
      { status: 403 },
    );
  }
  await supplierDocs.remove(docId);
  return NextResponse.json({ ok: true });
}
