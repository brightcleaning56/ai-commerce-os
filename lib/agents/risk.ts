import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_CHEAP, recordSpend } from "@/lib/anthropic";
import { store, type AgentRun, type DiscoveredBuyer, type DiscoveredSupplier, type RiskFlag } from "@/lib/store";

const RISK_TOOL = {
  name: "report_risk_flags",
  description:
    "Evaluate the input list of suppliers and buyers and return any risk flags worth surfacing to the operator. Only flag entities with concrete signals — don't manufacture risk.",
  input_schema: {
    type: "object" as const,
    properties: {
      flags: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              enum: ["Critical", "High", "Medium", "Low"],
            },
            category: {
              type: "string",
              enum: [
                "Supplier Fraud",
                "Buyer Fraud",
                "Trademark",
                "Restricted Product",
                "Payment",
                "Compliance",
              ],
            },
            subjectType: {
              type: "string",
              enum: ["supplier", "buyer", "product", "general"],
            },
            subjectId: { type: "string", description: "ID of the supplier/buyer being flagged (if subjectType is supplier or buyer)" },
            subjectName: { type: "string" },
            title: { type: "string", description: "Short headline (≤ 70 chars)" },
            detail: { type: "string", description: "1-2 sentences citing the concrete signal" },
            recommended: { type: "string", description: "1 sentence recommendation for the operator" },
          },
          required: ["severity", "category", "subjectType", "title", "detail", "recommended"],
        },
      },
    },
    required: ["flags"],
  },
};

type RiskToolPayload = {
  flags: Array<{
    severity: RiskFlag["severity"];
    category: RiskFlag["category"];
    subjectType: RiskFlag["subjectType"];
    subjectId?: string;
    subjectName?: string;
    title: string;
    detail: string;
    recommended: string;
  }>;
};

function buildPrompt(input: { suppliers: DiscoveredSupplier[]; buyers: DiscoveredBuyer[] }) {
  const supplierBlock = input.suppliers.length
    ? input.suppliers
        .slice(0, 12)
        .map(
          (s) =>
            `- [${s.id}] ${s.name} (${s.type}, ${s.country}) · risk ${s.riskScore} · verified: ${s.verified} · years active: ${s.yearsActive} · certs: ${s.certifications.join(", ") || "none"}${
              s.fraudFlags?.length ? ` · existing flags: ${s.fraudFlags.join("; ")}` : ""
            }`
        )
        .join("\n")
    : "(no suppliers)";

  const buyerBlock = input.buyers.length
    ? input.buyers
        .slice(0, 12)
        .map(
          (b) =>
            `- [${b.id}] ${b.company} (${b.type}, ${b.location}) · intent ${b.intentScore} · revenue ${b.revenue} · for product: ${b.forProduct}`
        )
        .join("\n")
    : "(no buyers)";

  return `You are the Risk Agent in an AI commerce operating system. Review the suppliers and buyers below and surface any concrete risk signals that an operator should act on TODAY. Only flag entities with real signals — don't manufacture risk to fill quota. If everything looks clean, return an empty flags array.

## Suppliers
${supplierBlock}

## Buyers
${buyerBlock}

## Categories
- Supplier Fraud: scammy domain, unverified, fraud flags, missing certs for category, abnormally low price, abnormally short years-active
- Buyer Fraud: revenue/employee mismatch, suspicious purchasing pattern, location red flags
- Trademark: product name might infringe a real trademark
- Restricted Product: regulated category needing certification we don't see (FDA for ingestibles, FCC for radio devices, CPSIA for kids)
- Payment: payment terms / financing / chargeback risk
- Compliance: ad/copy compliance, GDPR/CAN-SPAM, geographic restriction

For each flag:
- subjectType: which entity it's about
- subjectId / subjectName: include the entity ID if specific
- severity:
  - Critical = stop work immediately
  - High = require approval before proceeding
  - Medium = require human review when convenient
  - Low = informational, log and continue
- detail: cite the specific signal (e.g. "supplier riskScore 72, unverified, fraud flags include domain registered <6 months ago")
- recommended: one specific action

Call the report_risk_flags tool. Return 0–6 flags total (only the most actionable).`;
}

function fakeFlags(input: { suppliers: DiscoveredSupplier[]; buyers: DiscoveredBuyer[] }): RiskToolPayload {
  const flags: RiskToolPayload["flags"] = [];

  // Flag any supplier with riskScore >= 60 or unverified-with-low-years
  for (const s of input.suppliers) {
    if (s.riskScore >= 60) {
      flags.push({
        severity: s.riskScore >= 75 ? "Critical" : "High",
        category: "Supplier Fraud",
        subjectType: "supplier",
        subjectId: s.id,
        subjectName: s.name,
        title: `${s.name} flagged as high-risk supplier`,
        detail: `Supplier risk score ${s.riskScore}/100${s.verified ? "" : ", unverified"}${
          s.fraudFlags.length ? `; flags include: ${s.fraudFlags.slice(0, 2).join(", ")}` : ""
        }.`,
        recommended:
          "Pause outreach to this supplier. Require sample order with escrow before any volume order; verify factory address via video call.",
      });
    } else if (!s.verified && s.yearsActive < 2) {
      flags.push({
        severity: "Medium",
        category: "Supplier Fraud",
        subjectType: "supplier",
        subjectId: s.id,
        subjectName: s.name,
        title: `${s.name} unverified · only ${s.yearsActive}y active`,
        detail: `Supplier has not been third-party verified and the operating history is short (${s.yearsActive}y). Combined with no public certs, this warrants caution.`,
        recommended: "Move to backup supplier list until verification documents arrive. Don't place volume orders.",
      });
    }
  }

  // Flag if no FDA cert but product hints at ingestible/skincare
  for (const s of input.suppliers) {
    const cat = s.matchedProducts.join(" ").toLowerCase();
    if (
      (cat.includes("blender") || cat.includes("water") || cat.includes("food") || cat.includes("eye mask")) &&
      !s.certifications.includes("FDA")
    ) {
      flags.push({
        severity: "Medium",
        category: "Restricted Product",
        subjectType: "supplier",
        subjectId: s.id,
        subjectName: s.name,
        title: `${s.name}: missing FDA cert for product category`,
        detail: `Supplier has no FDA certification on file but the matched product (${s.matchedProducts[0]}) implies food/health contact. US-bound shipments may be held.`,
        recommended: "Request FDA registration documents from supplier before placing the first US-bound order.",
      });
      break; // one flag of this kind is enough
    }
  }

  // Optional: a Trademark flag if a product name has classic infringement-prone words
  const products = input.suppliers.map((s) => s.matchedProducts.join(" ")).join(" ").toLowerCase();
  if (/(magsafe|airpod|tesla|apple|nike|disney)/.test(products)) {
    flags.push({
      severity: "High",
      category: "Trademark",
      subjectType: "product",
      title: "Possible trademark infringement in matched product names",
      detail: "One or more matched products use brand-adjacent terms that may trigger USPTO opposition or marketplace takedowns.",
      recommended: "Rename SKUs to brand-neutral language before publishing listings or running ads.",
    });
  }

  return { flags: flags.slice(0, 6) };
}

export async function runRisk(): Promise<AgentRun> {
  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  // Pull the most recent discovered suppliers + buyers as input
  const allSuppliers = await store.getDiscoveredSuppliers();
  const allBuyers = await store.getDiscoveredBuyers();
  const recentSuppliers = allSuppliers.slice(0, 12);
  const recentBuyers = allBuyers.slice(0, 12);

  let payload: RiskToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let status: "success" | "error" = "success";

  try {
    if (!client || (recentSuppliers.length === 0 && recentBuyers.length === 0)) {
      payload = fakeFlags({ suppliers: recentSuppliers, buyers: recentBuyers });
    } else {
      await checkSpendBudget();
      const res = await client.messages.create({
        model: MODEL_CHEAP,
        max_tokens: 2000,
        tools: [RISK_TOOL],
        tool_choice: { type: "tool", name: RISK_TOOL.name },
        messages: [
          {
            role: "user",
            content: buildPrompt({ suppliers: recentSuppliers, buyers: recentBuyers }),
          },
        ],
      });
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({ agent: "risk", cost: estimateCost(MODEL_CHEAP, inputTokens, outputTokens) });
      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as RiskToolPayload;
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fakeFlags({ suppliers: recentSuppliers, buyers: recentBuyers });
  }

  const finishedAt = new Date();
  const createdAt = finishedAt.toISOString();

  const flags: RiskFlag[] = payload.flags.map((f, i) => ({
    id: `${runId}_f${i + 1}`,
    source: "agent",
    agent: "risk",
    runId,
    createdAt,
    severity: f.severity,
    category: f.category,
    subjectType: f.subjectType,
    subjectId: f.subjectId,
    subjectName: f.subjectName,
    title: f.title,
    detail: f.detail,
    recommended: f.recommended,
  }));

  if (status === "success") {
    await store.saveRiskFlags(flags);
  }

  const run: AgentRun = {
    id: runId,
    agent: "risk",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status,
    inputCategory: null,
    productCount: 0,
    buyerCount: recentBuyers.length,
    supplierCount: recentSuppliers.length,
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_CHEAP,
    inputTokens: usedFallback ? undefined : inputTokens,
    outputTokens: usedFallback ? undefined : outputTokens,
    estCostUsd: usedFallback ? undefined : estimateCost(MODEL_CHEAP, inputTokens, outputTokens),
    usedFallback,
    errorMessage,
  };
  await store.saveRun(run);
  return run;
}
