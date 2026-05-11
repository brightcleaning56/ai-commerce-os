/**
 * Minimal Twilio SMS adapter. Activates when:
 *   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM (E.164 number) are set.
 * Otherwise sendSms() returns { ok: false, simulated: true } and the caller
 * treats the SMS path as "skipped — not configured" — same shape as
 * lib/email.ts when no provider key is present. No throws on missing config.
 */

export type SendSmsInput = {
  to: string;           // E.164 like "+14155551234"
  body: string;
};

export type SendSmsResult = {
  ok: boolean;
  provider: "twilio" | "fallback";
  simulated?: boolean;
  sentTo?: string;
  messageSid?: string;
  errorMessage?: string;
};

export type SmsProviderInfo = {
  provider: "twilio" | "fallback";
  configured: boolean;
  fromNumber: string | null;
};

export function getSmsProviderInfo(): SmsProviderInfo {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
    return {
      provider: "twilio",
      configured: true,
      fromNumber: process.env.TWILIO_FROM,
    };
  }
  return { provider: "fallback", configured: false, fromNumber: null };
}

function normalizeE164(raw: string): string | null {
  // Strip everything except digits and a leading +
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  // Add + if missing and it looks like a US-style 10 or 11 digit number.
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  return null; // Can't safely normalize — caller can skip.
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const info = getSmsProviderInfo();
  const to = normalizeE164(input.to);
  if (!to) {
    return { ok: false, provider: "fallback", simulated: true, errorMessage: "Invalid phone number" };
  }
  if (!info.configured) {
    return { ok: false, provider: "fallback", simulated: true, sentTo: to };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = info.fromNumber!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const params = new URLSearchParams();
  params.set("To", to);
  params.set("From", from);
  params.set("Body", input.body.slice(0, 320));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) {
      return {
        ok: false,
        provider: "twilio",
        sentTo: to,
        errorMessage: data.message ?? `Twilio returned ${res.status}`,
      };
    }
    return {
      ok: true,
      provider: "twilio",
      sentTo: to,
      messageSid: data.sid,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "twilio",
      sentTo: to,
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}
