"use client";
import { PhoneCall, PhoneIncoming, PhoneOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useVoice } from "@/components/voice/VoiceContext";

/**
 * Global floating incoming-call widget. Mounted at app shell so it
 * shows on EVERY page when an inbound call rings -- not just /tasks.
 *
 * Positioned bottom-right with a high z-index so it floats over any
 * page content. Auto-dismisses when the caller hangs up (handled
 * by VoiceContext's "cancel"/"disconnect" listeners).
 *
 * On Answer:
 *   1. VoiceContext accepts the call (audio bridges)
 *   2. We try to find a task in localStorage whose buyerPhone matches
 *      the caller's From number
 *   3. If matched: navigate to /tasks?focus=<taskId> so the call-session
 *      drawer auto-opens with the right buyer + script + history
 *   4. If unmatched: navigate to /tasks (operator can create one)
 */
type StoredTask = {
  id: string;
  buyerPhone?: string;
};

export default function IncomingCallWidget() {
  const router = useRouter();
  const { toast } = useToast();
  const { incomingFrom, answerIncoming, declineIncoming } = useVoice();

  if (!incomingFrom) return null;

  function handleAnswer() {
    const sid = answerIncoming();
    // Find a matching task by phone (snapshot lookup; live buyer
    // backfill happens on /tasks page itself once we land there).
    let matchingTaskId: string | null = null;
    try {
      const raw = localStorage.getItem("aicos:tasks:v1");
      if (raw) {
        const tasks: StoredTask[] = JSON.parse(raw);
        const m = tasks.find((t) => t.buyerPhone && t.buyerPhone === incomingFrom);
        matchingTaskId = m?.id ?? null;
      }
    } catch {}

    if (matchingTaskId) {
      toast("Connected — opening matching task to log the call", "success");
      router.push(`/tasks?focus=${encodeURIComponent(matchingTaskId)}`);
    } else {
      toast(
        `Connected to ${incomingFrom}${sid ? ` (CallSid ${sid.slice(-8)})` : ""} — open /tasks to log + create a task`,
        "info",
      );
      router.push("/tasks");
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-xl border-2 border-accent-green/60 bg-bg-panel/95 px-5 py-4 shadow-2xl shadow-accent-green/20 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-green/25">
          <PhoneIncoming className="h-5 w-5 animate-pulse text-accent-green" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-accent-green">Incoming call</div>
          <div className="font-mono text-xs text-ink-secondary">{incomingFrom}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleAnswer}
            className="flex items-center gap-1.5 rounded-md bg-accent-green px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <PhoneCall className="h-4 w-4" /> Answer
          </button>
          <button
            onClick={declineIncoming}
            title="Decline -- caller drops to voicemail"
            className="flex items-center gap-1.5 rounded-md border border-accent-red/40 bg-accent-red/10 px-2.5 py-2 text-sm font-semibold text-accent-red hover:bg-accent-red/20"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
