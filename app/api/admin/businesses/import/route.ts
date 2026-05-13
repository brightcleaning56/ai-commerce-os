import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { mapCsvToBusinesses, parseCsv } from "@/lib/businessImport";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/businesses/import â€” bulk CSV import.
 *
 * Body shape (JSON):
 *   { csv: string, defaultStatus?: BusinessStatus, defaultSource?: BusinessSource }
 *
 * The `csv` field is the raw CSV text (header row required). The handler:
 *   1. Parses the CSV (handles quotes, embedded commas/newlines, BOM, CRLF)
 *   2. Maps headers via lib/businessImport HEADER_MAP (forgiving synonyms)
 *   3. Per row: validates `name` is present, normalizes state/zip/email/website
 *   4. Bulk-upserts via store.bulkUpsertBusinesses (dedups on email or name+zip)
 *
 * Returns per-row results so the operator UI can show what was rejected
 * AND what was inserted vs updated.
 *
 * Hard cap: 50,000 rows per upload. Larger imports should be chunked
 * client-side. (Future Data Axle / Census slice will use a streaming
 * cron job instead of synchronous POST.)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { csv?: unknown; defaultStatus?: unknown; defaultSource?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const csvText = typeof body.csv === "string" ? body.csv : "";
  if (!csvText || csvText.trim().length < 10) {
    return NextResponse.json(
      { error: "csv field required (paste raw CSV including header row)" },
      { status: 400 },
    );
  }
  if (csvText.length > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "CSV too large (10MB hard cap). Chunk into smaller files." },
      { status: 413 },
    );
  }

  const parsed = parseCsv(csvText);
  if (parsed.length < 2) {
    return NextResponse.json(
      { error: "CSV needs a header row + at least one data row" },
      { status: 400 },
    );
  }
  if (parsed.length > 50_001) {
    return NextResponse.json(
      { error: "Too many rows (50k cap per upload). Chunk into smaller files." },
      { status: 413 },
    );
  }

  const results = mapCsvToBusinesses(parsed, {
    defaultStatus: typeof body.defaultStatus === "string" ? (body.defaultStatus as never) : undefined,
    defaultSource: typeof body.defaultSource === "string" ? (body.defaultSource as never) : undefined,
  });

  const validRows = results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
  const errors = results.filter((r): r is Extract<typeof r, { ok: false }> => !r.ok);

  const upsertResult = validRows.length > 0
    ? await store.bulkUpsertBusinesses(validRows.map((r) => r.row))
    : { inserted: 0, updated: 0, skipped: 0 };

  return NextResponse.json({
    ok: true,
    totalRows: parsed.length - 1,
    parsed: validRows.length,
    rejected: errors.length,
    inserted: upsertResult.inserted,
    updated: upsertResult.updated,
    skipped: upsertResult.skipped,
    // Cap error array to 50 to keep the response small. Operator can
    // inspect first batch and re-import after fixing the source CSV.
    errors: errors.slice(0, 50).map((e) => ({
      lineNumber: e.lineNumber,
      error: e.error,
    })),
    errorTruncated: errors.length > 50,
  });
}
