/**
 * Onboarding-side verification: email magic-link codes + document uploads.
 *
 * Email verification:
 *   - 6-digit code, 10-min TTL
 *   - Stored on the OnboardingSession (extends type via emailVerified flag
 *     plus a sibling onboarding-verify-codes.json store keyed by sessionId)
 *   - Confirm flips session.emailVerified=true
 *
 * Document uploads:
 *   - Stored as base64-in-JSON for portability (works on file/blobs/kv).
 *   - 2 MB hard cap per file (most cert PDFs fit; bigger gets rejected
 *     with a clear error to the operator).
 *   - Keyed by (sessionId, kind) where kind is the question id from the
 *     flow definition (e.g. "businessLicense", "insurance").
 *   - Doc kinds the user uploaded get appended to
 *     session.documentsUploaded[] so the engine can render a "uploaded"
 *     badge next to file questions.
 *
 * Slice 7 is functional but minimal -- per-doc retrieval URL signing,
 * virus scanning, OCR-based field extraction, and Netlify Blobs binary
 * storage are slice 7.5+ enhancements.
 *
 * Node-only.
 */
import crypto from "node:crypto";
import { sendEmail } from "@/lib/email";
import { getBackend } from "@/lib/store";
import { onboardingSessions } from "@/lib/onboardingState";

const VERIFY_CODES_FILE = "onboarding-verify-codes.json";
const DOCUMENTS_FILE = "onboarding-documents.json";
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_FILE_SIZE = 2 * 1024 * 1024;       // 2 MB before base64
const MAX_FILE_SIZE_B64 = Math.ceil((MAX_FILE_SIZE * 4) / 3); // ~2.67 MB after base64

// ─── Verify codes ───────────────────────────────────────────────────

type VerifyCode = {
  sessionId: string;
  email: string;
  code: string;
  attempts: number;
  expiresAt: string;
  createdAt: string;
};

function genCode(): string {
  // Crypto-strong 6-digit code. 1 in 1M guess rate, capped to 5 attempts.
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

async function readCodes(): Promise<VerifyCode[]> {
  const all = await getBackend().read<VerifyCode[]>(VERIFY_CODES_FILE, []);
  // Lazy GC of expired
  const now = Date.now();
  const cleaned = all.filter((c) => new Date(c.expiresAt).getTime() > now);
  if (cleaned.length !== all.length) {
    await getBackend().write(VERIFY_CODES_FILE, cleaned);
  }
  return cleaned;
}

export async function startEmailVerify(args: {
  sessionId: string;
  email: string;
}): Promise<{ ok: boolean; sent: boolean; expiresAt: string; reason?: string }> {
  const email = args.email.toLowerCase().trim();
  if (!email.includes("@")) {
    return { ok: false, sent: false, expiresAt: "", reason: "Invalid email" };
  }

  const code = genCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const record: VerifyCode = {
    sessionId: args.sessionId,
    email,
    code,
    attempts: 0,
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  // Replace any existing code for this session (last code wins)
  const codes = await readCodes();
  const filtered = codes.filter((c) => c.sessionId !== args.sessionId);
  await getBackend().write(VERIFY_CODES_FILE, [record, ...filtered]);

  // Send email -- non-blocking. If email is simulated (no provider key)
  // the operator/tester can read the code from the cron-runs / API
  // response in dev (slice 7.5 will add a dev-only echoback).
  const r = await sendEmail({
    to: email,
    subject: `Your AVYN verification code: ${code}`,
    textBody:
      `Your verification code is: ${code}\n\n` +
      `It expires in 10 minutes. If you didn't request this, you can ignore this message.\n\n` +
      `--- AVYN Commerce`,
    metadata: { kind: "onboarding-verify", session_id: args.sessionId },
    skipFooter: true, // transactional, not marketing
  });

  return {
    ok: true,
    sent: r.ok,
    expiresAt,
    reason: r.errorMessage,
  };
}

export async function confirmEmailVerify(args: {
  sessionId: string;
  code: string;
}): Promise<{ ok: boolean; reason?: string; verified?: boolean }> {
  const codes = await readCodes();
  const record = codes.find((c) => c.sessionId === args.sessionId);
  if (!record) {
    return { ok: false, reason: "No code -- request a new one" };
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "Code expired -- request a new one" };
  }
  if (record.attempts >= 5) {
    return { ok: false, reason: "Too many attempts -- request a new code" };
  }
  // Increment attempt count regardless of outcome
  const updated: VerifyCode = { ...record, attempts: record.attempts + 1 };
  const others = codes.filter((c) => c.sessionId !== args.sessionId);
  await getBackend().write(VERIFY_CODES_FILE, [updated, ...others]);

  if (args.code.trim() !== record.code) {
    return { ok: false, reason: `Code doesn't match (${5 - updated.attempts} attempt${5 - updated.attempts === 1 ? "" : "s"} left)` };
  }

  // Verified -- flip session flag + drop the code so it can't be reused
  await onboardingSessions.patch(args.sessionId, { emailVerified: true });
  const after = codes.filter((c) => c.sessionId !== args.sessionId);
  await getBackend().write(VERIFY_CODES_FILE, after);

  return { ok: true, verified: true };
}

// ─── Document uploads ───────────────────────────────────────────────

export type UploadedDocument = {
  sessionId: string;
  kind: string;          // question id, e.g. "businessLicense"
  filename: string;
  contentType: string;
  sizeBytes: number;
  base64: string;
  uploadedAt: string;
};

function isUpload(v: unknown): v is UploadedDocument {
  if (!v || typeof v !== "object") return false;
  const u = v as Partial<UploadedDocument>;
  return typeof u.sessionId === "string" && typeof u.kind === "string" && typeof u.base64 === "string";
}

async function readDocs(): Promise<UploadedDocument[]> {
  const all = await getBackend().read<UploadedDocument[]>(DOCUMENTS_FILE, []);
  return all.filter(isUpload);
}

export async function saveDocument(args: {
  sessionId: string;
  kind: string;
  filename: string;
  contentType: string;
  base64: string;
}): Promise<{ ok: boolean; reason?: string; document?: UploadedDocument }> {
  if (args.base64.length > MAX_FILE_SIZE_B64) {
    return {
      ok: false,
      reason: `File too large -- max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB`,
    };
  }
  const sizeBytes = Math.ceil((args.base64.length * 3) / 4);
  const doc: UploadedDocument = {
    sessionId: args.sessionId,
    kind: args.kind.slice(0, 80),
    filename: args.filename.slice(0, 200),
    contentType: args.contentType.slice(0, 80),
    sizeBytes,
    base64: args.base64,
    uploadedAt: new Date().toISOString(),
  };
  // Replace any prior upload for the same (session, kind) -- newest wins
  const all = await readDocs();
  const filtered = all.filter((d) => !(d.sessionId === args.sessionId && d.kind === args.kind));
  await getBackend().write(DOCUMENTS_FILE, [doc, ...filtered]);

  // Update session.documentsUploaded[]
  const session = await onboardingSessions.get(args.sessionId);
  if (session) {
    const current = session.documentsUploaded ?? [];
    if (!current.includes(args.kind)) {
      await onboardingSessions.patch(args.sessionId, {
        documentsUploaded: [...current, args.kind],
      });
    }
  }

  return { ok: true, document: doc };
}

export async function listDocumentsForSession(sessionId: string): Promise<
  Array<Omit<UploadedDocument, "base64">>
> {
  const all = await readDocs();
  return all
    .filter((d) => d.sessionId === sessionId)
    .map(({ base64: _omit, ...rest }) => rest);
}

export async function getDocument(args: {
  sessionId: string;
  kind: string;
}): Promise<UploadedDocument | null> {
  const all = await readDocs();
  return all.find((d) => d.sessionId === args.sessionId && d.kind === args.kind) ?? null;
}

export async function removeDocument(args: {
  sessionId: string;
  kind: string;
}): Promise<boolean> {
  const all = await readDocs();
  const next = all.filter((d) => !(d.sessionId === args.sessionId && d.kind === args.kind));
  if (next.length === all.length) return false;
  await getBackend().write(DOCUMENTS_FILE, next);
  // Remove kind from session.documentsUploaded[]
  const session = await onboardingSessions.get(args.sessionId);
  if (session?.documentsUploaded) {
    await onboardingSessions.patch(args.sessionId, {
      documentsUploaded: session.documentsUploaded.filter((k) => k !== args.kind),
    });
  }
  return true;
}
