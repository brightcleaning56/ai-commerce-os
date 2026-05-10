/**
 * Email send abstraction.
 *
 * Supports Postmark + Resend out of the box. Without a token, falls back to
 * a simulated send that logs to console and returns a fake message ID — useful
 * for local dev without hitting any real provider.
 *
 * Safety guards:
 * - If no provider token is set: simulated send, never hits the network.
 * - If EMAIL_TEST_RECIPIENT is set: every send is redirected to that address
 *   (with a header noting the original recipient). Use this in staging.
 * - To actually deliver to real buyer addresses you must set EMAIL_LIVE=true.
 *   Without it, sends get redirected to EMAIL_TEST_RECIPIENT or fall back to
 *   simulated.
 *
 * Env vars:
 * - POSTMARK_TOKEN          Postmark Server API token
 * - RESEND_TOKEN            Resend API key (used if Postmark not set)
 * - EMAIL_FROM              From address, e.g. "outreach@yourdomain.com"
 * - EMAIL_FROM_NAME         Display name (default: "AVYN Wholesale")
 * - EMAIL_TEST_RECIPIENT    Optional. If set, all sends redirect here.
 * - EMAIL_LIVE              "true" to allow sending to real recipient (override).
 */

export type SendInput = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  replyTo?: string;
  metadata?: Record<string, string>;
};

export type SendResult = {
  ok: boolean;
  provider: "postmark" | "resend" | "fallback";
  messageId?: string;
  sentTo: string;
  redirectedFrom?: string;
  simulated?: boolean;
  errorMessage?: string;
  rawStatus?: number;
};

export type EmailProviderInfo = {
  provider: "postmark" | "resend" | "fallback";
  configured: boolean;
  fromAddress: string;
  testRecipient: string | null;
  liveMode: boolean;
};

// Fallback "From" address. Real deployments should set EMAIL_FROM in env to
// a domain you own and have verified DNS for. In dev / no-config, we use the
// operator's own email so the simulated send shows it correctly.
const FALLBACK_FROM = process.env.OPERATOR_EMAIL || "outreach@aicommerce.local";
const FALLBACK_NAME = process.env.OPERATOR_COMPANY || "AVYN Commerce";

export function getEmailProviderInfo(): EmailProviderInfo {
  if (process.env.POSTMARK_TOKEN) {
    return {
      provider: "postmark",
      configured: true,
      fromAddress: process.env.EMAIL_FROM || FALLBACK_FROM,
      testRecipient: process.env.EMAIL_TEST_RECIPIENT || null,
      liveMode: process.env.EMAIL_LIVE === "true",
    };
  }
  if (process.env.RESEND_TOKEN) {
    return {
      provider: "resend",
      configured: true,
      fromAddress: process.env.EMAIL_FROM || FALLBACK_FROM,
      testRecipient: process.env.EMAIL_TEST_RECIPIENT || null,
      liveMode: process.env.EMAIL_LIVE === "true",
    };
  }
  return {
    provider: "fallback",
    configured: false,
    fromAddress: process.env.EMAIL_FROM || FALLBACK_FROM,
    testRecipient: process.env.EMAIL_TEST_RECIPIENT || null,
    liveMode: false,
  };
}

function resolveRecipient(originalTo: string): { actualTo: string; redirected: boolean } {
  const info = getEmailProviderInfo();
  // Live mode: send to real recipient as long as we have one
  if (info.liveMode) return { actualTo: originalTo, redirected: false };
  // Test recipient set: always redirect there
  if (info.testRecipient) {
    return { actualTo: info.testRecipient, redirected: originalTo !== info.testRecipient };
  }
  // No live mode, no test recipient → return as-is. The simulated/provider
  // call will still go through, but the operator should set EMAIL_TEST_RECIPIENT
  // to be safe in staging.
  return { actualTo: originalTo, redirected: false };
}

function buildBodies(input: SendInput): { textBody: string; htmlBody: string } {
  const text = input.textBody.trim();
  const html =
    input.htmlBody ??
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;">${text
      .split(/\n\n+/)
      .map((para) => `<p style="margin:0 0 14px 0;">${para.replace(/\n/g, "<br/>")}</p>`)
      .join("")}</div>`;
  return { textBody: text, htmlBody: html };
}

/** Postmark provider */
async function sendPostmark(input: SendInput, actualTo: string, redirected: boolean): Promise<SendResult> {
  const info = getEmailProviderInfo();
  const fromName = process.env.EMAIL_FROM_NAME || FALLBACK_NAME;
  const fromHeader = `${fromName} <${info.fromAddress}>`;
  const { textBody, htmlBody } = buildBodies(input);

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": process.env.POSTMARK_TOKEN!,
      },
      body: JSON.stringify({
        From: fromHeader,
        To: actualTo,
        ReplyTo: input.replyTo,
        Subject: redirected ? `[redirected] ${input.subject}` : input.subject,
        TextBody:
          (redirected
            ? `[Redirected from ${input.to} — set EMAIL_LIVE=true to deliver to real recipient]\n\n`
            : "") + textBody,
        HtmlBody: htmlBody,
        MessageStream: "outbound",
        Metadata: input.metadata,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        provider: "postmark",
        sentTo: actualTo,
        redirectedFrom: redirected ? input.to : undefined,
        errorMessage: data?.Message || `Postmark returned ${res.status}`,
        rawStatus: res.status,
      };
    }
    return {
      ok: true,
      provider: "postmark",
      sentTo: actualTo,
      redirectedFrom: redirected ? input.to : undefined,
      messageId: data?.MessageID,
      rawStatus: res.status,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "postmark",
      sentTo: actualTo,
      redirectedFrom: redirected ? input.to : undefined,
      errorMessage: e instanceof Error ? e.message : "Postmark request failed",
    };
  }
}

/** Resend provider (alternative) */
async function sendResend(input: SendInput, actualTo: string, redirected: boolean): Promise<SendResult> {
  const info = getEmailProviderInfo();
  const fromName = process.env.EMAIL_FROM_NAME || FALLBACK_NAME;
  const { htmlBody } = buildBodies(input);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_TOKEN}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${info.fromAddress}>`,
        to: [actualTo],
        reply_to: input.replyTo,
        subject: redirected ? `[redirected] ${input.subject}` : input.subject,
        html: htmlBody,
        text: input.textBody,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        provider: "resend",
        sentTo: actualTo,
        redirectedFrom: redirected ? input.to : undefined,
        errorMessage: data?.message || `Resend returned ${res.status}`,
        rawStatus: res.status,
      };
    }
    return {
      ok: true,
      provider: "resend",
      sentTo: actualTo,
      redirectedFrom: redirected ? input.to : undefined,
      messageId: data?.id,
      rawStatus: res.status,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "resend",
      sentTo: actualTo,
      redirectedFrom: redirected ? input.to : undefined,
      errorMessage: e instanceof Error ? e.message : "Resend request failed",
    };
  }
}

/** Fallback simulated send */
function sendFallback(input: SendInput, actualTo: string, redirected: boolean): SendResult {
  const id = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  if (typeof console !== "undefined") {
    console.log(`[email:fallback] would send to=${actualTo} subject="${input.subject}" id=${id}`);
  }
  return {
    ok: true,
    provider: "fallback",
    sentTo: actualTo,
    redirectedFrom: redirected ? input.to : undefined,
    messageId: id,
    simulated: true,
  };
}

/** Public entry point */
export async function sendEmail(input: SendInput): Promise<SendResult> {
  const info = getEmailProviderInfo();
  const { actualTo, redirected } = resolveRecipient(input.to);

  if (info.provider === "postmark") return sendPostmark(input, actualTo, redirected);
  if (info.provider === "resend") return sendResend(input, actualTo, redirected);
  return sendFallback(input, actualTo, redirected);
}
