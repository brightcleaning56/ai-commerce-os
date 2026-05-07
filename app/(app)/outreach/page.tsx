"use client";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Linkedin,
  Mail,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Plus,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { useToast } from "@/components/Toast";
import { CAMPAIGNS, SAMPLE_SEQUENCE, type Campaign } from "@/lib/outreach";

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
}: {
  d: DraftItem;
  onUpdate: (id: string, status: DraftItem["status"]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"email" | "linkedin" | "sms">("email");
  const ago = relativeTime(d.createdAt);

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
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-panel p-1 text-xs w-fit">
            {(
              [
                ["email", "Email", Mail],
                ["linkedin", "LinkedIn", Linkedin],
                ["sms", "SMS", MessageSquare],
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
          </div>

          {d.status === "draft" && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => onUpdate(d.id, "approved")}
                className="flex items-center gap-1 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
              >
                <CheckCircle2 className="h-3 w-3" /> Approve
              </button>
              <button
                onClick={() => onUpdate(d.id, "sent")}
                className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs hover:bg-bg-hover"
              >
                <Send className="h-3 w-3" /> Mark sent
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
        </div>
      )}
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

export default function OutreachPage() {
  const [open, setOpen] = useState<Campaign | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>(CAMPAIGNS);
  const { toast } = useToast();

  function handleToggleStatus(c: Campaign) {
    const next: Campaign["status"] =
      c.status === "Active" ? "Paused" : c.status === "Paused" || c.status === "Draft" || c.status === "Completed" ? "Active" : "Paused";
    setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    setOpen({ ...c, status: next });
    toast(
      next === "Active"
        ? `Launched "${c.name}" — Outreach Agent is sending now`
        : `Paused "${c.name}"`
    );
  }

  function handleViewReplies(c: Campaign) {
    toast(`${c.replied} replies for "${c.name}" · ${pct(c.replied, c.sent)} reply rate`, "info");
  }

  function handleNewCampaign() {
    const id = `c_${Date.now().toString(36)}`;
    const c: Campaign = {
      id,
      name: `New Campaign · ${new Date().toLocaleDateString()}`,
      status: "Draft",
      channel: ["Email"],
      audience: "Pick an audience…",
      audienceCount: 0,
      sent: 0,
      opened: 0,
      replied: 0,
      meetings: 0,
      deals: 0,
      startedAt: "—",
      ownerAgent: "Outreach Agent",
    };
    setCampaigns((prev) => [c, ...prev]);
    setOpen(c);
    toast(`Drafted new campaign — configure and launch when ready`);
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

  const pendingDrafts = drafts.filter((d) => d.status === "draft");

  const totals = campaigns.reduce(
    (acc, c) => ({
      sent: acc.sent + c.sent,
      opened: acc.opened + c.opened,
      replied: acc.replied + c.replied,
      meetings: acc.meetings + c.meetings,
      deals: acc.deals + c.deals,
    }),
    { sent: 0, opened: 0, replied: 0, meetings: 0, deals: 0 }
  );

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
              {campaigns.filter((c) => c.status === "Active").length} active campaigns ·{" "}
              {totals.sent.toLocaleString()} messages sent ·{" "}
              {pct(totals.replied, totals.sent)} reply rate
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
          { l: "Total Sent", v: totals.sent.toLocaleString() },
          { l: "Opened", v: pct(totals.opened, totals.sent) },
          { l: "Replied", v: pct(totals.replied, totals.sent) },
          { l: "Meetings Booked", v: totals.meetings },
          { l: "Closed Deals", v: totals.deals },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
              {s.l}
            </div>
            <div className="mt-1 text-2xl font-bold">{s.v}</div>
          </div>
        ))}
      </div>

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
              <DraftCard key={d.id} d={d} onUpdate={updateDraftStatus} />
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
        <div className="border-b border-bg-border px-5 py-3.5 text-sm font-semibold">
          Campaigns
        </div>
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
            {campaigns.map((c) => (
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
                    {c.channel.map((ch) => {
                      const I = CHANNEL_ICON[ch];
                      return (
                        <span
                          key={ch}
                          className="grid h-6 w-6 place-items-center rounded-md bg-brand-500/10 text-brand-200"
                        >
                          <I className="h-3 w-3" />
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="text-xs text-ink-secondary">{c.audience}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    {c.audienceCount} prospects
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
