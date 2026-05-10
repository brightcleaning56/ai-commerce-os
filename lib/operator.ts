/**
 * Operator / owner profile — single source of truth for the human signing
 * outreach emails, generating quotes, and shown as the workspace owner.
 *
 * Reads from env vars at call time so changes don't require a rebuild.
 * Defaults are baked into the code as the owner's identity — Eric Moore.
 *
 * Override in .env.local or your deploy env:
 *   OPERATOR_NAME            - full name (used in email signatures)
 *   OPERATOR_EMAIL           - public sending email (signature + reply-to)
 *   OPERATOR_COMPANY         - company name (footer + email signature)
 *   OPERATOR_TITLE           - job title (e.g., "Founder", "Wholesale Director")
 *   OPERATOR_PHONE           - optional contact phone shown on quotes
 *
 * Used by:
 *   - Outreach Agent: "Sender: <name> from <company>"
 *   - Negotiation Agent: same
 *   - Followup Agent: same
 *   - Quote builder: signature line on the quote view
 *   - Admin pages: owner display in sidebar
 */

export type OperatorProfile = {
  name: string;
  email: string;
  company: string;
  title: string;
  phone?: string;
  /** Initials for the small avatar badge */
  initials: string;
};

const DEFAULT_NAME = "Eric Moore";
const DEFAULT_EMAIL = "Ericduolo4@gmail.com";
const DEFAULT_COMPANY = "AVYN Commerce";
const DEFAULT_TITLE = "Founder";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function getOperator(): OperatorProfile {
  const name = process.env.OPERATOR_NAME || DEFAULT_NAME;
  return {
    name,
    email: process.env.OPERATOR_EMAIL || DEFAULT_EMAIL,
    company: process.env.OPERATOR_COMPANY || DEFAULT_COMPANY,
    title: process.env.OPERATOR_TITLE || DEFAULT_TITLE,
    phone: process.env.OPERATOR_PHONE || undefined,
    initials: initialsOf(name),
  };
}

/**
 * Just the first name — used in agent prompts for natural greetings
 * ("Hi Sarah, ... — Eric").
 */
export function getOperatorFirstName(): string {
  return getOperator().name.split(/\s+/)[0] ?? "";
}

/**
 * Standard email signature block for the outreach + followup agents.
 * Returns a 2-3 line plain-text signature.
 */
export function getOperatorSignature(): string {
  const op = getOperator();
  const lines = [op.name, `${op.title} · ${op.company}`];
  if (op.phone) lines.push(op.phone);
  return lines.join("\n");
}
