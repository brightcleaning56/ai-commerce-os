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

export type VoiceContextValue = {
  // Refs (stable across renders)
  deviceRef: React.MutableRefObject<unknown>;
  currentCallRef: React.MutableRefObject<unknown>;
  currentCallSidRef: React.MutableRefObject<string | null>;
  // Reactive state (drives UI)
  twilioReady: boolean;
  twilioInFlight: CallInFlight;
  setTwilioInFlight: React.Dispatch<React.SetStateAction<CallInFlight>>;
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

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    async function initDevice() {
      try {
        const r = await fetch("/api/voice/token", { credentials: "include" });
        if (!r.ok) return;
        const d = await r.json();
        if (!d?.token) return;

        const mod: { Device: new (token: string, opts?: Record<string, unknown>) => unknown } =
          await import("@twilio/voice-sdk");
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

        await device.register();
        if (cancelled) {
          device.destroy();
          return;
        }
        setTwilioReady(true);
        cleanup = () => device.destroy();
      } catch (e) {
        console.info("[voice] not active:", e instanceof Error ? e.message : e);
      }
    }
    initDevice();
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
      deviceRef.current = null;
      currentCallRef.current = null;
    };
  }, [toast]);

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

  const value: VoiceContextValue = {
    deviceRef,
    currentCallRef,
    currentCallSidRef,
    twilioReady,
    twilioInFlight,
    setTwilioInFlight,
    incomingFrom,
    answerIncoming,
    declineIncoming,
  };

  return <VoiceContextObj.Provider value={value}>{children}</VoiceContextObj.Provider>;
}
