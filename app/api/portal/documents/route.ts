import { NextRequest, NextResponse } from "next/server";
import { requireSupplier } from "@/lib/auth";
import {
  DOC_KIND_LABEL,
  MAX_BYTES,
  supplierDocs,
  type SupplierDocKind,
} from "@/lib/supplierDocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_KINDS: SupplierDocKind[] = Object.keys(DOC_KIND_LABEL) as SupplierDocKind[];

/**
 * GET /api/portal/documents — list documents for the supplier behind
 * the current /portal session.
 *
 * POST /api/portal/documents — supplier uploads a new document.
 * multipart/form-data with `file` + `kind`. 4MB cap. Newly uploaded
 * docs land in `pending` and need owner approval before they count
 * toward L2.
 *
 * Both endpoints are scoped to auth.supplierId from the session token.
 * Suppliers cannot read or write other suppliers' docs.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSupplier(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const docs = await supplierDocs.listForSupplier(auth.supplierId);
  return NextResponse.json({ documents: docs, count: docs.length });
}

export async function POST(req: NextRequest) {
  const auth = await requireSupplier(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

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

  const arrayBuffer = await file.arrayBuffer();
  const sizeBytes = arrayBuffer.byteLength;
  if (sizeBytes > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large: ${sizeBytes} bytes (max ${MAX_BYTES})` },
      { status: 413 },
    );
  }
  const contentBase64 = Buffer.from(arrayBuffer).toString("base64");

  const filename = "name" in file && typeof (file as { name?: string }).name === "string"
    ? (file as { name?: string }).name ?? "upload"
    : "upload";
  const mime = file.type || "application/octet-stream";

  const doc = await supplierDocs.create({
    supplierId: auth.supplierId,
    kind,
    filename,
    mime,
    sizeBytes,
    contentBase64,
    uploadedBy: auth.email,
  });
  return NextResponse.json({ ok: true, document: doc });
}
