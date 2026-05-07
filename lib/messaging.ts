/**
 * SMS + LinkedIn send abstractions, mirroring lib/email.ts.
 *
 * SMS: Twilio (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER).
 *      Same three-mode safety as email: simulated / redirected / live.
 *      Redirect target: SMS_TEST_RECIPIENT (E.164 number).
 *      Live mode: SMS_LIVE=true.
 *
 * LinkedIn: there is NO public programmatic DM API. We simulate the send,
 *      copy the body to clipboard via the UI, and the user pastes it into
 *      LinkedIn manually. Tracking still works via the embedded share link.
 */

export type ChannelSendInput = {
  to: string;            // email / phone / linkedin URL or username
  body: string;
  subject?: string;      // SMS ignores; email + LinkedIn use it
  metadata?: Record<string, string>;
};

export type ChannelSendResult = {
  ok: boolean;
  channel: "sms" | "linkedin";
  provider: "twilio" | "fallback";
  messageId?: string;
  sentTo: string;
  redirectedFrom?: string;
  simulated?: boolean;
  errorMessage?: string;
};

function isE164(n: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(n.trim());
}

export async function sendSms(input: ChannelSendInput): Promise<ChannelSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const live = process.env.SMS_LIVE === "true";
  const testRecipient = process.env.SMS_TEST_RECIPIENT;

  // Resolve actual destination with redirect logic
  let actual = input.to;
  let redirectedFrom: string | undefined;
  if (!live && testRecipient && actual !== testRecipient) {
    redirectedFrom = actual;
    actual = testRecipient;
  }

  // No Twilio config OR no E.164 destination → simulated
  if (!sid || !token || !from || !isE164(actual)) {
    return {
      ok: true,
      channel: "sms",
      provider: "fallback",
      sentTo: actual,
      redirectedFrom,
      simulated: true,
      messageId: `sim_${Date.now().toString(36)}`,
    };
  }

  try {
    // Twilio SMS via REST API
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const params = new URLSearchParams({
      To: actual,
      From: from,
      Body: input.body,
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) {
      return {
        ok: false,
        channel: "sms",
        provider: "twilio",
        sentTo: actual,
        redirectedFrom,
        errorMessage: json.message ?? `Twilio ${res.status}`,
      };
    }
    return {
      ok: true,
      channel: "sms",
      provider: "twilio",
      sentTo: actual,
      redirectedFrom,
      messageId: json.sid,
    };
  } catch (e) {
    return {
      ok: false,
      channel: "sms",
      provider: "twilio",
      sentTo: actual,
      redirectedFrom,
      errorMessage: e instanceof Error ? e.message : "SMS send failed",
    };
  }
}

/**
 * LinkedIn DMs do NOT have a public programmatic API. This always returns a
 * simulated result — the operator copies the body and pastes it into LinkedIn
 * manually. Tracking still works because the share link is embedded in the body.
 */
export async function sendLinkedIn(input: ChannelSendInput): Promise<ChannelSendResult> {
  return {
    ok: true,
    channel: "linkedin",
    provider: "fallback",
    sentTo: input.to,
    simulated: true,
    messageId: `li_sim_${Date.now().toString(36)}`,
  };
}

export function getMessagingProviderInfo(): {
  sms: { provider: string; configured: boolean; live: boolean };
  linkedin: { provider: string; configured: boolean; live: boolean };
} {
  const smsConfigured =
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_FROM_NUMBER;
  return {
    sms: {
      provider: smsConfigured ? "twilio" : "simulated",
      configured: smsConfigured,
      live: process.env.SMS_LIVE === "true",
    },
    linkedin: {
      provider: "manual (simulated)",
      configured: false,
      live: false,
    },
  };
}
