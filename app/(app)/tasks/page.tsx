"use client";
import {
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Phone,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

type LocalTask = {
  id: string;
  buyerId: string;
  buyerCompany: string;
  buyerName: string;
  type: "phone" | "sequence";
  createdAt: string;
  done?: boolean;
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
  const { toast } = useToast();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTasks(JSON.parse(raw));
    } catch {}
  }, []);

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
        <Stat label="Open" v={open} Icon={Clock} />
        <Stat label="Phone tasks" v={phone} Icon={Phone} />
        <Stat label="Sequences" v={seq} Icon={MessageSquare} />
        <Stat label="Completed" v={done} Icon={CheckCircle2} />
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
            return (
              <li
                key={t.id}
                className={`flex items-center gap-3 rounded-xl border bg-bg-card p-4 ${
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
                  <div className="text-[11px] text-ink-tertiary">
                    Added {relativeTime(t.createdAt)}
                  </div>
                </div>
                <Link
                  href={`/buyers`}
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

function Stat({ label, v, Icon }: { label: string; v: number; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <Icon className="h-4 w-4 text-brand-300" />
      <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
    </div>
  );
}
