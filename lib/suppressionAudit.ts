/**
 * Resubscribe audit log (slice 30).
 *
 * Removing an email/phone from the suppression list is a sensitive
 * operation -- doing it without explicit recipient consent is a
 * CAN-SPAM violation ($50,120 per email per FTC enforcement). This
 * module records every removal with operator + reason so the
 * workspace can defend the decision in audit / legal review.
 *
 * Append-only by design. There's no remove() helper. If the operator
 * needs to redact (e.g. GDPR right-to-erasure), that's a future
 * /admin/audit redact slice.
 *
 * Node-only.
 */
import crypto from "node:crypto";
import { getBackend } from "@/lib/store";

const AUDIT_FILE = "suppression-audits.json";
const MAX_RETAINED = 50_000;

export type SuppressionAudit = {
  id: string;
  /** "remove" -> resubscribed (suppression deleted)
   *  "add"    -> manually added (operator adds to suppression list)
   *  "import" -> bulk-import added entries */
  action: "remove" | "add" | "import";
  /** What was suppressed: email + phone (one or both) at the time. */
  email?: string;
  phone?: string;
  channel?: "email" | "sms";
  /** Operator email at action time (or "owner" for ADMIN_TOKEN sessions). */
  actorEmail: string;
  /** REQUIRED for "remove" -- the recipient consent reason. */
  consentReason?: string;
  /** Pre-action context useful for audit. */
  suppressionId?: string;
  source?: string;       // EmailSuppressionSource at action time
  at: string;            // ISO
};

export const suppressionAudits = {
  async list(filter?: { action?: SuppressionAudit["action"]; limit?: number }): Promise<SuppressionAudit[]> {
    const all = await getBackend().read<SuppressionAudit[]>(AUDIT_FILE, []);
    let out = all.slice().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    if (filter?.action) out = out.filter((a) => a.action === filter.action);
    if (filter?.limit) out = out.slice(0, filter.limit);
    return out;
  },

  async record(input: Omit<SuppressionAudit, "id" | "at"> & { at?: string }): Promise<SuppressionAudit> {
    const entry: SuppressionAudit = {
      ...input,
      id: `aud_${crypto.randomBytes(8).toString("hex")}`,
      at: input.at ?? new Date().toISOString(),
    };
    const all = await getBackend().read<SuppressionAudit[]>(AUDIT_FILE, []);
    const next = [entry, ...all].slice(0, MAX_RETAINED);
    await getBackend().write(AUDIT_FILE, next);
    return entry;
  },
};
