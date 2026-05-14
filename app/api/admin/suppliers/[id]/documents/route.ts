import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import {
  DOC_KIND_LABEL,
  MAX_BYTES,
  supplierDocs,
  type SupplierDocKind,
} from "@/lib/supplierDocs";
import { supplierRegistry } from "@/lib/supplierRegistry";
import { autoParseDocInBackground } from "@/lib/supplierDocAI";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Max body size guard — Netlify functions cap at ~6MB; we cap docs at
// 4MB so the form encoding overhead still fits under that limit.
export const maxDuration = 30;

const VALID_KINDS: SupplierDocKind[] = Object.keys(DOC_KIND_LABEL) as SupplierDocKind[];

/**
 * GET /api/admin/suppliers/[id]/documents
 *   List all documents uploaded for this supplier (metadata only —
 *   content is omitted to keep responses small).
 *   Capability: leads:read.
 *
 * POST /api/admin/suppliers/[id]/documents
 *   Upload a new document. multipart/form-data with fields:
 *     file: the binary
 *     kind: SupplierDocKind (required)
 *   Capability: leads:write.
 *   Body size capped at 4MB (MAX_BYTES). Files larger reject 413.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const supplier = await supplierRegistry.get(id);
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  const docs = await supplierDocs.listForSupplier(id);
  return NextResponse.json({ documents: docs, count: docs.length });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const supplier = await supplierRegistry.get(id);
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file");
  const kindRaw = form.get("kind");

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file field is required" }, { status: 400 });
  }
  if (typeof kindRaw !== "string" || !VALID_KINDS.includes(kindRaw as SupplierDocKind)) {
    return NextResponse.json(
      { error: `kind must be one of ${VALID_KINDS.join(", ")}` },
      { status: 400 },
    );
  }
  const kind = kindRaw as SupplierDocKind;

  // Read once into a Buffer so we can both measure + base64-encode.
  const arrayBuffer = await file.arrayBuffer();
  const sizeBytes = arrayBuffer.byteLength;
  if (sizeBytes > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large: ${sizeBytes} bytes (max ${MAX_BYTES})` },
      { status: 413 },
    );
  }
  const contentBase64 = Buffer.from(arrayBuffer).toString("base64");

  // Resolve uploader email — Owner uses operator email, per-user
  // tokens use their auth.user.email. Stored on the doc for the audit
  // trail.
  const op = getOperator();
  const isOwner = auth.mode === "production" ? !auth.user : true;
  const uploadedBy = isOwner ? op.email : (auth.user?.email ?? "unknown");

  const filename = "name" in file && typeof (file as { name?: string }).name === "string"
    ? (file as { name?: string }).name ?? "upload"
    : "upload";
  const mime = file.type || "application/octet-stream";

  const doc = await supplierDocs.create({
    supplierId: id,
    kind,
    filename,
    mime,
    sizeBytes,
    contentBase64,
    uploadedBy,
  });

  // Auto-parse with Claude in the background — doesn't block the
  // upload response. The parse result lands on the doc record when
  // ready; the next /documents GET picks it up. Skips silently on
  // unsupported MIME / no API key / over budget.
  autoParseDocInBackground({ docId: doc.id, supplierId: id });

  return NextResponse.json({ ok: true, document: doc });
}
