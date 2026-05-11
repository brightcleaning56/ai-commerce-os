"use client";
import {
  ArrowLeftRight,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  Linkedin,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { useToast } from "@/components/Toast";
import { SAMPLE_SEQUENCE, type Campaign } from "@/lib/outreach";

/**
 * Adapt a real, derived campaign (from /api/outreach/campaigns) into the
 * shape the existing Campaign UI / Drawer expects. The drawer + table
 * column components were written against the old static `Campaign` type
 * (with `channel` singular-plural and `audience` string), so we keep
 * that shape stable and translate at the boundary.
 */
function adaptLiveCampaign(c: LiveCampaign): Campaign {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    channel: c.channels,
    audience: c.audienceSummary,
    audienceCount: c.audienceCount,
    sent: c.sent,
    opened: c.opened,
    replied: c.replied,
    meetings: c.meetings,
    deals: c.deals,
    startedAt: c.startedAt
      ? new Date(c.startedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })
      : "—",
    ownerAgent: c.ownerAgent,
  };
}

type DraftItem = {
  id: string;
  createdAt: string;
  buyerId: string;
  buyerCompany: string;
  buyerName: string;
  buyerTitle: string;
  productName: string;
  status: "draft" | "approved" | "sent" | "rejected";
  email: { subject: string; body: string };
  linkedin: { body: string };
  sms: { body: string };
  modelUsed: string;
  estCostUsd?: number;
  usedFallback: boolean;
  thread?: ThreadMsg[];
  sentAt?: string;
  sentToEmail?: string;
  redirectedFromEmail?: string;
  messageId?: string;
  emailProvider?: "postmark" | "resend" | "fallback";
  sendSimulated?: boolean;
  sendError?: string;
  // Tracked share link (set by /api/drafts/send when slice-28 minting succeeds)
  pipelineId?: string;
  shareLinkToken?: string;
  shareLinkUrl?: string;
  sentBody?: string;
  // Per-channel send state (slice 36)
  smsSentAt?: string;
  smsSentTo?: string;
  smsSimulated?: boolean;
  smsShareLinkToken?: string;
  smsShareLinkUrl?: string;
  smsSentBody?: string;
  smsSendError?: string;
  linkedinSentAt?: string;
  linkedinSentTo?: string;
  linkedinSimulated?: boolean;
  linkedinShareLinkToken?: string;
  linkedinShareLinkUrl?: string;
  linkedinSentBody?: string;
  linkedinSendError?: string;
  // Follow-up lineage (slice 34)
  parentDraftId?: string;
  followupNumber?: number;
  followupReason?: string;
};

type TrackingData = {
  tracked: boolean;
  reason?: string;
  pipelineId?: string;
  token?: string;
  label?: string;
  scope?: "full" | "recipient";
  createdAt?: string;
  expiresAt?: string;
  revoked?: boolean;
  revokedAt?: string | null;
  accessCount?: number;
  lastViewedAt?: string | null;
  recentViews?: { ts: string; ip?: string; userAgent?: string; referer?: string }[];
  shareUrl?: string | null;
};

type ThreadMsg = {
  id: string;
  role: "agent" | "buyer";
  subject?: string;
  body: string;
  at: string;
  runId?: string;
  cost?: number;
  summary?: string;
  recommendedAction?: string;
};

const DRAFT_TONE: Record<string, string> = {
  draft: "bg-accent-amber/15 text-accent-amber",
  approved: "bg-accent-green/15 text-accent-green",
  sent: "bg-accent-blue/15 text-accent-blue",
  rejected: "bg-accent-red/15 text-accent-red",
};

const CHANNEL_ICON = {
  Email: Mail,
  LinkedIn: Linkedin,
  SMS: MessageSquare,
  Phone: Phone,
};

const STATUS_TONE: Record<string, string> = {
  Active: "bg-accent-green/15 text-accent-green",
  Paused: "bg-accent-amber/15 text-accent-amber",
  Draft: "bg-bg-hover text-ink-secondary",
  Completed: "bg-accent-blue/15 text-accent-blue",
};

function pct(n: number, d: number) {
  if (!d) return "0.0%";
  return ((n / d) * 100).toFixed(1) + "%";
}

function CampaignDetail({
  c,
  onToggleStatus,
  onViewReplies,
}: {
  c: Campaign;
  onToggleStatus: (c: Campaign) => void;
  onViewReplies: (c: Campaign) => void;
}) {
  const [steps, setSteps] = useState(SAMPLE_SEQUENCE);
  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-ink-tertiary">
          Campaign
        </div>
        <div className="text-xl font-bold">{c.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-md px-2 py-0.5 font-semibold ${STATUS_TONE[c.status]}`}>
            {c.status}
          </span>
          <span className="text-ink-tertiary">·</span>
          <span className="text-ink-secondary">{c.audience}</span>
          <span className="text-ink-tertiary">·</span>
          <span className="text-ink-secondary">{c.audienceCount} prospects</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { l: "Sent", v: c.sent },
          { l: "Open", v: pct(c.opened, c.sent) },
          { l: "Reply", v: pct(c.replied, c.sent) },
          { l: "Meetings", v: c.meetings },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-bg-border bg-bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{s.l}</div>
            <div className="mt-1 text-base font-semibold">{s.v}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-brand-300" />
            Sequence ({steps.length} steps)
          </div>
          <button
            onClick={() =>
              setSteps((prev) => [
                ...prev,
                {
                  day: (prev.at(-1)?.day ?? 0) + 7,
                  channel: "Email",
                  subject: "",
                  body: "Add a follow-up here…",
                },
              ])
            }
            className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[11px] text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
          >
            <Plus className="h-3 w-3" /> Add step
          </button>
        </div>

        <div className="space-y-2">
          {steps.map((s, i) => {
            const Icon = CHANNEL_ICON[s.channel];
            return (
              <div
                key={i}
                className="rounded-lg border border-bg-border bg-bg-card p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-md bg-brand-500/15">
                      <Icon className="h-3.5 w-3.5 text-brand-300" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">
                        Day {s.day} · {s.channel}
                      </div>
                      {s.subject && (
                        <div className="text-[11px] text-ink-tertiary">
                          Subject: {s.subject}
                        </div>
                      )}
                    </div>
                  </div>
                  <button className="text-[11px] text-brand-300 hover:text-brand-200">
                    Edit
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs text-ink-secondary">
                  {s.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
          <Sparkles className="h-4 w-4" /> AI Personalization
        </div>
        <p className="mt-1 text-xs text-ink-secondary">
          Each send is rewritten by Claude Haiku 4.5 using buyer industry, last
          activity, and matched product. Estimated token cost:{" "}
          <span className="text-ink-primary">${(c.audienceCount * 0.0008).toFixed(2)}</span> per full sequence.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 pb-2">
        <button
          onClick={() => onToggleStatus(c)}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow"
        >
          {c.status === "Paused" || c.status === "Draft" ? (
            <><Play className="h-4 w-4" /> Launch</>
          ) : c.status === "Completed" ? (
            <><Play className="h-4 w-4" /> Reactivate</>
          ) : (
            <><Pause className="h-4 w-4" /> Pause</>
          )}
        </button>
        <button
          onClick={() => onViewReplies(c)}
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <CheckCircle2 className="h-4 w-4" /> View Replies ({c.replied})
        </button>
      </div>
    </div>
  );
}

function DraftCard({
  d,
  onUpdate,
  onThreadUpdate,
  onSendEmail,
  onSendChannel,
  onGenerateFollowup,
  onBuildQuote,
}: {
  d: DraftItem;
  onUpdate: (id: string, status: DraftItem["status"]) => void;
  onThreadUpdate: (id: string, thread: ThreadMsg[]) => void;
  onSendEmail: (id: string) => void;
  onSendChannel?: (id: string, channel: "sms" | "linkedin") => void;
  onGenerateFollowup?: (id: string) => void;
  onBuildQuote?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"email" | "linkedin" | "sms" | "thread">("email");
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [buyerReply, setBuyerReply] = useState("");
  const [negotiating, setNegotiating] = useState(false);
  const [negotiationMeta, setNegotiationMeta] = useState<{
    sentiment: string;
    recommendedAction: string;
    cost?: number;
    fallback: boolean;
    engagement?: {
      viewCount: number;
      warmth: "cold" | "warm" | "hot" | "scorching" | "unknown";
      lastViewedAt?: string;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [preview, setPreview] = useState<{
    open: boolean;
    loading: boolean;
    data: any | null;
    error: string | null;
  }>({ open: false, loading: false, data: null, error: null });
  const { toast } = useToast();
  const ago = relativeTime(d.createdAt);
  const threadCount = (d.thread ?? []).length;
  const buyerMessages = (d.thread ?? []).filter((m) => m.role === "buyer").length;

  // Fetch per-draft tracking data when sent. Re-poll every 20s while expanded
  // so a buyer's clicks reflect without a hard refresh.
  useEffect(() => {
    if (!d.shareLinkToken || !d.sentAt) {
      setTracking(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/drafts/${d.id}/tracking`);
        if (!res.ok) return;
        const json = (await res.json()) as TrackingData;
        if (!cancelled) setTracking(json);
      } catch {
        // best-effort
      }
    };
    load();
    if (expanded) {
      const t = setInterval(load, 20_000);
      return () => {
        cancelled = true;
        clearInterval(t);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [d.id, d.shareLinkToken, d.sentAt, expanded]);

  async function openPreview() {
    setPreview({ open: true, loading: true, data: null, error: null });
    try {
      const res = await fetch(`/api/drafts/${d.id}/preview`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview failed");
      setPreview({ open: true, loading: false, data: json, error: null });
    } catch (e) {
      setPreview({
        open: true,
        loading: false,
        data: null,
        error: e instanceof Error ? e.message : "Preview failed",
      });
    }
  }

  async function copyTrackedLink() {
    if (!d.shareLinkUrl) return;
    try {
      await navigator.clipboard.writeText(d.shareLinkUrl);
      toast(`Tracked link copied for ${d.buyerCompany}`, "success");
    } catch {
      window.prompt("Copy this link:", d.shareLinkUrl);
    }
  }

  async function revokeTrackedLink() {
    if (!d.shareLinkToken || !d.pipelineId) return;
    if (!window.confirm(`Revoke the tracked link for ${d.buyerCompany}? They'll lose access immediately.`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/share/${d.pipelineId}/revoke?token=${encodeURIComponent(d.shareLinkToken)}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Revoke failed");
      toast(`Link revoked for ${d.buyerCompany}`, "info");
      // Refresh tracking
      const ref = await fetch(`/api/drafts/${d.id}/tracking`);
      if (ref.ok) setTracking(await ref.json());
    } catch (e) {
      toast(e instanceof Error ? e.message : "Revoke failed", "error");
    }
  }

  async function sendBuyerReply() {
    if (buyerReply.trim().length < 5) {
      setError("Paste at least a sentence of the buyer's reply");
      return;
    }
    setNegotiating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/negotiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: d.id, buyerReply: buyerReply.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Negotiation failed");
      onThreadUpdate(d.id, data.thread);
      setNegotiationMeta({
        sentiment: data.sentiment,
        recommendedAction: data.recommendedAction,
        cost: data.run?.estCostUsd,
        fallback: data.run?.usedFallback ?? false,
        engagement: data.engagement,
      });
      setBuyerReply("");
      setShowReplyBox(false);
      setTab("thread");
      toast(
        data.run?.usedFallback
          ? "Counter-offer drafted (fallback) — review the thread"
          : `Counter-offer drafted by Negotiation Agent · $${data.run?.estCostUsd?.toFixed(5) ?? "—"}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Negotiation failed");
    } finally {
      setNegotiating(false);
    }
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card">
      <div
        className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-bg-hover/30"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gradient-brand text-[11px] font-bold">
            {d.buyerCompany.split(" ").slice(0, 2).map((w) => w[0]).join("")}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{d.buyerCompany}</span>
              <span className="text-ink-tertiary">·</span>
              <span className="text-ink-secondary">{d.buyerName}</span>
            </div>
            <div className="text-[11px] text-ink-tertiary">
              for <span className="text-brand-300">{d.productName}</span> · {ago} · {d.modelUsed}
              {d.sentAt && (
                <>
                  {" · "}
                  <span className="text-accent-green">
                    sent {relativeTime(d.sentAt)} → {d.sentToEmail}
                    {d.sendSimulated && " (simulated)"}
                    {d.redirectedFromEmail && ` (redirected from ${d.redirectedFromEmail})`}
                  </span>
                </>
              )}
              {d.sendError && !d.sentAt && (
                <>
                  {" · "}
                  <span className="text-accent-red">send failed: {d.sendError}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tracking?.tracked && !tracking.revoked && (
            <span
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                (tracking.accessCount ?? 0) > 0
                  ? "bg-accent-green/15 text-accent-green"
                  : "bg-bg-hover text-ink-tertiary"
              }`}
              title={
                tracking.lastViewedAt
                  ? `Last viewed ${new Date(tracking.lastViewedAt).toLocaleString()}`
                  : "Tracked link sent — no opens yet"
              }
            >
              <Eye className="h-2.5 w-2.5" />
              {tracking.accessCount ?? 0} view{(tracking.accessCount ?? 0) === 1 ? "" : "s"}
            </span>
          )}
          {tracking?.revoked && (
            <span
              className="flex items-center gap-1 rounded-md bg-accent-red/15 px-2 py-0.5 text-[10px] font-semibold text-accent-red"
              title="Tracked link was revoked"
            >
              <Link2 className="h-2.5 w-2.5" />
              revoked
            </span>
          )}
          {d.parentDraftId && (
            <span
              className="flex items-center gap-1 rounded-md bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-200"
              title={d.followupReason ?? "Follow-up draft"}
            >
              <ArrowLeftRight className="h-2.5 w-2.5" />
              follow-up #{d.followupNumber ?? 1}
            </span>
          )}
          {threadCount > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-200">
              <ArrowLeftRight className="h-2.5 w-2.5" />
              {threadCount} msg{threadCount === 1 ? "" : "s"}
            </span>
          )}
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${DRAFT_TONE[d.status]}`}>
            {d.status}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-ink-tertiary" />
          ) : (
            <ChevronDown className="h-4 w-4 text-ink-tertiary" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-bg-border px-4 py-4">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-bg-border bg-bg-panel p-1 text-xs w-fit">
            {(
              [
                ["email", "Email", Mail],
                ["linkedin", "LinkedIn", Linkedin],
                ["sms", "SMS", MessageSquare],
                ["thread", `Thread${threadCount > 0 ? ` (${threadCount})` : ""}`, ArrowLeftRight],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
                  tab === k
                    ? "bg-brand-500/15 text-brand-200"
                    : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-md border border-bg-border bg-bg-panel p-3">
            {tab === "email" && (
              <div className="space-y-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Subject</div>
                  <div className="font-semibold">{d.email.subject}</div>
                </div>
                <div className="border-t border-bg-border pt-2">
                  <pre className="whitespace-pre-wrap font-sans text-ink-secondary">{d.email.body}</pre>
                </div>
              </div>
            )}
            {tab === "linkedin" && (
              <pre className="whitespace-pre-wrap font-sans text-xs text-ink-secondary">
                {d.linkedin.body}
              </pre>
            )}
            {tab === "sms" && (
              <div className="text-xs">
                <pre className="whitespace-pre-wrap font-sans text-ink-secondary">{d.sms.body}</pre>
                <div className="mt-2 text-[10px] text-ink-tertiary">{d.sms.body.length} / 160 chars</div>
              </div>
            )}
            {tab === "thread" && (
              <div className="space-y-3 text-xs">
                {/* Original outbound */}
                <ThreadBubble
                  role="agent"
                  label="Us · Marcus"
                  subject={d.email.subject}
                  body={d.email.body}
                  at={d.createdAt}
                  hint={`Original outreach · ${d.modelUsed}${
                    d.estCostUsd ? ` · $${d.estCostUsd.toFixed(5)}` : ""
                  }`}
                />
                {(d.thread ?? []).map((m) => (
                  <ThreadBubble
                    key={m.id}
                    role={m.role}
                    label={m.role === "buyer" ? `${d.buyerName} · ${d.buyerCompany}` : "Us · Negotiation Agent"}
                    subject={m.subject}
                    body={m.body}
                    at={m.at}
                    hint={
                      m.role === "agent"
                        ? `Counter-offer${m.cost != null ? ` · $${m.cost.toFixed(5)}` : ""}${
                            m.recommendedAction ? ` · ${m.recommendedAction}` : ""
                          }`
                        : undefined
                    }
                    summary={m.summary}
                    recommendedAction={m.recommendedAction}
                  />
                ))}
                {negotiationMeta && (
                  <div className="rounded-md border border-brand-500/30 bg-brand-500/5 px-3 py-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-brand-300">
                      <Sparkles className="h-3 w-3" /> Negotiation insight
                    </div>
                    <div className="mt-1 text-[11px] text-ink-secondary">
                      Buyer sentiment:{" "}
                      <span className="font-medium text-ink-primary">{negotiationMeta.sentiment}</span>{" "}
                      · Recommended:{" "}
                      <span className="font-medium text-ink-primary">{negotiationMeta.recommendedAction}</span>
                    </div>
                    {negotiationMeta.engagement && negotiationMeta.engagement.warmth !== "unknown" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="text-ink-tertiary">Engagement signal used:</span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-bold uppercase tracking-wider ${
                            negotiationMeta.engagement.warmth === "scorching"
                              ? "bg-accent-amber/15 text-accent-amber"
                              : negotiationMeta.engagement.warmth === "hot"
                              ? "bg-accent-green/15 text-accent-green"
                              : negotiationMeta.engagement.warmth === "cold"
                              ? "bg-accent-blue/15 text-accent-blue"
                              : "bg-bg-hover text-ink-secondary"
                          }`}
                        >
                          {negotiationMeta.engagement.warmth}
                        </span>
                        <span className="text-ink-tertiary">
                          · {negotiationMeta.engagement.viewCount} view
                          {negotiationMeta.engagement.viewCount === 1 ? "" : "s"}
                          {negotiationMeta.engagement.lastViewedAt && (
                            <> · last opened {relativeTime(negotiationMeta.engagement.lastViewedAt)}</>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Buyer reply editor */}
                {!showReplyBox ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setShowReplyBox(true)}
                      className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
                    >
                      <UserIcon className="h-3 w-3" /> Buyer replied — feed to Negotiation Agent
                    </button>
                    {d.sentAt && (
                      <button
                        onClick={async () => {
                          const sample =
                            "Hi Marcus, thanks for reaching out. The price feels a bit high vs what we typically pay in this category. Could you do better at MOQ 500?";
                          setNegotiating(true);
                          setError(null);
                          try {
                            const res = await fetch("/api/inbound/test", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ draftId: d.id, body: sample }),
                            });
                            const data = await res.json();
                            if (!res.ok || !data.ok)
                              throw new Error(data.reason ?? data.error ?? "Inbound failed");
                            // Refetch thread
                            const r = await fetch("/api/drafts").then((x) => x.json());
                            const fresh = (r.drafts ?? []).find((x: DraftItem) => x.id === d.id);
                            if (fresh?.thread) onThreadUpdate(d.id, fresh.thread);
                            if (data.negotiation) {
                              setNegotiationMeta({
                                sentiment: data.negotiation.sentiment,
                                recommendedAction: data.negotiation.recommendedAction,
                                fallback: false,
                                engagement: data.negotiation.engagement,
                              });
                            }
                            setTab("thread");
                            toast(
                              `Inbound simulated · matched by ${data.match?.matchedBy} · counter drafted`
                            );
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Inbound failed");
                          } finally {
                            setNegotiating(false);
                          }
                        }}
                        disabled={negotiating}
                        className="flex items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/5 px-3 py-2 text-xs text-brand-200 hover:bg-brand-500/15 disabled:opacity-60"
                      >
                        {negotiating ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Simulating…</>
                        ) : (
                          <><Sparkles className="h-3 w-3" /> Simulate inbound reply</>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-accent-blue/30 bg-accent-blue/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-accent-blue">
                        <UserIcon className="h-3 w-3" /> Paste buyer&apos;s reply
                      </div>
                      <button
                        onClick={() => {
                          setShowReplyBox(false);
                          setBuyerReply("");
                          setError(null);
                        }}
                        className="text-[11px] text-ink-tertiary hover:text-ink-primary"
                      >
                        Cancel
                      </button>
                    </div>
                    <textarea
                      value={buyerReply}
                      onChange={(e) => setBuyerReply(e.target.value)}
                      placeholder="Hi Marcus, thanks for reaching out. Pricing is a bit higher than what we'd typically pay for this category — could you do better at MOQ 500?"
                      rows={4}
                      className="mt-2 w-full rounded-md border border-bg-border bg-bg-panel p-3 text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
                    />
                    {error && (
                      <div className="mt-2 text-[11px] text-accent-red">{error}</div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-ink-tertiary">
                        {buyerReply.length} chars · agent uses Claude Sonnet 4.6
                      </span>
                      <button
                        onClick={sendBuyerReply}
                        disabled={negotiating}
                        className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow disabled:opacity-60"
                      >
                        {negotiating ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" /> Drafting counter…
                          </>
                        ) : (
                          <>
                            <Bot className="h-3 w-3" /> Send to Negotiation Agent
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {d.status === "draft" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => onUpdate(d.id, "approved")}
                className="flex items-center gap-1 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
              >
                <CheckCircle2 className="h-3 w-3" /> Approve
              </button>
              <button
                onClick={() => onSendEmail(d.id)}
                className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs hover:bg-bg-hover"
              >
                <Send className="h-3 w-3" /> Send email
              </button>
              {onSendChannel && (
                <>
                  <button
                    onClick={() => onSendChannel(d.id, "sms")}
                    disabled={!!d.smsSentAt}
                    className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs hover:bg-bg-hover disabled:opacity-60"
                    title={d.smsSentAt ? "SMS already sent" : "Send via SMS (Twilio)"}
                  >
                    <MessageSquare className="h-3 w-3" /> {d.smsSentAt ? "SMS sent" : "Send SMS"}
                  </button>
                  <button
                    onClick={() => onSendChannel(d.id, "linkedin")}
                    disabled={!!d.linkedinSentAt}
                    className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs hover:bg-bg-hover disabled:opacity-60"
                    title={
                      d.linkedinSentAt
                        ? "LinkedIn DM marked as sent"
                        : "Mint a tracked LinkedIn DM (manual paste — no API)"
                    }
                  >
                    <Linkedin className="h-3 w-3" /> {d.linkedinSentAt ? "DM sent" : "Send DM"}
                  </button>
                </>
              )}
              <button
                onClick={openPreview}
                className="flex items-center gap-1 rounded-md border border-brand-500/30 bg-brand-500/5 px-3 py-1.5 text-xs text-brand-200 hover:bg-brand-500/15"
                title="Preview what the buyer will see when they click the tracked link"
              >
                <Eye className="h-3 w-3" /> Preview buyer view
              </button>
              <button
                onClick={() => onUpdate(d.id, "rejected")}
                className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs text-ink-secondary hover:bg-accent-red/10 hover:text-accent-red"
              >
                <XCircle className="h-3 w-3" /> Discard
              </button>
              {d.estCostUsd != null && (
                <span className="ml-auto text-[10px] text-ink-tertiary">
                  cost ${d.estCostUsd.toFixed(5)}
                </span>
              )}
            </div>
          )}

          {/* Preview modal — inline panel showing what the buyer will see when they click the tracked link */}
          {preview.open && (
            <div className="mt-4 rounded-lg border border-brand-500/30 bg-bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bg-border px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Eye className="h-3.5 w-3.5 text-brand-300" /> Buyer-view preview
                  <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-200">
                    Recipient scope
                  </span>
                </div>
                <button
                  onClick={() => setPreview({ ...preview, open: false })}
                  className="text-[11px] text-ink-tertiary hover:text-ink-primary"
                >
                  Close
                </button>
              </div>
              {preview.loading && (
                <div className="flex items-center gap-2 px-4 py-6 text-xs text-ink-tertiary">
                  <Loader2 className="h-3 w-3 animate-spin" /> Building preview…
                </div>
              )}
              {preview.error && (
                <div className="px-4 py-3 text-xs text-accent-red">{preview.error}</div>
              )}
              {preview.data && (
                <div className="space-y-3 px-4 py-3 text-xs">
                  <div className="rounded-md border border-bg-border bg-bg-card p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent-green">
                      <ShieldCheck className="h-3 w-3" /> Visible to {d.buyerCompany}
                    </div>
                    <ul className="space-y-1">
                      {(preview.data.meta?.visible ?? []).map((s: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-ink-secondary">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent-green" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-md border border-bg-border bg-bg-card p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent-amber">
                      <EyeOff className="h-3 w-3" /> Filtered out (sender-only)
                    </div>
                    <ul className="space-y-1">
                      {(preview.data.meta?.filtered ?? []).map((s: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-ink-secondary">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent-amber" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-md border border-bg-border bg-bg-card p-3">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      Email body that will be sent
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-[11px] text-ink-secondary">
                      {preview.data.sampleEmailBody}
                    </pre>
                  </div>
                  <details className="rounded-md border border-bg-border bg-bg-card">
                    <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-ink-secondary hover:text-ink-primary">
                      Inspect full preview JSON
                    </summary>
                    <pre className="max-h-72 overflow-auto px-3 pb-3 text-[10px] text-ink-tertiary">
                      {JSON.stringify(preview.data.preview, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          )}

          {/* Tracked-link detail panel — only shown when send produced a tracked link */}
          {tracking?.tracked && (
            <div className="mt-4 rounded-md border border-bg-border bg-bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bg-border px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold">
                  <Link2 className="h-3 w-3 text-brand-300" /> Tracked link
                  {tracking.revoked ? (
                    <span className="rounded bg-accent-red/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-red">
                      Revoked
                    </span>
                  ) : (
                    <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-200">
                      Recipient
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {!tracking.revoked && (
                    <>
                      <button
                        onClick={copyTrackedLink}
                        className="rounded-md border border-bg-border bg-bg-card px-2 py-1 text-[10px] hover:bg-bg-hover"
                      >
                        Copy URL
                      </button>
                      <a
                        href={d.shareLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border border-bg-border bg-bg-card px-2 py-1 text-[10px] hover:bg-bg-hover"
                      >
                        Open
                      </a>
                      {onGenerateFollowup && (
                        <button
                          onClick={() => onGenerateFollowup(d.id)}
                          className="rounded-md border border-brand-500/30 bg-brand-500/5 px-2 py-1 text-[10px] text-brand-200 hover:bg-brand-500/15"
                          title="Generate a follow-up draft now (lands in approval queue)"
                        >
                          Follow up
                        </button>
                      )}
                      {onBuildQuote && (
                        <button
                          onClick={() => onBuildQuote(d.id)}
                          className="flex items-center gap-1 rounded-md border border-accent-green/30 bg-accent-green/5 px-2 py-1 text-[10px] text-accent-green hover:bg-accent-green/10"
                          title="Generate a formal quote tied to this draft"
                        >
                          <DollarSign className="h-2.5 w-2.5" /> Quote
                        </button>
                      )}
                      <button
                        onClick={revokeTrackedLink}
                        className="rounded-md border border-accent-red/30 bg-accent-red/5 px-2 py-1 text-[10px] text-accent-red hover:bg-accent-red/10"
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 px-3 py-2.5 sm:grid-cols-4">
                <MiniStat label="Views" v={tracking.accessCount ?? 0} tone={(tracking.accessCount ?? 0) > 0 ? "green" : undefined} />
                <MiniStat
                  label="Last viewed"
                  v={tracking.lastViewedAt ? relativeTime(tracking.lastViewedAt) : "—"}
                />
                <MiniStat
                  label="Expires"
                  v={tracking.expiresAt ? relativeTime(tracking.expiresAt).replace("ago", "from now") : "Never"}
                  hint={tracking.expiresAt ? new Date(tracking.expiresAt).toLocaleString() : ""}
                />
                <MiniStat label="Label" v={tracking.label ?? "—"} />
              </div>
              {(tracking.recentViews ?? []).length > 0 && (
                <div className="border-t border-bg-border">
                  <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-ink-tertiary">
                    Recent opens
                  </div>
                  <ul className="divide-y divide-bg-border">
                    {(tracking.recentViews ?? []).map((v, i) => (
                      <li key={i} className="flex items-start gap-2 px-3 py-1.5 text-[10px]">
                        <Eye className="mt-0.5 h-2.5 w-2.5 shrink-0 text-brand-300" />
                        <div className="min-w-0 flex-1">
                          <div className="text-ink-primary">{new Date(v.ts).toLocaleString()}</div>
                          <div className="truncate text-[9px] text-ink-tertiary">
                            {v.ip ? `${v.ip} · ` : ""}
                            {v.userAgent
                              ? v.userAgent.length > 80
                                ? v.userAgent.slice(0, 80) + "…"
                                : v.userAgent
                              : "unknown UA"}
                          </div>
                        </div>
                        <div className="text-[9px] text-ink-tertiary">{relativeTime(v.ts)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(tracking.accessCount ?? 0) === 0 && !tracking.revoked && (
                <div className="border-t border-bg-border px-3 py-2 text-[10px] text-ink-tertiary">
                  Email sent — no opens yet. The link is live; any view will show up here.
                </div>
              )}
            </div>
          )}

          {/* Hint when draft is sent but tracking isn't available (legacy/pre-slice-28) */}
          {d.sentAt && !tracking?.tracked && tracking !== null && (
            <div className="mt-3 rounded-md border border-bg-border bg-bg-hover/30 px-3 py-2 text-[10px] text-ink-tertiary">
              No tracked link for this draft — {tracking.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  v,
  hint,
  tone,
}: {
  label: string;
  v: string | number;
  hint?: string;
  tone?: "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-accent-green"
      : tone === "amber"
      ? "text-accent-amber"
      : tone === "red"
      ? "text-accent-red"
      : "";
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-0.5 truncate text-[12px] font-semibold ${toneClass}`} title={hint || String(v)}>
        {v}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function ThreadBubble({
  role,
  label,
  subject,
  body,
  at,
  hint,
  summary,
}: {
  role: "agent" | "buyer";
  label: string;
  subject?: string;
  body: string;
  at: string;
  hint?: string;
  summary?: string;
  recommendedAction?: string;
}) {
  const isAgent = role === "agent";
  return (
    <div className={`flex items-start gap-2.5 ${isAgent ? "" : "flex-row-reverse"}`}>
      <div
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
          isAgent ? "bg-gradient-brand" : "bg-accent-blue/20 text-accent-blue"
        }`}
      >
        {isAgent ? <Bot className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
      </div>
      <div
        className={`min-w-0 flex-1 rounded-lg border p-3 ${
          isAgent
            ? "border-brand-500/30 bg-brand-500/5"
            : "border-accent-blue/30 bg-accent-blue/5"
        }`}
      >
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="font-semibold uppercase tracking-wider text-ink-secondary">
            {label}
          </span>
          <span className="text-ink-tertiary">{relativeTime(at)}</span>
        </div>
        {subject && (
          <div className="mt-1 text-xs font-semibold">{subject}</div>
        )}
        <pre className="mt-1.5 whitespace-pre-wrap font-sans text-xs text-ink-primary">
          {body}
        </pre>
        {hint && (
          <div className="mt-2 border-t border-bg-border pt-2 text-[10px] text-ink-tertiary">
            {hint}
          </div>
        )}
        {summary && (
          <div className="mt-1 text-[10px] text-ink-tertiary italic">
            &ldquo;{summary}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}

type LiveOutreachStats = {
  hasAnyData: boolean;
  sent: number;
  opened: number;
  replied: number;
  meetingsBooked: number;
  closedDeals: number;
  inFlightDrafts: number;
  openRatePct: number;
  replyRatePct: number;
};

type LiveCampaign = {
  id: string;
  name: string;
  status: "Active" | "Paused" | "Draft" | "Completed";
  channels: ("Email" | "LinkedIn" | "SMS" | "Phone")[];
  audienceSummary: string;
  audienceCount: number;
  sent: number;
  opened: number;
  replied: number;
  meetings: number;
  deals: number;
  startedAt: string;
  ownerAgent: "Outreach Agent";
};

export default function OutreachPage() {
  const [open, setOpen] = useState<Campaign | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [liveStats, setLiveStats] = useState<LiveOutreachStats | null>(null);
  const [liveCampaigns, setLiveCampaigns] = useState<LiveCampaign[] | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      try {
        const r = await fetch("/api/outreach/stats", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as LiveOutreachStats;
        if (!cancelled) setLiveStats(d);
      } catch {
        // Silent — page falls back to "—" placeholders below.
      }
    }
    async function loadCampaigns() {
      try {
        const r = await fetch("/api/outreach/campaigns", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setLiveCampaigns(d.campaigns ?? []);
      } catch {
        if (!cancelled) setLiveCampaigns([]);
      }
    }
    loadStats();
    loadCampaigns();
    const id = setInterval(() => { loadStats(); loadCampaigns(); }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  function handleToggleStatus(c: Campaign) {
    // Campaigns are derived from real drafts + transactions — they can't
    // be manually paused/launched. Status reflects pipeline activity:
    // Active = drafts in last 7d, Paused = older, Completed = all txns
    // released. Tell the operator what to do instead.
    toast(
      c.status === "Active"
        ? `"${c.name}" is auto-managed by the Outreach Agent. To pause it, stop drafting outreach for this product.`
        : `"${c.name}" will reactivate the next time the Outreach Agent drafts for this product.`,
      "info",
    );
  }

  function handleViewReplies(c: Campaign) {
    toast(`${c.replied} replies for "${c.name}" · ${pct(c.replied, c.sent)} reply rate`, "info");
  }

  function handleNewCampaign() {
    // Campaigns are now derived, not manually created. Direct the
    // operator to the real lever: draft outreach for a new product.
    toast(
      `Campaigns now appear automatically the moment the Outreach Agent drafts for a new product. To start a new one, add a product to the catalog.`,
      "info",
    );
  }

  useEffect(() => {
    fetch("/api/drafts")
      .then((r) => r.json())
      .then((d) => setDrafts(d.drafts ?? []))
      .catch(() => {});
  }, []);

  async function updateDraftStatus(id: string, status: DraftItem["status"]) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    try {
      await fetch("/api/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      // optimistic — leave UI in current state
    }
  }

  function updateDraftThread(id: string, thread: ThreadMsg[]) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, thread } : d)));
  }

  async function sendDraftEmail(id: string) {
    try {
      const res = await fetch("/api/drafts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Send failed", "error");
        if (data.draft) {
          setDrafts((prev) => prev.map((d) => (d.id === id ? data.draft : d)));
        }
        return;
      }
      setDrafts((prev) => prev.map((d) => (d.id === id ? data.draft : d)));
      const r = data.result;
      if (r.simulated) {
        toast(`Sent (simulated · no provider configured)`, "info");
      } else if (r.redirectedFrom) {
        toast(`Sent via ${r.provider} · redirected to ${r.sentTo}`, "info");
      } else {
        toast(`Sent via ${r.provider} to ${r.sentTo}`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Send failed", "error");
    }
  }

  async function sendDraftChannel(id: string, channel: "sms" | "linkedin") {
    try {
      const res = await fetch(`/api/drafts/${id}/send-channel?channel=${channel}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? `${channel.toUpperCase()} send failed`, "error");
        if (data.draft) setDrafts((prev) => prev.map((d) => (d.id === id ? data.draft : d)));
        return;
      }
      setDrafts((prev) => prev.map((d) => (d.id === id ? data.draft : d)));
      const r = data.result;
      const label = channel === "sms" ? "SMS" : "LinkedIn DM";
      if (r.simulated) {
        toast(`${label} sent (simulated)`, "info");
      } else if (r.redirectedFrom) {
        toast(`${label} sent · redirected to ${r.sentTo}`, "info");
      } else {
        toast(`${label} sent to ${r.sentTo}`, "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : `${channel.toUpperCase()} send failed`, "error");
    }
  }

  async function buildQuote(id: string) {
    try {
      const res = await fetch(`/api/drafts/${id}/quote`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Quote build failed", "error");
        return;
      }
      const q = data.quote;
      const url = `${window.location.origin}/quote/${q.id}?t=${q.shareToken}`;
      try {
        await navigator.clipboard.writeText(url);
        toast(
          data.alreadyExisted
            ? `Quote already exists for ${q.buyerCompany} — link copied`
            : `Quote drafted for ${q.buyerCompany} ($${q.total.toLocaleString()}) — link copied`,
          "success"
        );
      } catch {
        window.prompt("Quote URL:", url);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Quote build failed", "error");
    }
  }

  async function generateFollowup(id: string) {
    try {
      const res = await fetch(`/api/drafts/${id}/followup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Followup failed", "error");
        return;
      }
      // Refresh drafts so the new follow-up shows in the list
      const fresh = await fetch("/api/drafts").then((r) => r.json());
      setDrafts(fresh.drafts ?? []);
      if (data.alreadyExisted) {
        toast(`Follow-up already exists for ${data.draft.buyerCompany} — see approval queue`, "info");
      } else {
        toast(`Follow-up drafted for ${data.draft.buyerCompany} — review in queue`, "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Followup failed", "error");
    }
  }

  const pendingDrafts = drafts.filter((d) => d.status === "draft");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Outreach Automation</h1>
            <p className="text-xs text-ink-secondary">
              {liveStats
                ? `${liveStats.inFlightDrafts} in-flight · ${liveStats.sent.toLocaleString()} sent · ${liveStats.replyRatePct.toFixed(1)}% reply rate`
                : "Loading live stats…"}
            </p>
          </div>
        </div>
        <button
          onClick={handleNewCampaign}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
        >
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { l: "Total Sent", v: liveStats ? liveStats.sent.toLocaleString() : "—" },
          { l: "Opened", v: liveStats ? (liveStats.sent > 0 ? `${liveStats.openRatePct.toFixed(1)}%` : "—") : "—" },
          { l: "Replied", v: liveStats ? (liveStats.sent > 0 ? `${liveStats.replyRatePct.toFixed(1)}%` : "—") : "—" },
          { l: "Meetings Booked", v: liveStats ? liveStats.meetingsBooked : "—" },
          { l: "Closed Deals", v: liveStats ? liveStats.closedDeals : "—" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
              {s.l}
            </div>
            <div className="mt-1 text-2xl font-bold">{s.v}</div>
          </div>
        ))}
      </div>

      {liveStats && !liveStats.hasAnyData && (
        <div className="flex items-start gap-2 rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-3 text-xs">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
            <Send className="h-3.5 w-3.5 text-accent-amber" />
          </div>
          <div className="flex-1 text-ink-secondary">
            <span className="font-semibold text-accent-amber">No outreach activity yet</span>
            {" "}— the tiles above start populating once you send your first draft. Generate one from the{" "}
            <a href="/pipeline" className="text-brand-300 hover:text-brand-200 underline">pipeline</a>{" "}
            or{" "}
            <a href="/products" className="text-brand-300 hover:text-brand-200 underline">products</a>{" "}
            page. The campaigns table below uses sample data so the layout is visible.
          </div>
        </div>
      )}

      {drafts.length > 0 && (
        <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent">
          <div className="flex items-center justify-between border-b border-brand-500/20 px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-brand-300" /> AI-generated drafts queue
              {pendingDrafts.length > 0 && (
                <span className="rounded-md bg-accent-amber/15 px-2 py-0.5 text-[10px] font-semibold text-accent-amber">
                  {pendingDrafts.length} awaiting review
                </span>
              )}
            </div>
            <span className="text-[11px] text-ink-tertiary">
              <Clock className="mr-1 inline h-3 w-3" />
              {drafts.length} total
            </span>
          </div>
          <div className="space-y-2 p-3">
            {drafts.slice(0, 5).map((d) => (
              <DraftCard
                key={d.id}
                d={d}
                onUpdate={updateDraftStatus}
                onThreadUpdate={updateDraftThread}
                onSendEmail={sendDraftEmail}
                onSendChannel={sendDraftChannel}
                onGenerateFollowup={generateFollowup}
                onBuildQuote={buildQuote}
              />
            ))}
            {drafts.length > 5 && (
              <div className="px-3 py-2 text-center text-[11px] text-ink-tertiary">
                + {drafts.length - 5} more drafts
              </div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            Campaigns
            <span className="rounded bg-accent-green/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent-green">
              Live
            </span>
          </div>
          <span className="text-[11px] text-ink-tertiary">
            Auto-grouped by product · counts derived from real drafts &amp; transactions
          </span>
        </div>
        {liveCampaigns === null ? (
          <div className="flex items-center gap-2 px-5 py-8 text-[12px] text-ink-tertiary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading campaigns…
          </div>
        ) : liveCampaigns.length === 0 ? (
          <div className="px-5 py-8 text-center text-[12px] text-ink-tertiary">
            <div className="mb-1 font-medium text-ink-secondary">No campaigns yet</div>
            <div>
              The Outreach Agent will create one automatically the first time it drafts
              for a product. Add a product to the catalog to kick things off.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Campaign</th>
                  <th className="px-3 py-2.5 text-left font-medium">Channels</th>
                  <th className="px-3 py-2.5 text-left font-medium">Audience</th>
                  <th className="px-3 py-2.5 text-left font-medium">Sent</th>
                  <th className="px-3 py-2.5 text-left font-medium">Reply</th>
                  <th className="px-3 py-2.5 text-left font-medium">Meetings</th>
                  <th className="px-3 py-2.5 text-left font-medium">Deals</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {liveCampaigns.map(adaptLiveCampaign).map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setOpen(c)}
                    className="cursor-pointer border-t border-bg-border hover:bg-bg-hover/30"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-ink-tertiary">
                        <Calendar className="h-3 w-3" /> {c.startedAt}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {c.channel.length === 0 ? (
                          <span className="text-[11px] text-ink-tertiary">—</span>
                        ) : (
                          c.channel.map((ch) => {
                            const I = CHANNEL_ICON[ch];
                            return (
                              <span
                                key={ch}
                                className="grid h-6 w-6 place-items-center rounded-md bg-brand-500/10 text-brand-200"
                              >
                                <I className="h-3 w-3" />
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-xs text-ink-secondary">{c.audience}</div>
                      <div className="text-[11px] text-ink-tertiary">
                        {c.audienceCount} buyer{c.audienceCount === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td className="px-3 py-3">{c.sent}</td>
                    <td className="px-3 py-3 text-accent-cyan">{pct(c.replied, c.sent)}</td>
                    <td className="px-3 py-3">{c.meetings}</td>
                    <td className="px-3 py-3 font-semibold text-accent-green">
                      {c.deals}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[c.status]}`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title="Campaign Details"
        width="max-w-2xl"
      >
        {open && (
          <CampaignDetail
            c={open}
            onToggleStatus={handleToggleStatus}
            onViewReplies={handleViewReplies}
          />
        )}
      </Drawer>
    </div>
  );
}
