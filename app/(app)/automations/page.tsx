"use client";
import {
  ArrowRight,
  Bell,
  Bot,
  Check,
  Clock,
  Filter,
  Mail,
  Pause,
  Plus,
  Sparkles,
  TrendingUp,
  Trash2,
  Zap,
} from "lucide-react";
import { useState } from "react";

type Automation = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  triggerType: string;
  conditionCount: number;
  actionType: string;
  runs7d: number;
  successRate: number;
  lastRun: string;
};

const AUTOMATIONS: Automation[] = [
  {
    id: "a1",
    name: "Auto-contact buyers when product trends +200%",
    description: "Trend Hunter spike → Buyer Discovery match → Outreach",
    enabled: true,
    triggerType: "Trend spike",
    conditionCount: 2,
    actionType: "Send outreach",
    runs7d: 142,
    successRate: 94.4,
    lastRun: "12m ago",
  },
  {
    id: "a2",
    name: "Pause supplier if risk score > 60",
    description: "Risk Agent flag → Pause supplier outreach + alert team",
    enabled: true,
    triggerType: "Risk alert",
    conditionCount: 1,
    actionType: "Pause + Slack",
    runs7d: 8,
    successRate: 100,
    lastRun: "2h ago",
  },
  {
    id: "a3",
    name: "Escalate to human if buyer asks about pricing",
    description: "Outreach reply contains pricing question → Notify owner",
    enabled: true,
    triggerType: "Reply intent",
    conditionCount: 1,
    actionType: "Notify owner",
    runs7d: 31,
    successRate: 96.8,
    lastRun: "1h ago",
  },
  {
    id: "a4",
    name: "Auto-quote when negotiation reaches stage 3",
    description: "Negotiation stage = 3 → Build quote with default discount",
    enabled: false,
    triggerType: "Stage change",
    conditionCount: 2,
    actionType: "Build quote",
    runs7d: 0,
    successRate: 0,
    lastRun: "—",
  },
  {
    id: "a5",
    name: "Daily 9am: send pipeline summary to Slack",
    description: "Cron 9:00 ET → Compile + post to #sales-pipeline",
    enabled: true,
    triggerType: "Schedule",
    conditionCount: 0,
    actionType: "Slack message",
    runs7d: 7,
    successRate: 100,
    lastRun: "Today 9:00 am",
  },
  {
    id: "a6",
    name: "Block deal if margin < 25%",
    description: "Quote builder → Margin Watchdog → Reject + suggest counter",
    enabled: true,
    triggerType: "Quote built",
    conditionCount: 1,
    actionType: "Reject + suggest",
    runs7d: 4,
    successRate: 100,
    lastRun: "Yesterday",
  },
];

const TRIGGER_OPTIONS = [
  { id: "trend", label: "Product trends spike", Icon: TrendingUp },
  { id: "reply", label: "Buyer replies", Icon: Mail },
  { id: "risk", label: "Risk Agent flags issue", Icon: Bell },
  { id: "stage", label: "Deal stage changes", Icon: ArrowRight },
  { id: "schedule", label: "On a schedule (cron)", Icon: Clock },
  { id: "quote", label: "Quote is built", Icon: Sparkles },
];

const ACTION_OPTIONS = [
  { id: "outreach", label: "Send outreach via Outreach Agent", Icon: Mail },
  { id: "notify", label: "Notify owner (Slack/Email)", Icon: Bell },
  { id: "pause", label: "Pause supplier/buyer", Icon: Pause },
  { id: "advance", label: "Advance deal stage", Icon: ArrowRight },
  { id: "quote", label: "Build quote with template", Icon: Sparkles },
  { id: "approve", label: "Send to approval queue", Icon: Check },
];

export default function AutomationsPage() {
  const [list, setList] = useState(AUTOMATIONS);
  const [openBuilder, setOpenBuilder] = useState(false);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<string>("");
  const [threshold, setThreshold] = useState(200);
  const [conditions, setConditions] = useState<{ field: string; op: string; value: string }[]>([
    { field: "Demand Score", op: ">", value: "85" },
  ]);
  const [actions, setActions] = useState<string[]>([]);
  const [approvalRequired, setApprovalRequired] = useState(true);

  const totalRuns = list.reduce((s, a) => s + a.runs7d, 0);
  const enabled = list.filter((a) => a.enabled).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Automations</h1>
            <p className="text-xs text-ink-secondary">
              {enabled} of {list.length} enabled · {totalRuns} runs in last 7 days
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpenBuilder(true)}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
        >
          <Plus className="h-4 w-4" /> New Automation
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active" value={enabled} hint="enabled rules" />
        <Stat label="Runs 7d" value={totalRuns} hint={`avg ${Math.round(totalRuns / 7)}/day`} />
        <Stat label="Avg success" value={`${(list.reduce((s, a) => s + a.successRate, 0) / list.length).toFixed(1)}%`} hint="across all rules" />
        <Stat label="Approval queue" value={3} hint="awaiting human" />
      </div>

      {openBuilder && (
        <div className="rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-500/5 to-transparent p-5 shadow-glow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
              <Sparkles className="h-4 w-4" /> New Automation Builder
            </div>
            <button
              onClick={() => setOpenBuilder(false)}
              className="text-xs text-ink-tertiary hover:text-ink-primary"
            >
              Cancel
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <Field label="Automation name" value={name} onChange={setName} placeholder="e.g. Auto-contact buyers when pet products spike" />

            <div className="rounded-lg border border-bg-border bg-bg-card p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-300">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500/20 text-[10px]">1</span>
                Trigger
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TRIGGER_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTrigger(t.id)}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                      trigger === t.id
                        ? "border-brand-500/60 bg-brand-500/10 text-brand-200"
                        : "border-bg-border bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover"
                    }`}
                  >
                    <t.Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
              {trigger === "trend" && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="text-ink-secondary">Velocity threshold:</span>
                  <input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(+e.target.value)}
                    className="h-8 w-20 rounded-md border border-bg-border bg-bg-card px-2 focus:border-brand-500 focus:outline-none"
                  />
                  <span className="text-ink-tertiary">%</span>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-bg-border bg-bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-300">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500/20 text-[10px]">2</span>
                  Conditions (AND)
                </div>
                <button
                  onClick={() => setConditions([...conditions, { field: "Category", op: "=", value: "" }])}
                  className="flex items-center gap-1 text-[11px] text-brand-300 hover:text-brand-200"
                >
                  <Plus className="h-3 w-3" /> Add condition
                </button>
              </div>
              <div className="space-y-2">
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-bg-border bg-bg-hover/30 p-2 text-xs">
                    <Filter className="h-3 w-3 text-ink-tertiary" />
                    <select
                      value={c.field}
                      onChange={(e) => {
                        const copy = [...conditions];
                        copy[i].field = e.target.value;
                        setConditions(copy);
                      }}
                      className="h-7 rounded-md border border-bg-border bg-bg-card px-2"
                    >
                      <option>Demand Score</option>
                      <option>Category</option>
                      <option>Buyer Industry</option>
                      <option>Country</option>
                      <option>Margin</option>
                    </select>
                    <select
                      value={c.op}
                      onChange={(e) => {
                        const copy = [...conditions];
                        copy[i].op = e.target.value;
                        setConditions(copy);
                      }}
                      className="h-7 rounded-md border border-bg-border bg-bg-card px-2"
                    >
                      <option>=</option>
                      <option>≠</option>
                      <option>&gt;</option>
                      <option>&lt;</option>
                      <option>contains</option>
                    </select>
                    <input
                      value={c.value}
                      onChange={(e) => {
                        const copy = [...conditions];
                        copy[i].value = e.target.value;
                        setConditions(copy);
                      }}
                      className="h-7 flex-1 rounded-md border border-bg-border bg-bg-card px-2"
                    />
                    <button
                      onClick={() => setConditions(conditions.filter((_, k) => k !== i))}
                      className="grid h-6 w-6 place-items-center rounded-md text-ink-tertiary hover:bg-accent-red/10 hover:text-accent-red"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-bg-border bg-bg-card p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-300">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500/20 text-[10px]">3</span>
                Then do (in order)
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ACTION_OPTIONS.map((a) => {
                  const on = actions.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setActions(on ? actions.filter((x) => x !== a.id) : [...actions, a.id])}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                        on
                          ? "border-brand-500/60 bg-brand-500/10 text-brand-200"
                          : "border-bg-border bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover"
                      }`}
                    >
                      <a.Icon className="h-3.5 w-3.5" />
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-bg-border bg-bg-hover/30 p-3">
              <div className="flex-1">
                <div className="text-sm font-medium">Require human approval before action</div>
                <div className="text-[11px] text-ink-tertiary">
                  AI will draft + queue. You approve from the Approval Queue.
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setApprovalRequired(!approvalRequired);
                }}
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                  approvalRequired ? "bg-gradient-brand" : "bg-bg-hover"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                    approvalRequired ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </label>

            <div className="flex items-center justify-end gap-2 border-t border-bg-border pt-4">
              <button
                onClick={() => setOpenBuilder(false)}
                className="rounded-lg border border-bg-border bg-bg-card px-4 py-2 text-sm hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setList([
                    {
                      id: `a${list.length + 1}`,
                      name: name || "Untitled automation",
                      description: `${trigger || "Trigger"} → ${actions.length} action${actions.length === 1 ? "" : "s"}`,
                      enabled: true,
                      triggerType: TRIGGER_OPTIONS.find((t) => t.id === trigger)?.label ?? "—",
                      conditionCount: conditions.length,
                      actionType: actions.length ? `${actions.length} actions` : "—",
                      runs7d: 0,
                      successRate: 0,
                      lastRun: "Just now",
                    },
                    ...list,
                  ]);
                  setOpenBuilder(false);
                  setName("");
                  setTrigger("");
                  setActions([]);
                }}
                disabled={!name || !trigger || actions.length === 0}
                className="rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-40"
              >
                Save automation
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {list.map((a) => (
          <div
            key={a.id}
            className="rounded-xl border border-bg-border bg-bg-card p-5 transition hover:border-brand-500/40"
          >
            <div className="flex items-start gap-4">
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                  a.enabled ? "bg-brand-500/15" : "bg-bg-hover"
                }`}
              >
                <Zap className={`h-4 w-4 ${a.enabled ? "text-brand-300" : "text-ink-tertiary"}`} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{a.name}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      a.enabled
                        ? "bg-accent-green/15 text-accent-green"
                        : "bg-bg-hover text-ink-tertiary"
                    }`}
                  >
                    {a.enabled ? "Active" : "Paused"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-ink-tertiary">{a.description}</div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-5">
                  <Cell l="Trigger" v={a.triggerType} />
                  <Cell l="Conditions" v={`${a.conditionCount}`} />
                  <Cell l="Action" v={a.actionType} />
                  <Cell l="Runs 7d" v={a.runs7d} />
                  <Cell
                    l="Success"
                    v={a.runs7d > 0 ? `${a.successRate.toFixed(1)}%` : "—"}
                    tone={a.runs7d > 0 ? "text-accent-green" : ""}
                  />
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={() =>
                    setList(list.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)))
                  }
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                    a.enabled ? "bg-gradient-brand" : "bg-bg-hover"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                      a.enabled ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
                <span className="text-[10px] text-ink-tertiary">{a.lastRun}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/20">
            <Bot className="h-5 w-5 text-brand-200" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">AI suggests these automations</div>
            <p className="mt-1 text-xs text-ink-secondary">
              Based on your activity in the last 30 days, these patterns repeat often enough to be worth automating.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {[
                "Auto-tag inbound replies as 'pricing question' when they mention dollar amounts",
                "Move buyer to Negotiation when reply length > 80 chars",
                "Reply to OOO emails with a follow-up scheduled for return date",
              ].map((s) => (
                <button
                  key={s}
                  className="flex items-center justify-between rounded-lg border border-bg-border bg-bg-card p-3 text-left text-xs hover:bg-bg-hover"
                >
                  <span className="text-ink-secondary">{s}</span>
                  <Plus className="h-3 w-3 text-brand-300" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="text-[11px] text-ink-tertiary">{hint}</div>
    </div>
  );
}

function Cell({ l, v, tone }: { l: string; v: string | number; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{l}</div>
      <div className={`mt-0.5 text-xs font-medium ${tone ?? ""}`}>{v}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
}
