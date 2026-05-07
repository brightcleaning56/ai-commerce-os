import { NextResponse } from "next/server";
import { store, type StoredPipelineRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns a "what would the buyer see" preview WITHOUT minting a real link.
 * Used by the Outreach review UI before the user clicks Send, so they can
 * verify the recipient view doesn't accidentally leak anything.
 *
 * Differs from the public /api/share/[id]?t=... in three ways:
 *   1. No token validation — sender is already in the app
 *   2. Doesn't append to the access log (this is a dry-run)
 *   3. Always uses scope="recipient" (the scope a real send would mint at)
 *   4. Includes meta.filtered with what was stripped, so the UI can annotate
 *
 * Auth: open in the demo, same as the rest of the drafts API.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const draft = await store.getDraft(params.id);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  if (!draft.pipelineId) {
    return NextResponse.json(
      {
        error:
          "Draft has no parent pipeline run. Preview is only available for drafts created in slice-28+ pipeline runs.",
      },
      { status: 400 },
    );
  }
  const run = await store.getPipelineRun(draft.pipelineId);
  if (!run) {
    return NextResponse.json(
      { error: "Parent pipeline run not found (snapshot may have rotated)" },
      { status: 404 },
    );
  }

  const filtered = recipientView(run);
  return NextResponse.json({
    ok: true,
    pipelineId: run.id,
    label: `${draft.buyerCompany} (${draft.productName})`,
    scope: "recipient",
    preview: filtered.run,
    meta: {
      filtered: filtered.filtered,
      visible: filtered.visible,
    },
    // The body the buyer would actually receive (Claude original + appended URL placeholder)
    sampleEmailBody: `${draft.email.body}\n\n— View the full proposal: <link will be minted at send>`,
  });
}

/**
 * Mirror the recipient-scope filter from /api/share/[id]/route.ts so the preview
 * matches what the buyer actually sees. Keeping the logic colocated would have
 * been nicer but introduces a bigger refactor — for now the two paths share
 * the conceptual rule, with this function as a doc-anchor.
 */
function recipientView(run: StoredPipelineRun): {
  run: Omit<StoredPipelineRun, "accessLog" | "shareLinks" | "shareToken">;
  filtered: string[];
  visible: string[];
} {
  const { accessLog: _a, shareLinks: _l, shareToken: _t, ...rest } = run;
  const filtered: string[] = [];
  const visible: string[] = [];

  // Sensitive arrays we strip
  const stripped = {
    ...rest,
    buyerSummaries: [],
    draftSummaries: [],
    totals: {
      ...rest.totals,
      buyers: 0,
      drafts: 0,
    },
  };
  if (rest.buyerSummaries.length > 0) {
    filtered.push(`${rest.buyerSummaries.length} other buyer profiles`);
  }
  if (rest.draftSummaries.length > 0) {
    filtered.push(`${rest.draftSummaries.length} outreach drafts to other prospects`);
  }
  filtered.push("internal access log + share-link list (sender-only metadata)");

  if (rest.productSummaries.length > 0) {
    visible.push(`${rest.productSummaries.length} trending product${rest.productSummaries.length === 1 ? "" : "s"}`);
  }
  if (rest.supplierSummaries.length > 0) {
    visible.push(`${rest.supplierSummaries.length} supplier matches`);
  }
  if (rest.riskFlagSummaries.length > 0) {
    visible.push(`${rest.riskFlagSummaries.length} risk flag${rest.riskFlagSummaries.length === 1 ? "" : "s"}`);
  }
  visible.push("step timeline (no sensitive details)");

  return { run: stripped, filtered, visible };
}
