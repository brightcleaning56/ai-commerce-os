/**
 * Provider-agnostic voice / phone abstraction.
 *
 * Today: tel:-link fallback in /tasks call-session drawer (operator's
 * device dialer handles the call). Timer + outcome + notes + attempts
 * log all run in-app.
 *
 * Tomorrow: when VOICE_PROVIDER is set, this module becomes the bridge
 * to the configured provider so:
 *  - Operator can place calls from inside the browser (no tel: handoff)
 *  - AI agent can place calls without operator involvement
 *  - Recordings + transcriptions land back on the task's CallAttempt
 *
 * Provider-comparison summary (lives here so the operator + future
 * contributors don't have to dig through env.example):
 *
 *   vapi    -- single vendor, AI + operator browser calling, Anthropic
 *              native, ~$0.05/min platform + LLM. Uses existing Twilio
 *              number. RECOMMENDED for AVYN.
 *   twilio  -- operator-only Voice JS SDK in browser, ~$0.0085/min.
 *              Cheapest for human dialing. AI loop is build-your-own
 *              (Twilio ConversationRelay + STT + Claude + TTS).
 *   bland   -- AI-first standalone infra, $0.09/min all-in, web call
 *              widget for operator. No Twilio dependency.
 *
 * Until one is configured, getVoiceProvider() returns "fallback" and
 * the UI sticks with tel: links.
 */

export type VoiceProvider = "vapi" | "twilio" | "bland" | "fallback";

export type VoiceProviderInfo = {
  provider: VoiceProvider;
  configured: boolean;
  /**
   * Whether the provider can place AI-driven outbound calls without an
   * operator. Vapi + Bland: yes. Twilio: not on its own (need to wire
   * ConversationRelay or a separate AI service).
   */
  supportsAiOutbound: boolean;
  /**
   * Whether the provider exposes a browser SDK so the operator can
   * place + take calls without leaving the page.
   */
  supportsBrowserCalls: boolean;
  /**
   * Truncated metadata for the /admin/system-health detail panel.
   * Never includes the secret value itself.
   */
  detail: Record<string, string | boolean>;
};

/**
 * Resolve the configured voice provider from env. Returns "fallback"
 * when nothing's set, in which case /tasks renders tel: links and the
 * operator's device dialer handles the call.
 */
export function getVoiceProvider(): VoiceProviderInfo {
  const raw = (process.env.VOICE_PROVIDER ?? "").trim().toLowerCase();
  switch (raw) {
    case "vapi": {
      const privateKey = process.env.VAPI_PRIVATE_KEY?.trim();
      const publicKey = process.env.VAPI_PUBLIC_KEY?.trim();
      const assistantId = process.env.VAPI_ASSISTANT_ID?.trim();
      const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID?.trim();
      const configured = !!(privateKey && phoneNumberId);
      return {
        provider: "vapi",
        configured,
        supportsAiOutbound: true,
        supportsBrowserCalls: !!publicKey,
        detail: {
          privateKeySet: !!privateKey,
          publicKeySet: !!publicKey,
          assistantIdSet: !!assistantId,
          phoneNumberIdSet: !!phoneNumberId,
        },
      };
    }
    case "twilio": {
      const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
      const twimlApp = process.env.TWILIO_TWIML_APP_SID?.trim();
      const apiKey = process.env.TWILIO_API_KEY?.trim();
      const apiSecret = process.env.TWILIO_API_SECRET?.trim();
      const configured = !!(sid && twimlApp && apiKey && apiSecret);
      return {
        provider: "twilio",
        configured,
        supportsAiOutbound: false, // requires ConversationRelay + STT/TTS layer
        supportsBrowserCalls: configured,
        detail: {
          accountSidSet: !!sid,
          twimlAppSidSet: !!twimlApp,
          apiKeySet: !!apiKey,
          apiSecretSet: !!apiSecret,
        },
      };
    }
    case "bland": {
      const apiKey = process.env.BLAND_API_KEY?.trim();
      const configured = !!apiKey;
      return {
        provider: "bland",
        configured,
        supportsAiOutbound: true,
        supportsBrowserCalls: configured,
        detail: {
          apiKeySet: !!apiKey,
        },
      };
    }
    default:
      return {
        provider: "fallback",
        configured: false,
        supportsAiOutbound: false,
        supportsBrowserCalls: false,
        detail: {
          note: "tel: links to device dialer; set VOICE_PROVIDER to upgrade",
        },
      };
  }
}

/**
 * Place an outbound call. Returns a stub result today; the real
 * implementation per provider lands in slice-2 (Vapi first, then
 * Twilio Voice JS SDK as the cheaper operator-only alternative).
 *
 * Until then, callers should fall back to tel: links via the
 * provider-not-configured branch.
 */
export type PlaceCallInput = {
  to: string;                  // E.164 phone number
  taskId?: string;              // Links the resulting CallAttempt back
  buyerId?: string;
  // For AI calls: the script to follow
  systemPrompt?: string;
  firstMessage?: string;        // What the AI says first
  // For operator calls: which browser session is initiating
  fromOperatorEmail?: string;
};

export type PlaceCallResult = {
  ok: boolean;
  provider: VoiceProvider;
  callId?: string;              // provider-side call id for webhook reconciliation
  errorMessage?: string;
};

export async function placeOutboundCall(_input: PlaceCallInput): Promise<PlaceCallResult> {
  const info = getVoiceProvider();
  if (!info.configured) {
    return {
      ok: false,
      provider: info.provider,
      errorMessage:
        "No voice provider configured. Set VOICE_PROVIDER and the matching keys, or use the tel: fallback in /tasks.",
    };
  }
  // Provider implementations land here in slice-2:
  //   if (info.provider === "vapi") return placeViaVapi(input);
  //   if (info.provider === "twilio") return placeViaTwilio(input);
  //   if (info.provider === "bland") return placeViaBland(input);
  return {
    ok: false,
    provider: info.provider,
    errorMessage: `${info.provider} integration is wired but not yet implemented. tel: fallback is active in /tasks.`,
  };
}
