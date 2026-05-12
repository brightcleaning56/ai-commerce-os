"use client";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PublicThreadMessage = {
  role: "agent" | "buyer";
  body: string;
  at: string;
};

type ReplyPayload = {
  workspace: string;
  sender: { name: string; title: string };
  buyerCompany: string;
  buyerName: string;
  productName: string;
  originalEmail: { subject: string; body: string; sentAt: string | null };
  thread: PublicThreadMessage[];
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReplyPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReplyPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setLoadError("Missing reply token. Open the link from your email.");
        setLoading(false);
        return;
      }
      try {
        const r = await fetch(`/api/drafts/reply/${token}`, { cache: "no-store" });
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(d.error ?? `Couldn't load reply page (${r.status})`);
        } else {
          setData(d as ReplyPayload);
          if (d.buyerName) setSenderName(d.buyerName);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/drafts/reply/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          senderName: senderName.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Send failed (${r.status})`);
      setSent(true);
      setMessage("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't send reply");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-app text-ink-primary">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
        {/* Brand */}
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-brand shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="text-lg font-bold tracking-tight">AVYN Commerce</div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
          </div>
        ) : loadError && !data ? (
          <ErrorCard title="Reply link unusable" message={loadError} />
        ) : data ? (
          <div className="space-y-5">
            {/* Header */}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                Reply to outreach
              </div>
              <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
                {data.sender.name} from {data.workspace}
              </h1>
              <p className="mt-2 text-sm text-ink-secondary">
                Re: <span className="font-medium text-ink-primary">{data.productName}</span>
                {data.originalEmail.sentAt && (
                  <span className="text-ink-tertiary"> · sent {formatTime(data.originalEmail.sentAt)}</span>
                )}
              </p>
            </div>

            {/* Original message */}
            <div className="rounded-xl border border-bg-border bg-bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-brand text-[11px] font-bold">
                  {(data.sender.name || "?").split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-ink-tertiary">{data.sender.name} · {data.sender.title}</div>
                  <div className="mt-1 text-sm font-semibold">{data.originalEmail.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[13px] text-ink-secondary">
                    {data.originalEmail.body}
                  </pre>
                </div>
              </div>
            </div>

            {/* Existing thread (prior buyer/operator messages) */}
            {data.thread.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Conversation
                </div>
                {data.thread.map((m, i) => (
                  <div
                    key={`${m.at}-${i}`}
                    className={`rounded-xl border p-3 text-[13px] ${
                      m.role === "buyer"
                        ? "border-accent-blue/30 bg-accent-blue/5 ml-6"
                        : "border-bg-border bg-bg-card mr-6"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                      {m.role === "buyer" ? "You" : data.sender.name} · {formatTime(m.at)}
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-ink-secondary">
                      {m.body}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {/* Reply form OR sent confirmation */}
            {sent ? (
              <SentCard senderName={senderName || data.buyerName} workspace={data.workspace} />
            ) : (
              <div className="rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-500/5 to-transparent p-5">
                <div className="text-sm font-semibold">Your reply</div>
                <p className="mt-0.5 text-[11px] text-ink-tertiary">
                  Goes straight to {data.sender.name.split(" ")[0]}&apos;s dashboard. They&apos;ll respond from
                  there or follow up with you by email.
                </p>

                {loadError && (
                  <div className="mt-3 rounded-lg border border-accent-red/30 bg-accent-red/5 px-3 py-2 text-[12px] text-accent-red">
                    {loadError}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                      Your name (optional)
                    </label>
                    <input
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder={data.buyerName || "Your full name"}
                      maxLength={80}
                      className="mt-1 h-10 w-full rounded-lg border border-bg-border bg-bg-app px-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                      Message
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your reply…"
                      maxLength={5000}
                      rows={6}
                      autoFocus
                      className="mt-1 w-full rounded-lg border border-bg-border bg-bg-app px-3 py-2 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
                    />
                    <div className="mt-0.5 text-[10px] text-ink-tertiary">
                      {message.length} / 5000
                    </div>
                  </div>
                  <button
                    onClick={submit}
                    disabled={submitting || message.trim().length < 1}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-2.5 text-sm font-semibold shadow-glow disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Send reply
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="text-center text-[10px] text-ink-tertiary">
              Replying via web on AVYN Commerce. Powered by{" "}
              <a
                href="https://avyncommerce.com"
                className="text-brand-300 hover:underline"
              >
                avyncommerce.com
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SentCard({ senderName, workspace }: { senderName: string; workspace: string }) {
  return (
    <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 p-5">
      <div className="flex items-center gap-2 text-accent-green">
        <CheckCircle2 className="h-6 w-6" />
        <h2 className="text-lg font-bold">Reply sent</h2>
      </div>
      <p className="mt-2 text-sm text-ink-secondary">
        Thanks{senderName ? `, ${senderName.split(" ")[0]}` : ""} — your message landed in the {workspace} dashboard.
        They&apos;ll review it and respond shortly.
      </p>
      <a
        href="https://avyncommerce.com"
        className="mt-3 inline-flex items-center gap-1 text-sm text-brand-200 hover:underline"
      >
        Learn more about AVYN Commerce <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-accent-red">
        <AlertCircle className="h-6 w-6" />
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      <p className="text-sm text-ink-secondary">{message}</p>
      <a
        href="https://avyncommerce.com"
        className="inline-flex items-center gap-1 text-sm text-brand-200 hover:underline"
      >
        Visit avyncommerce.com <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
