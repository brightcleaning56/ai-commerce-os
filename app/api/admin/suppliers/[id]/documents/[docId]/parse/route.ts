import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { supplierRegistry } from "@/lib/supplierRegistry";
import { supplierDocs, type DocAIParseSummary } from "@/lib/supplierDocs";
import { parseSupplierDoc } from "@/lib/supplierDocAI";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision/PDF calls can take a while on multi-page docs.
export const maxDuration = 60;

/**
 * POST /api/admin/suppliers/[id]/documents/[docId]/parse
 *
 * Runs Claude over the document, extracts structured fields + red
 * flags + a recommendation (approve / reject / needs-review), and
 * caches the result on the SupplierDoc record so the operator UI
 * can show the AI's read without re-running.
 *
 * Capability: leads:write — runs an external API call that costs
 * money; gating it the same as creating a supplier.
 *
 * Returns the parse result whether it succeeded or failed. Failures
 * are still persisted on the doc (so the operator sees "no API key
 * configured" instead of an empty state).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id, docId } = await params;
  const supplier = await supplierRegistry.get(id);
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  const doc = await supplierDocs.get(docId);
  if (!doc || doc.supplierId !== id) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const result = await parseSupplierDoc({ doc, supplier });

  // Build the cached summary shape (mirrors DocAIParse without the
  // file payload). Cache failures too so the UI shows the reason.
  const summary: DocAIParseSummary = result.ok
    ? {
        ok: true,
        docKindGuess: result.docKindGuess,
        businessNameOnDoc: result.businessNameOnDoc,
        documentNumber: result.documentNumber,
        issueDate: result.issueDate,
        expiryDate: result.expiryDate,
        summary: result.summary,
        confidence: result.confidence,
        redFlags: result.redFlags,
        recommendation: result.recommendation,
        modelUsed: result.modelUsed,
        estCostUsd: result.estCostUsd,
        parsedAt: result.parsedAt,
      }
    : {
        ok: false,
        reason: result.reason,
        parsedAt: result.parsedAt,
      };

  const updated = await supplierDocs.update(docId, { aiParse: summary });

  return NextResponse.json({
    ok: true,
    parse: summary,
    document: updated,
  });
}
