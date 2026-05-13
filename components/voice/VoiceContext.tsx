"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * Global voice provider. Single source of truth for the Twilio Device,
 * the in-flight call state, and incoming-call handling -- mounted at
 * the app shell so:
 *
 *  - Outbound calls work from /tasks call-session drawer (the one
 *    page that initiates them today)
 *  - INCOMING calls ring the operator's browser on EVERY page, not
 *    just when /tasks happens to be open
 *  - Recording webhook → CallSid join continues to work via attempts
 *  - One Device per browser tab (single registration with Twilio)
 *
 * When voice isn't configured (no /api/voice/token, SDK fails to load,
 * mic permission denied, etc.), this provider stays in a quiet
 * never-ready state and consumers fall back to tel: links. The
 * provider never throws or blocks rendering.
 */

type CallInFlight = "idle" | "connecting" | "ringing" | "open";

/**
 * Why voice isn't ready. Used by the UI to surface a specific fix
 * instead of "voice not ready" black-box silence. `null` means we
 * either ARE ready, or we're still initializing.
 */
export type VoiceFailReason =
  | "not-configured"      // /api/voice/token returned 503 (Twilio env missing)
  | "token-fetch-failed"  // network error or non-503 failure on /api/voice/token
  | "sdk-load-failed"     // dynamic import of @twilio/voice-sdk threw
  | "mic-denied"          // browser permission denied
  | "mic-error"           // mic device error (no device, hardware fault)
  | "register-failed";    // Twilio Device.register() threw

export type MicPermission = "unknown" | "granted" | "denied" | "prompt";

export type VoiceContextValue = {
  // Refs (stable across renders)
  deviceRef: React.MutableRefObject<unknown>;
  currentCallRef: React.MutableRefObject<unknown>;
  currentCallSidRef: React.MutableRefObject<string | null>;
  // Reactive state (drives UI)
  twilioReady: boolean;
  twilioInFlight: CallInFlight;
  setTwilioInFlight: React.Dispatch<React.SetStateAction<CallInFlight>>;
  // Diagnostic state — drives the "Voice not ready: <reason>" UI
  failReason: VoiceFailReason | null;
  micPermission: MicPermission;
  /**
   * Explicitly prompt the browser for mic access. Returns true if granted.
   * Useful from a "Request mic" button so the operator can recover from
   * a denied permission without digging into browser settings.
   */
  requestMicPermission: () => Promise<boolean>;
  // Inbound state (consumed by IncomingCallWidget)
  incomingFrom: string | null;
  /**
   * Answer the currently-ringing inbound call. Bridges audio + sets
   * twilioInFlight=open. Caller (the floating widget) decides what UI
   * to navigate to next; this fn just accepts the call.
   * Returns the captured CallSid (if any) for the caller's bookkeeping.
   */
  answerIncoming: () => string | null;
  declineIncoming: () => void;
  /**
   * Place an outbound call from anywhere in the app. Used by the
   * /admin/system-health voice diagnostics card so the operator can
   * place a test call without going through /tasks. Returns the Call
   * object (typed as unknown to keep the SDK type out of the public
   * context type) or null if the Device isn't ready.
   */
  placeOutboundCall: (toNumber: string) => Promise<unknown>;
  /**
   * Hang up the in-flight call (if any). Convenience for callers that
   * don't want to reach into currentCallRef themselves.
   */
  hangup: () => void;
};

const VoiceContextObj = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContextObj);
  if (!ctx) {
    throw new Error("useVoice() must be used inside <VoiceProvider>");
  }
  return ctx;
}

export default function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const deviceRef = useRef<unknown>(null);
  const currentCallRef = useRef<unknown>(null);
  const currentCallSidRef = useRef<string | null>(null);
  const incomingCallRef = useRef<unknown>(null);
  const [twilioReady, setTwilioReady] = useState(false);
  const [twilioInFlight, setTwilioInFlight] = useState<CallInFlight>("idle");
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [failReason, setFailReason] = useState<VoiceFailReason | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermission>("unknown");

  // Probe mic permission state on mount. Permissions API is widely
  // supported but Safari historically didn't expose 'microphone' --
  // catch + treat as unknown so we never crash the provider.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setMicPermission(status.state as MicPermission);
        status.onchange = () => {
          setMicPermission(status.state as MicPermission);
        };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Explicit mic permission request. Operator hits this when they hit
   * a "denied" state and want to grant. Triggers the browser's native
   * permission prompt (or a no-op if already granted).
   */
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      toast("Browser has no microphone API", "error");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release the test stream immediately -- we just wanted permission.
      // Twilio Device manages its own audio stream internally.
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
      // If we previously failed because of mic-denied, clear the fail
      // and trigger a Device re-init by toggling failReason. The next
      // render's useEffect re-runs with permission now granted.
      if (failReason === "mic-denied" || failReason === "mic-error") {
        setFailReason(null);
      }
      toast("Microphone access granted", "success");
      return true;
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e.name === "NotAllowedError") {
        setMicPermission("denied");
        toast("Microphone permission denied — grant it in your browser address bar", "error");
      } else {
        toast(`Microphone error: ${e.message ?? e.name ?? "unknown"}`, "error");
      }
      return false;
    }
  }, [failReason, toast]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    async function initDevice() {
      try {
        let r: Response;
        try {
          r = await fetch("/api/voice/token", { credentials: "include" });
        } catch (e) {
          if (!cancelled) setFailReason("token-fetch-failed");
          console.info("[voice] token fetch failed:", e instanceof Error ? e.message : e);
          return;
        }
        if (r.status === 503) {
          if (!cancelled) setFailReason("not-configured");
          return;
        }
        if (!r.ok) {
          if (!cancelled) setFailReason("token-fetch-failed");
          return;
        }
        const d = await r.json();
        if (!d?.token) {
          if (!cancelled) setFailReason("token-fetch-failed");
          return;
        }

        let mod: { Device: new (token: string, opts?: Record<string, unknown>) => unknown };
        try {
          mod = await import("@twilio/voice-sdk");
        } catch (e) {
          if (!cancelled) setFailReason("sdk-load-failed");
          console.info("[voice] SDK load failed:", e instanceof Error ? e.message : e);
          return;
        }
        if (cancelled) return;

        const Device = mod.Device;
        const device = new Device(d.token, {
          logLevel: 1,
          codecPreferences: ["opus" as never, "pcmu" as never],
        }) as {
          register: () => Promise<void>;
          on: (ev: string, cb: (...args: unknown[]) => void) => void;
          updateToken: (t: string) => void;
          destroy: () => void;
          connect: (opts: { params: Record<string, string> }) => Promise<unknown>;
        };
        deviceRef.current = device;

        device.on("tokenWillExpire", async () => {
          try {
            const rr = await fetch("/api/voice/token", { credentials: "include" });
            const dd = await rr.json();
            if (dd?.token) device.updateToken(dd.token);
          } catch (e) {
            console.warn("[voice] token refresh failed", e);
          }
        });

        device.on("error", (...args) => {
          const err = args[0] as { message?: string } | undefined;
          console.warn("[voice] device error", err);
          if (err?.message) toast(`Voice: ${err.message}`, "error");
        });

        device.on("incoming", (...args) => {
          const incomingCall = args[0] as
            | {
                parameters?: { From?: string; CallSid?: string };
                accept: () => void;
                reject: () => void;
                on: (ev: string, cb: () => void) => void;
              }
            | undefined;
          if (!incomingCall) return;
          incomingCallRef.current = incomingCall;
          const from = incomingCall.parameters?.From ?? "unknown caller";
          setIncomingFrom(from);
          incomingCall.on("cancel", () => {
            incomingCallRef.current = null;
            setIncomingFrom(null);
          });
          incomingCall.on("disconnect", () => {
            incomingCallRef.current = null;
            setIncomingFrom(null);
          });
        });

        try {
          await device.register();
        } catch (e) {
          // register() can throw on mic denial OR network/SIP errors --
          // peek at the error name to distinguish.
          const err = e as { name?: string; message?: string };
          if (err?.name === "NotAllowedError" || /permission/i.test(err?.message ?? "")) {
            if (!cancelled) setFailReason("mic-denied");
            setMicPermission("denied");
          } else if (err?.name === "NotFoundError" || /no.*microphone/i.test(err?.message ?? "")) {
            if (!cancelled) setFailReason("mic-error");
          } else {
            if (!cancelled) setFailReason("register-failed");
          }
          console.info("[voice] register failed:", err?.message ?? err?.name ?? e);
          device.destroy();
          return;
        }
        if (cancelled) {
          device.destroy();
          return;
        }
        setTwilioReady(true);
        setFailReason(null);

        // Presence heartbeat — tell the server this Device is online so
        // /api/voice/inbound can include us in the multi-agent <Dial>
        // fan-out. We fire one immediately so inbound rings us right
        // after register, then every 30s while we stay registered.
        // PRESENCE_TTL_MS in lib/agentPresence is 90s so we tolerate
        // ~2 missed beats before being marked offline.
        const heartbeat = async () => {
          try {
            await fetch("/api/voice/presence", {
              method: "POST",
              credentials: "include",
              cache: "no-store",
            });
          } catch {
            // Silently swallow — next tick will retry.
          }
        };
        void heartbeat();
        const interval = setInterval(() => void heartbeat(), 30_000);

        cleanup = () => {
          clearInterval(interval);
          // Explicit offline — best-effort. If the browser is closing
          // we use keepalive so the request still flushes.
          fetch("/api/voice/presence", {
            method: "DELETE",
            credentials: "include",
            keepalive: true,
          }).catch(() => {});
          device.destroy();
        };
      } catch (e) {
        console.info("[voice] not active:", e instanceof Error ? e.message : e);
        if (!cancelled) setFailReason("register-failed");
      }
    }
    initDevice();
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
      deviceRef.current = null;
      currentCallRef.current = null;
    };
    // micPermission in deps so we retry registration after the operator
    // grants mic access via requestMicPermission (or out-of-band browser settings)
  }, [toast, micPermission]);

  const answerIncoming = useCallback((): string | null => {
    const call = incomingCallRef.current as
      | {
          accept: () => void;
          parameters?: { CallSid?: string };
          on: (ev: string, cb: () => void) => void;
        }
      | null;
    if (!call) return null;
    try {
      call.accept();
      setTwilioInFlight("open");
      currentCallRef.current = call;
      const sid = call.parameters?.CallSid ?? null;
      currentCallSidRef.current = sid;
      call.on("disconnect", () => {
        setTwilioInFlight("idle");
        currentCallRef.current = null;
      });
      setIncomingFrom(null);
      return sid;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Answer failed", "error");
      return null;
    }
  }, [toast]);

  const declineIncoming = useCallback(() => {
    const call = incomingCallRef.current as { reject: () => void } | null;
    if (call) {
      try {
        call.reject();
      } catch {}
    }
    incomingCallRef.current = null;
    setIncomingFrom(null);
  }, []);

  const placeOutboundCall = useCallback(
    async (toNumber: string): Promise<unknown> => {
      const device = deviceRef.current as
        | { connect: (opts: { params: Record<string, string> }) => Promise<unknown> }
        | null;
      if (!device || !twilioReady) {
        toast("Voice not ready — check /admin/system-health", "error");
        return null;
      }
      try {
        setTwilioInFlight("connecting");
        currentCallSidRef.current = null;
        const call = (await device.connect({
          params: { To: toNumber },
        })) as {
          on: (ev: string, cb: (...args: unknown[]) => void) => void;
          parameters?: { CallSid?: string };
        };
        currentCallRef.current = call;
        call.on("ringing", () => setTwilioInFlight("ringing"));
        call.on("accept", () => {
          setTwilioInFlight("open");
          const sid = (call.parameters?.CallSid as string | undefined) ?? null;
          currentCallSidRef.current = sid;
        });
        call.on("disconnect", () => {
          setTwilioInFlight("idle");
          currentCallRef.current = null;
        });
        call.on("error", (...args) => {
          const err = args[0] as { message?: string } | undefined;
          setTwilioInFlight("idle");
          currentCallRef.current = null;
          toast(`Call error: ${err?.message ?? "unknown"}`, "error");
        });
        return call;
      } catch (e) {
        setTwilioInFlight("idle");
        toast(`Call failed: ${e instanceof Error ? e.message : "unknown"}`, "error");
        return null;
      }
    },
    [twilioReady, toast],
  );

  const hangup = useCallback(() => {
    const call = currentCallRef.current as { disconnect: () => void } | null;
    if (call) {
      try {
        call.disconnect();
      } catch {}
      currentCallRef.current = null;
    }
    setTwilioInFlight("idle");
  }, []);

  const value: VoiceContextValue = {
    deviceRef,
    currentCallRef,
    currentCallSidRef,
    twilioReady,
    twilioInFlight,
    setTwilioInFlight,
    failReason,
    micPermission,
    requestMicPermission,
    incomingFrom,
    answerIncoming,
    declineIncoming,
    placeOutboundCall,
    hangup,
  };

  return <VoiceContextObj.Provider value={value}>{children}</VoiceContextObj.Provider>;
}
