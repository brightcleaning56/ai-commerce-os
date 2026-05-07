import { describe, it } from "node:test";
import { api, assert, assertEq, runPipeline, viewShare } from "./helpers.mjs";

describe("share-link governance", () => {
  it("mints a default token + recipient links + tracks views + revokes", async () => {
    // 1. Pipeline → default token
    const pipeline = await runPipeline({ shareTtlHours: 168 });
    assert(pipeline.pipelineId, "pipelineId returned");
    assert(pipeline.shareToken && pipeline.shareToken.length === 24, "default 24-char shareToken");
    const PID = pipeline.pipelineId;
    const DEFAULT = pipeline.shareToken;

    // 2. Default token → 200 with full scope
    const fullView = await viewShare(PID, DEFAULT);
    assertEq(fullView.status, 200, "default token → 200");
    assertEq(fullView.body.scope, "full", "default scope is full");

    // 3. Wrong token → 403
    const wrong = await viewShare(PID, "deadbeefdeadbeefdeadbeef");
    assertEq(wrong.status, 403, "wrong token → 403");

    // 4. Mint a named recipient link
    const minted = await api(`/api/share/${PID}/links?t=${DEFAULT}`, {
      method: "POST",
      body: JSON.stringify({ label: "Sarah @ Acme", ttlHours: 24 }),
    });
    assertEq(minted.status, 200, "mint succeeds");
    assertEq(minted.body.scope, "recipient", "named link defaults to recipient scope");
    const SARAH = minted.body.token;

    // 5. Sarah's link → recipient view, buyers/drafts stripped
    const recipientView = await viewShare(PID, SARAH);
    assertEq(recipientView.status, 200, "sarah token → 200");
    assertEq(recipientView.body.scope, "recipient", "scope=recipient");
    assertEq(recipientView.body.run.buyerSummaries.length, 0, "buyers stripped");
    assertEq(recipientView.body.run.draftSummaries.length, 0, "drafts stripped");
    assert(recipientView.body.run.productSummaries.length > 0, "products visible");

    // 6. Sarah can't read access log (only default token can)
    const sarahLogAttempt = await api(`/api/share/${PID}/access-log?t=${SARAH}`);
    assertEq(sarahLogAttempt.status, 403, "named token can't read log");

    // 7. Default token reads log, sees Sarah's view
    const log = await api(`/api/share/${PID}/access-log?t=${DEFAULT}`);
    assertEq(log.status, 200, "default token reads log");
    const sarahLink = log.body.links.find((l) => l.token === SARAH);
    assert(sarahLink, "sarah's link in log");
    assert(sarahLink.accessCount >= 1, "sarah's view counted");

    // 8. Revoke Sarah's link only
    const revoke = await api(`/api/share/${PID}/revoke?token=${SARAH}`, {
      method: "POST",
    });
    assertEq(revoke.status, 200, "revoke succeeds");
    assertEq(revoke.body.scope, "named", "scope=named");

    // 9. Sarah's link now 410
    const sarahAfter = await viewShare(PID, SARAH);
    assertEq(sarahAfter.status, 410, "revoked → 410");
    assertEq(sarahAfter.body.reason, "revoked", "reason=revoked");

    // 10. Default still 200 (per-link revoke)
    const defaultAfter = await viewShare(PID, DEFAULT);
    assertEq(defaultAfter.status, 200, "default unaffected");

    // 11. Public response strips accessLog + shareLinks
    assert(!("accessLog" in defaultAfter.body.run), "no accessLog leak");
    assert(!("shareLinks" in defaultAfter.body.run), "no shareLinks leak");
  });

  it("garbage scope falls back to recipient (defense in depth)", async () => {
    let pipeline;
    try {
      pipeline = await runPipeline();
    } catch (e) {
      if (String(e).includes("rate limit")) return;
      throw e;
    }
    const minted = await api(`/api/share/${pipeline.pipelineId}/links?t=${pipeline.shareToken}`, {
      method: "POST",
      body: JSON.stringify({ label: "Garbage", ttlHours: 1, scope: "admin" }),
    });
    assertEq(minted.status, 200, "mint with garbage scope still succeeds");
    assertEq(minted.body.scope, "recipient", "garbage scope coerced to recipient");
  });

  it("missing label returns 400", async () => {
    let pipeline;
    try {
      pipeline = await runPipeline();
    } catch (e) {
      if (String(e).includes("rate limit")) return;
      throw e;
    }
    const minted = await api(`/api/share/${pipeline.pipelineId}/links?t=${pipeline.shareToken}`, {
      method: "POST",
      body: JSON.stringify({ ttlHours: 24 }),
    });
    assertEq(minted.status, 400, "missing label → 400");
  });
});
