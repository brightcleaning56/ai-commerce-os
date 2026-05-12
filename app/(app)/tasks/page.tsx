"use client";
import {
  Bot,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

type LocalTask = {
  id: string;
  buyerId: string;
  buyerCompany: string;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  type: "phone" | "sequence";
  createdAt: string;
  done?: boolean;
};

type BuyerContact = {
  id: string;
  phone?: string;
  email?: string;
};

const STORAGE_KEY = "aicos:tasks:v1";

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [filter, setFilter] = useState<"all" | "phone" | "sequence" | "open" | "done">("open");
  // Live buyer lookup so we can resolve phone/email for tasks created
  // BEFORE the task type included those fields. New tasks snapshot the
  // contact info themselves; this is just the back-fill path.
  const [buyerById, setBuyerById] = useState<Record<string, BuyerContact>>({});
  const { toast } = useToast();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTasks(JSON.parse(raw));
    } catch {}
    // Best-effort buyer lookup -- silent if /api/discovered-buyers fails.
    fetch("/api/discovered-buyers")
      .then((r) => (r.ok ? r.json() : { buyers: [] }))
      .then((d) => {
        const map: Record<string, BuyerContact> = {};
        for (const b of d.buyers ?? []) {
          map[b.id] = { id: b.id, phone: b.phone, email: b.email };
        }
        setBuyerById(map);
      })
      .catch(() => {});
  }, []);

  /**
   * Resolve a task's contact info from either the snapshot on the task itself
   * or the live buyer record. Snapshot wins (preserves the contact even if
   * the buyer record is later edited or removed).
   */
  function contactFor(t: LocalTask): { phone?: string; email?: string } {
    const liveBuyer = buyerById[t.buyerId];
    return {
      phone: t.buyerPhone || liveBuyer?.phone,
      email: t.buyerEmail || liveBuyer?.email,
    };
  }

  function persist(next: LocalTask[]) {
    setTasks(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function toggleDone(id: string) {
    const t = tasks.find((x) => x.id === id);
    persist(tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
    if (t) toast(t.done ? "Marked open" : "Task completed");
  }

  function removeTask(id: string) {
    persist(tasks.filter((x) => x.id !== id));
    toast("Task removed");
  }

  function clearDone() {
    persist(tasks.filter((x) => !x.done));
    toast("Cleared completed tasks");
  }

  const filtered = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return !t.done;
    if (filter === "done") return !!t.done;
    return t.type === filter;
  });

  const open = tasks.filter((t) => !t.done).length;
  const done = tasks.filter((t) => t.done).length;
  const phone = tasks.filter((t) => t.type === "phone" && !t.done).length;
  const seq = tasks.filter((t) => t.type === "sequence" && !t.done).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-xs text-ink-secondary">
              {open} open · {done} completed · synced from buyer detail actions
            </p>
          </div>
        </div>
        {done > 0 && (
          <button
            onClick={clearDone}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <Trash2 className="h-4 w-4" /> Clear completed
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open" v={open} Icon={Clock} onClick={() => setFilter("open")} active={filter === "open"} />
        <Stat label="Phone tasks" v={phone} Icon={Phone} onClick={() => setFilter("phone")} active={filter === "phone"} />
        <Stat label="Sequences" v={seq} Icon={MessageSquare} onClick={() => setFilter("sequence")} active={filter === "sequence"} />
        <Stat label="Completed" v={done} Icon={CheckCircle2} onClick={() => setFilter("done")} active={filter === "done"} />
      </div>

      {/* Honesty banner about AI voice. Operators expect "AI tasks" to mean
          AI MAKES THE CALL — that's not shipped (no Twilio Voice / Vapi /
          Bland integration yet). Today the queue is operator-driven: AI
          identifies who to call, you click-to-call from the task row. */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-500/15">
            <Bot className="h-4 w-4 text-brand-200" />
          </div>
          <div className="flex-1 text-[12px] text-ink-secondary">
            <div className="font-semibold text-brand-200">How tasks + AI work today</div>
            <p className="mt-1">
              AI identifies which buyers need a phone touch and queues the task. <span className="font-semibold text-ink-primary">You click to call</span> (the green Phone button below opens your phone&apos;s dialer via <code className="rounded bg-bg-hover px-1">tel:</code>) or click to email via <code className="rounded bg-bg-hover px-1">mailto:</code>.
            </p>
            <p className="mt-1">
              <span className="font-semibold text-accent-amber">AI making outbound voice calls</span> is on the roadmap — that wires to Twilio Voice / Vapi / Bland with a configurable script. Until then, voice stays human; AI handles the email + SMS legs.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs w-fit">
        {(
          [
            ["open", "Open", open],
            ["phone", "Phone", phone],
            ["sequence", "Sequences", seq],
            ["done", "Done", done],
            ["all", "All", tasks.length],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 ${
              filter === k
                ? "bg-brand-500/15 text-brand-200"
                : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`}
          >
            {label}
            <span className={`rounded ${filter === k ? "bg-brand-500/20" : "bg-bg-hover"} px-1.5 text-[10px]`}>
              {n}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-bg-border bg-bg-card p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-ink-tertiary" />
          <div className="mt-3 text-base font-semibold">No tasks here yet</div>
          <p className="mt-1 text-xs text-ink-tertiary">
            Open any{" "}
            <Link href="/buyers" className="text-brand-300 hover:text-brand-200">
              buyer
            </Link>{" "}
            and click &ldquo;Add Phone Task&rdquo; or &ldquo;Draft Sequence&rdquo; to add to this queue.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => {
            const Icon = t.type === "phone" ? Phone : MessageSquare;
            const { phone: phoneNumber, email: emailAddr } = contactFor(t);
            return (
              <li
                key={t.id}
                className={`flex flex-wrap items-center gap-3 rounded-xl border bg-bg-card p-4 ${
                  t.done ? "border-bg-border opacity-60" : "border-bg-border"
                }`}
              >
                <button
                  onClick={() => toggleDone(t.id)}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                    t.done
                      ? "border-accent-green/50 bg-accent-green/15 text-accent-green"
                      : "border-bg-border hover:border-brand-500/40"
                  }`}
                  aria-label="Toggle done"
                >
                  {t.done && <CheckCircle2 className="h-4 w-4" />}
                </button>
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  t.type === "phone" ? "bg-accent-blue/15 text-accent-blue" : "bg-brand-500/15 text-brand-300"
                }`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${t.done ? "line-through" : ""}`}>
                    {t.type === "phone" ? "Phone call" : "Draft sequence"} ·{" "}
                    <span className="text-ink-secondary">{t.buyerName}</span>{" "}
                    <span className="text-ink-tertiary">@ {t.buyerCompany}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-tertiary">
                    <span>Added {relativeTime(t.createdAt)}</span>
                    {phoneNumber && (
                      <>
                        <span className="opacity-60">·</span>
                        <span className="font-mono">{phoneNumber}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Click-to-call — opens the device dialer (mobile) or
                    default tel: handler (FaceTime / Skype on desktop). For
                    phone tasks this is the primary CTA; for sequence tasks
                    it's secondary (operator might still want to call). */}
                {phoneNumber ? (
                  <a
                    href={`tel:${phoneNumber}`}
                    title={`Call ${phoneNumber}`}
                    onClick={() => {
                      // Fire-and-forget: when the operator clicks call, mark
                      // the phone task as in-progress would be ideal but for
                      // now we just toast so they have feedback.
                      toast(`Calling ${phoneNumber}…`, "info");
                    }}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                      t.type === "phone"
                        ? "bg-accent-green/15 text-accent-green hover:bg-accent-green/25"
                        : "border border-bg-border bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                    }`}
                  >
                    <Phone className="h-3 w-3" /> Call
                  </a>
                ) : (
                  <span
                    title="No phone number on file. Promote a lead with a phone, or add it on the buyer record."
                    className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 px-2.5 py-1 text-[11px] text-ink-tertiary opacity-50"
                  >
                    <Phone className="h-3 w-3" /> No phone
                  </span>
                )}

                {emailAddr ? (
                  <a
                    href={`mailto:${emailAddr}`}
                    title={`Email ${emailAddr}`}
                    className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 px-2.5 py-1 text-[11px] text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                  >
                    <Mail className="h-3 w-3" /> Email
                  </a>
                ) : (
                  <span
                    title="No email on file"
                    className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 px-2.5 py-1 text-[11px] text-ink-tertiary opacity-50"
                  >
                    <Mail className="h-3 w-3" /> No email
                  </span>
                )}

                {/* View buyer with focus param so the right buyer's drawer
                    auto-opens on /buyers (matches /leads "Open buyer" pattern) */}
                <Link
                  href={`/buyers?focus=${encodeURIComponent(t.buyerId)}`}
                  className="rounded-md border border-bg-border bg-bg-hover/40 px-2.5 py-1 text-[11px] text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                >
                  View buyer
                </Link>
                <button
                  onClick={() => removeTask(t.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-tertiary hover:bg-accent-red/10 hover:text-accent-red"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, v, Icon, onClick, active }: { label: string; v: number; Icon: React.ComponentType<{ className?: string }>; onClick?: () => void; active?: boolean }) {
  const inner = (
    <>
      <Icon className="h-4 w-4 text-brand-300" />
      <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`group block w-full rounded-xl border border-bg-border bg-bg-card p-4 text-left transition-all hover:bg-bg-hover hover:ring-brand-500/40 ring-1 ${active ? "ring-brand-500/60" : "ring-transparent"}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      {inner}
    </div>
  );
}
