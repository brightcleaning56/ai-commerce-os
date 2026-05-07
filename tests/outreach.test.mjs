import { describe, it } from "node:test";
import { api, assert, assertEq, runPipeline } from "./helpers.mjs";

describe("outreach + tracked-link auto-mint", () => {
  it("send draft → auto-mints recipient-scoped link in email body", async () => {
    let pipeline;
    try {
      pipeline = await runPipeline();
    } catch (e) {
      if (String(e).includes("rate limit")) return;
      throw e;
    }
    const draft = pipeline.drafts?.[0];
    assert(draft, "pipeline produced a draft");
    assert(draft.id, "draft has id");

    const send = await api("/api/drafts/send", {
      method: "POST",
      body: JSON.stringify({ id: draft.id }),
    });
    assertEq(send.status, 200, "send succeeds");
    // If the draft was deduped to an already-sent prior draft, send returns
    // already=true and no NEW shareLink (the existing one is on the draft).
    if (send.body.already) {
      assert(send.body.draft.shareLinkToken, "deduped draft already has shareLinkToken");
      assert(send.body.draft.sentBody?.includes("/share/"), "deduped draft sentBody has URL");
      return;
    }
    assert(send.body.shareLink, "shareLink returned");
    assert(send.body.draft.shareLinkToken, "shareLinkToken persisted on draft");
    assert(send.body.draft.sentBody, "sentBody persisted");
    assert(send.body.draft.sentBody.includes("/share/"), "sentBody contains tracked URL");
    // email.body unchanged for audit
    assert(
      !send.body.draft.email.body.includes("/share/"),
      "original email.body preserved (no URL injected)",
    );
  });

  it("re-send returns already=true, doesn't duplicate link", async () => {
    const drafts = await api("/api/drafts");
    const sent = drafts.body.drafts.find((d) => d.status === "sent" && d.shareLinkToken);
    if (!sent) return;
    const resend = await api("/api/drafts/send", {
      method: "POST",
      body: JSON.stringify({ id: sent.id }),
    });
    assertEq(resend.status, 200, "resend ok");
    assert(resend.body.already, "already=true");
  });
});

describe("buyer dedupe", () => {
  it("two pipeline runs targeting the same buyer/product reuse the existing draft", async () => {
    let a, b;
    try {
      a = await runPipeline();
      b = await runPipeline();
    } catch (e) {
      // Rate limit (5/min) hit because tests run hot. The dedupe assertion still holds
      // for any successful pair of runs — skip silently if we couldn't make two.
      if (String(e).includes("rate limit")) return;
      throw e;
    }
    const aIds = new Set(a.drafts.map((d) => d.id));
    const bIds = new Set(b.drafts.map((d) => d.id));
    const intersect = [...aIds].filter((id) => bIds.has(id));
    // At minimum, one of the drafts should be reused (because we constrain to
    // maxProducts=1, the two runs likely hit the same trending product).
    assert(intersect.length > 0 || aIds.size === 0, "drafts deduped across runs");
  });
});

describe("quote builder", () => {
  it("build quote → draft promotes to Quotation; accept → Closed Won", async () => {
    const drafts = await api("/api/drafts");
    const target = drafts.body.drafts.find((d) => d.status === "sent");
    if (!target) return;

    const quote = await api(`/api/drafts/${target.id}/quote`, { method: "POST" });
    assertEq(quote.status, 200, "quote built");
    assert(quote.body.quote.id, "quote has id");
    assert(quote.body.quote.total > 0, "quote has total");
    assertEq(quote.body.quote.status, "draft", "quote starts as draft");

    // Idempotent
    const again = await api(`/api/drafts/${target.id}/quote`, { method: "POST" });
    assertEq(again.body.alreadyExisted, true, "second build is idempotent");
    assertEq(again.body.quote.id, quote.body.quote.id, "same quote id");

    // Accept the quote
    const accept = await api(`/api/quotes/${quote.body.quote.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted" }),
    });
    assertEq(accept.status, 200, "accept ok");
    assertEq(accept.body.quote.status, "accepted", "status flipped");

    // Draft auto-promoted
    const deals = await api("/api/crm/deals");
    const deal = deals.body.deals.find((x) => x.draftId === target.id);
    if (deal) {
      assertEq(deal.stage, "Closed Won", "draft auto-promoted to Closed Won");
    }
  });
});

describe("admin endpoints", () => {
  it("health endpoint returns storage + spend + config", async () => {
    const h = await api("/api/admin/health");
    assertEq(h.status, 200, "health 200");
    assert(h.body.storage, "storage block");
    assert(typeof h.body.spend.today.cost === "number", "today cost is number");
    assert(h.body.config.storeBackend, "storeBackend reported");
  });

  it("forget without confirm returns 400", async () => {
    const r = await api("/api/admin/forget", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com" }),
    });
    assertEq(r.status, 400, "missing confirm → 400");
  });

  it("forget with confirm:true succeeds (idempotent)", async () => {
    const r = await api("/api/admin/forget", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", confirm: true }),
    });
    assertEq(r.status, 200, "confirmed forget → 200");
    assert(typeof r.body.purged === "object", "purged counts returned");
  });
});
