import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { listVoicemails } from "@/lib/voicemails";
import { listVoiceRecordings } from "@/lib/voiceRecordings";
import { callsStore } from "@/lib/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/voice/transcripts/search?q=<text>&limit=N&since=ISO
 *
 * Full-text search across voicemail transcriptions. Returns matching
 * voicemails newest-first with the matching snippet (±60 chars
 * around the first match) so the operator can scan results without
 * loading every transcript.
 *
 * Query params:
 *   q       (required) text to search for, case-insensitive
 *   limit   max results (default 50, max 500)
 *   since   ISO timestamp -- only voicemails recorded at/after this
 *   unreadOnly  "true" -> filter to unread voicemails only
 *
 * Capability: voice:read.
 *
 * Slice 46 covers voicemail transcripts (the only kind we currently
 * capture). Outbound call recordings don't have transcripts wired
 * yet -- slice 46.5 would add them via Twilio's optional
 * transcribe="true" on the outbound <Dial>.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "voice:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const limitRaw = parseInt(sp.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 50;
  const sinceRaw = sp.get("since");
  const sinceMs =
    sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw).getTime() : 0;
  const unreadOnly = sp.get("unreadOnly") === "true";

  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  const [voicemailList, recordings] = await Promise.all([
    listVoicemails(),
    listVoiceRecordings(),
  ]);
  const needle = q.toLowerCase();
  const out: Array<{
    id: string;
    kind: "voicemail" | "outbound";
    from: string;
    durationSec: number;
    recordedAt: string;
    read: boolean;
    snippet: string;
    matchOffset: number;
  }> = [];

  // ── Voicemail transcripts ───────────────────────────────────────
  for (const vm of voicemailList) {
    if (!vm.transcription) continue;
    if (vm.transcriptionStatus && vm.transcriptionStatus !== "completed") continue;
    if (unreadOnly && vm.read) continue;
    if (sinceMs > 0 && new Date(vm.recordedAt).getTime() < sinceMs) continue;

    const lower = vm.transcription.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx === -1) continue;

    const snippetStart = Math.max(0, idx - 60);
    const snippetEnd = Math.min(vm.transcription.length, idx + needle.length + 60);
    const prefix = snippetStart > 0 ? "…" : "";
    const suffix = snippetEnd < vm.transcription.length ? "…" : "";
    const snippet = `${prefix}${vm.transcription.slice(snippetStart, snippetEnd)}${suffix}`;

    out.push({
      id: vm.id,
      kind: "voicemail",
      from: vm.from,
      durationSec: vm.durationSec,
      recordedAt: vm.recordedAt,
      read: vm.read,
      snippet,
      matchOffset: idx,
    });
  }

  // ── Slice 52: outbound recording transcripts ────────────────────
  // Recordings don't have a `from` (they have callSid + we fetch the
  // matching Call's toContact / toNumber for display). unreadOnly
  // is meaningless for outbound (always treat as "read"); skip when
  // the operator filters to unread-only.
  if (!unreadOnly) {
    for (const rec of recordings) {
      if (!rec.transcription) continue;
      if (rec.transcriptionStatus && rec.transcriptionStatus !== "completed") continue;
      if (sinceMs > 0 && new Date(rec.recordedAt).getTime() < sinceMs) continue;

      const lower = rec.transcription.toLowerCase();
      const idx = lower.indexOf(needle);
      if (idx === -1) continue;

      const snippetStart = Math.max(0, idx - 60);
      const snippetEnd = Math.min(rec.transcription.length, idx + needle.length + 60);
      const prefix = snippetStart > 0 ? "…" : "";
      const suffix = snippetEnd < rec.transcription.length ? "…" : "";
      const snippet = `${prefix}${rec.transcription.slice(snippetStart, snippetEnd)}${suffix}`;

      // Lookup the Call record for display context (best-effort)
      const call = await callsStore.getByCallSid(rec.callSid).catch(() => null);
      out.push({
        id: rec.callSid,
        kind: "outbound",
        from: call?.toContact || call?.toNumber || rec.callSid.slice(-8),
        durationSec: rec.durationSec,
        recordedAt: rec.recordedAt,
        read: true,
        snippet,
        matchOffset: idx,
      });
    }
  }

  out.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  return NextResponse.json({
    q,
    total: out.length,
    results: out.slice(0, limit),
    truncated: out.length > limit,
    sources: {
      voicemails: out.filter((r) => r.kind === "voicemail").length,
      outbound: out.filter((r) => r.kind === "outbound").length,
    },
  });
}
