/**
 * AI Document Parser — Claude grades uploaded supplier documents.
 *
 * Turns L2 from "operator clicks Approve on every PDF" into "Claude
 * extracts what the doc actually is + flags inconsistencies; operator
 * reviews + overrides when needed".
 *
 * Inputs to Claude:
 *   - The supplier's claimed legal name (so Claude can flag a mismatch
 *     between the doc and what the supplier said about themselves)
 *   - The doc's claimed kind from the upload form (business-license vs
 *     insurance vs etc.) — so Claude can confirm or contradict it
 *   - The actual file bytes (image or PDF), passed as a vision/document
 *     content block
 *
 * Output (structured tool-use):
 *   - docKindGuess: what kind of document this actually IS (Claude can
 *     contradict the upload form, e.g. operator labeled it "business
 *     license" but it's actually a utility bill)
 *   - businessNameOnDoc: the name printed on the document
 *   - documentNumber, issueDate, expiryDate: extracted when present
 *   - summary: 1-2 sentence operator-readable description
 *   - confidence: 0-100 self-rating of the extraction
 *   - redFlags: array of specific problems (name mismatch, expired,
 *     wrong document type, illegible, suspicious metadata, etc.)
 *   - recommendation: "approve" | "reject" | "needs-review" — the AI's
 *     suggested next action; operator can override
 *
 * Cost: Haiku vision is ~$0.002-0.005 per page depending on image
 * resolution. PDFs cost per page they contain. Budget gate prevents
 * runaway spend.
 *
 * Falls back gracefully when:
 *   - No ANTHROPIC_API_KEY configured → returns ok:false with reason
 *   - Daily budget exceeded → returns ok:false with reason
 *   - Claude returns malformed output → returns ok:false with reason
 *   - Unsupported MIME → returns ok:false with reason
 */
import {
  callClaudeWithBudget,
  getAnthropicClient,
  MODEL_CHEAP,
  SpendBudgetExceededError,
} from "./anthropic";
import { DOC_KIND_LABEL, type SupplierDoc, type SupplierDocKind } from "./supplierDocs";
import type { SupplierRecord } from "./supplierRegistry";

export type DocParseRecommendation = "approve" | "reject" | "needs-review";

export type DocAIParse = {
  ok: true;
  docKindGuess: SupplierDocKind;
  businessNameOnDoc?: string;
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  summary: string;
  confidence: number;       // 0-100
  redFlags: string[];
  recommendation: DocParseRecommendation;
  modelUsed: string;
  estCostUsd?: number;
  parsedAt: string;
};

export type DocAIParseFailure = {
  ok: false;
  reason: string;
  parsedAt: string;
};

export type DocAIParseResult = DocAIParse | DocAIParseFailure;

const SUPPORTED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const SUPPORTED_PDF_MIME = "application/pdf";

const VALID_KINDS = Object.keys(DOC_KIND_LABEL) as SupplierDocKind[];

const DOC_PARSE_TOOL = {
  name: "report_doc_analysis",
  description:
    "Extract structured fields from the supplier document image/PDF. Be conservative: if you can't read a field, omit it. If the supplier name on the doc doesn't match the claimed name, add a red flag — do NOT silently 'fix' it.",
  input_schema: {
    type: "object" as const,
    properties: {
      docKindGuess: {
        type: "string",
        enum: VALID_KINDS,
        description: "What kind of document this ACTUALLY is, based on what you can read. May differ from the kind the operator labeled it with.",
      },
      businessNameOnDoc: {
        type: "string",
        description: "Legal name printed on the document, exactly as it appears. Empty if unreadable.",
      },
      documentNumber: {
        type: "string",
        description: "License / certificate / tax / EIN number visible on the document. Empty if none.",
      },
      issueDate: {
        type: "string",
        description: "Issue date in ISO YYYY-MM-DD format if a date is visible. Empty otherwise.",
      },
      expiryDate: {
        type: "string",
        description: "Expiration date in ISO YYYY-MM-DD format if a date is visible. Empty otherwise.",
      },
      summary: {
        type: "string",
        description: "1-2 sentence operator-readable description of what this document is and who it's for.",
      },
      confidence: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "0-100 self-rating of how reliable your extraction is. Low for blurry/partial documents.",
      },
      redFlags: {
        type: "array",
        items: { type: "string" },
        maxItems: 8,
        description:
          "Specific problems you can see: name doesn't match claimed supplier, document expired, wrong document type, illegible, watermark/template-looking, suspicious metadata, image clearly Photoshopped, etc. Empty if no problems.",
      },
      recommendation: {
        type: "string",
        enum: ["approve", "reject", "needs-review"],
        description:
          "approve = clean document matching the supplier; reject = clear problem (wrong type, expired, name mismatch); needs-review = uncertain or partial info.",
      },
    },
    required: ["docKindGuess", "summary", "confidence", "redFlags", "recommendation"],
  },
};

/**
 * Run Claude over a single supplier document. Returns either a
 * structured parse OR a failure with reason. Caller persists the
 * result on the SupplierDoc record.
 */
export async function parseSupplierDoc(input: {
  doc: SupplierDoc;
  supplier: SupplierRecord;
}): Promise<DocAIParseResult> {
  const parsedAt = new Date().toISOString();
  const client = getAnthropicClient();
  if (!client) {
    return {
      ok: false,
      reason: "ANTHROPIC_API_KEY not configured — AI parsing disabled",
      parsedAt,
    };
  }

  const mime = input.doc.mime.toLowerCase();
  const isImage = SUPPORTED_IMAGE_MIME.has(mime);
  const isPdf = mime === SUPPORTED_PDF_MIME;
  if (!isImage && !isPdf) {
    return {
      ok: false,
      reason: `Unsupported MIME type for AI parsing: ${mime}. Supported: image/jpeg, image/png, image/gif, image/webp, application/pdf.`,
      parsedAt,
    };
  }

  const claimedKindLabel = DOC_KIND_LABEL[input.doc.kind] ?? input.doc.kind;

  const textPrompt = [
    `You are analyzing a supplier verification document.`,
    ``,
    `Supplier registry record:`,
    `  Legal name:  ${input.supplier.legalName}`,
    input.supplier.dbaName ? `  DBA:         ${input.supplier.dbaName}` : "",
    `  Country:     ${input.supplier.country}${input.supplier.state ? `, state ${input.supplier.state}` : ""}`,
    `  Kind:        ${input.supplier.kind}`,
    `  Website:     ${input.supplier.website ?? "(not provided)"}`,
    ``,
    `Operator labeled this document as: "${claimedKindLabel}"`,
    ``,
    `Inspect the document. Extract the fields the tool defines. Flag any`,
    `inconsistency between what's on the doc and the supplier's claimed`,
    `identity — name mismatches, wrong document type, expiration, low`,
    `image quality, suspicious editing, etc.`,
    ``,
    `Be conservative on confidence. If the document is blurry, partial,`,
    `cropped, or you can't read key fields, drop confidence below 60`,
    `and recommend "needs-review".`,
  ].filter(Boolean).join("\n");

  // Build the content block array. Image vs document have different
  // shapes in the Anthropic SDK; both wrap base64 + media_type.
  type ContentBlock =
    | { type: "text"; text: string }
    | {
        type: "image";
        source: { type: "base64"; media_type: string; data: string };
      }
    | {
        type: "document";
        source: { type: "base64"; media_type: "application/pdf"; data: string };
      };

  const contentBlocks: ContentBlock[] = [];
  if (isImage) {
    contentBlocks.push({
      type: "image",
      source: { type: "base64", media_type: mime, data: input.doc.contentBase64 },
    });
  } else {
    contentBlocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.doc.contentBase64 },
    });
  }
  contentBlocks.push({ type: "text", text: textPrompt });

  try {
    const res = await callClaudeWithBudget("supplier-doc-ai", MODEL_CHEAP, () =>
      client.messages.create({
        model: MODEL_CHEAP,
        max_tokens: 1024,
        tools: [DOC_PARSE_TOOL],
        tool_choice: { type: "tool", name: DOC_PARSE_TOOL.name },
        messages: [
          {
            role: "user",
            content: contentBlocks as unknown as Anthropic.MessageParam["content"],
          },
        ],
      }),
    );

    // Find the tool_use block in the response.
    const toolUse = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === DOC_PARSE_TOOL.name,
    );
    if (!toolUse) {
      return {
        ok: false,
        reason: "Claude didn't return a tool_use block",
        parsedAt,
      };
    }
    const raw = toolUse.input as Record<string, unknown>;

    const guess = typeof raw.docKindGuess === "string" && VALID_KINDS.includes(raw.docKindGuess as SupplierDocKind)
      ? (raw.docKindGuess as SupplierDocKind)
      : input.doc.kind;
    const confidence = typeof raw.confidence === "number"
      ? Math.max(0, Math.min(100, Math.round(raw.confidence)))
      : 0;
    const reco = typeof raw.recommendation === "string" &&
      (raw.recommendation === "approve" || raw.recommendation === "reject" || raw.recommendation === "needs-review")
      ? (raw.recommendation as DocParseRecommendation)
      : "needs-review";
    const redFlags = Array.isArray(raw.redFlags)
      ? raw.redFlags.filter((f): f is string => typeof f === "string").slice(0, 8)
      : [];
    const summary = typeof raw.summary === "string" ? raw.summary.slice(0, 500) : "";

    // Estimate cost via token usage. callClaudeWithBudget already
    // recorded the spend; we surface the same number on the parse so
    // operators see what each parse cost.
    const inTokens = res.usage.input_tokens;
    const outTokens = res.usage.output_tokens;
    // Pricing for haiku-4-5: $1/M input, $5/M output (kept in sync with lib/anthropic.ts)
    const estCostUsd = (inTokens / 1_000_000) * 1.0 + (outTokens / 1_000_000) * 5.0;

    return {
      ok: true,
      docKindGuess: guess,
      businessNameOnDoc: typeof raw.businessNameOnDoc === "string" && raw.businessNameOnDoc
        ? raw.businessNameOnDoc.slice(0, 200)
        : undefined,
      documentNumber: typeof raw.documentNumber === "string" && raw.documentNumber
        ? raw.documentNumber.slice(0, 80)
        : undefined,
      issueDate: typeof raw.issueDate === "string" && raw.issueDate.match(/^\d{4}-\d{2}-\d{2}$/)
        ? raw.issueDate
        : undefined,
      expiryDate: typeof raw.expiryDate === "string" && raw.expiryDate.match(/^\d{4}-\d{2}-\d{2}$/)
        ? raw.expiryDate
        : undefined,
      summary,
      confidence,
      redFlags,
      recommendation: reco,
      modelUsed: MODEL_CHEAP,
      estCostUsd: Math.round(estCostUsd * 100000) / 100000,
      parsedAt,
    };
  } catch (e) {
    if (e instanceof SpendBudgetExceededError) {
      return { ok: false, reason: e.message, parsedAt };
    }
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Unknown error during Claude call",
      parsedAt,
    };
  }
}

// Local type alias so we can reference Anthropic types without importing
// the SDK in every consumer.
import type Anthropic from "@anthropic-ai/sdk";
