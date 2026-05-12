"use client";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Webhook,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

type CheckResult = {
  ok: boolean;
  severity: "blocking" | "warning" | "info";
  affects: string[];
  // detail is an opaque map — we render it as a key/value list.
  detail: Record<string, unknown>;
};

type TestResult = {
  channel: "email" | "sms";
  ok: boolean;
  sentTo?: string;
  suppressed?: boolean;
  errorMessage?: string;
  provider?: string;
};

type HealthResponse = {
  overall: "green" | "yellow" | "red";
  blockingFailures: number;
  warningFailures: number;
  infoFailures: number;
  generatedAt: string;
  checks: {
    anthropic: CheckResult;
    email: CheckResult;
    sms: CheckResult;
    compliance: CheckResult;
    postmarkWebhook: CheckResult;
    cron: CheckResult;
    auth: CheckResult;
    booking: CheckResult;
  };
};

const ROW_META: Record<
  keyof HealthResponse["checks"],
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  anthropic: { label: "Anthropic / AI generation", Icon: Bot },
  email: { label: "Outbound email (Postmark / Resend)", Icon: Mail },
  sms: { label: "Outbound SMS (Twilio)", Icon: Smartphone },
  compliance: { label: "CAN-SPAM compliance footer", Icon: ShieldCheck },
  postmarkWebhook: { label: "Postmark bounce / complaint webhook", Icon: Webhook },
  cron: { label: "Cron / scheduled work", Icon: Clock },
  auth: { label: "Admin auth", Icon: ShieldCheck },
  booking: { label: "Booking link (BOOKING_URL)", Icon: Activity },
};

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testSmsTo, setTestSmsTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [lastEmailResult, setLastEmailResult] = useState<TestResult | null>(null);
  const [lastSmsResult, setLastSmsResult] = useState<TestResult | null>(null);
  const { toast } = useToast();

  /**
   * Pre-fill test recipient inputs once the health data lands. Operator email
   * is the natural target -- they want to verify the transport actually lands
   * something in their inbox.
   */
  useEffect(() => {
    if (!data) return;
    const opEmail = (data.checks.compliance.detail.operatorEmail as string) ?? "";
    if (opEmail && opEmail !== "MISSING" && !testEmailTo) setTestEmailTo(opEmail);
  }, [data, testEmailTo]);

  async function sendTest(channel: "email" | "sms") {
    const to = channel === "email" ? testEmailTo.trim() : testSmsTo.trim();
    if (!to) {
      toast(`Enter a ${channel === "email" ? "recipient email" : "phone number"} first`, "error");
      return;
    }
    const setSending = channel === "email" ? setSendingEmail : setSendingSms;
    const setResult = channel === "email" ? setLastEmailResult : setLastSmsResult;
    setSending(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channel, to }),
      });
      const d = await r.json().catch(() => ({}));
      setResult(d);
      if (d.ok) {
        toast(`Test ${channel} sent to ${d.sentTo ?? to}`, "success");
      } else if (d.suppressed) {
        toast(`${to} is on the suppression list — un-suppress at /admin/suppressions`, "error");
      } else {
        toast(`Test ${channel} failed${d.errorMessage ? ` — ${d.errorMessage}` : ""}`, "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setSending(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/system-health", { cache: "no-store", credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? `API returned ${r.status}`);
        return;
      }
      setData(await r.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">System Health</h1>
            <p className="text-xs text-ink-secondary">
              {data ? `Last checked ${relTime(data.generatedAt)}` : "—"}
              {data && <> · <span className={overallTone(data.overall)}>{overallLabel(data.overall)}</span></>}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Re-check
        </button>
      </div>

      {/* Explainer banner — what this page is for and how to use it */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-500/15">
            <ShieldCheck className="h-4 w-4 text-brand-200" />
          </div>
          <div className="flex-1 text-[12px] text-ink-secondary">
            <div className="font-semibold text-brand-200">What &ldquo;system health&rdquo; means here</div>
            <p className="mt-1">
              Every check below answers <em>&ldquo;will this feature actually work right now in production?&rdquo;</em>{" "}
              based on the env vars Netlify has. <span className="font-semibold text-accent-red">Red</span> means a
              feature literally won&apos;t run. <span className="font-semibold text-accent-amber">Yellow</span> means
              degraded (e.g. SMS will silently skip, only email goes out). Secrets are never displayed — only the
              fact that they&apos;re present plus enough metadata to debug.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load health:</strong> {error}
        </div>
      )}

      {data && (
        <>
          {/* Roll-up tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <RollupTile
              label="Overall"
              value={overallLabel(data.overall)}
              tone={data.overall === "green" ? "green" : data.overall === "yellow" ? "amber" : "red"}
              Icon={data.overall === "green" ? CheckCircle2 : data.overall === "yellow" ? AlertTriangle : XCircle}
            />
            <RollupTile
              label="Blocking gaps"
              value={String(data.blockingFailures)}
              tone={data.blockingFailures > 0 ? "red" : "green"}
              Icon={XCircle}
              hint="features that won't run"
            />
            <RollupTile
              label="Warnings"
              value={String(data.warningFailures)}
              tone={data.warningFailures > 0 ? "amber" : "green"}
              Icon={AlertTriangle}
              hint="degraded but not blocking"
            />
            <RollupTile
              label="Info gaps"
              value={String(data.infoFailures)}
              tone="default"
              Icon={AlertCircle}
              hint="optional / cosmetic"
            />
          </div>

          {/* Per-check rows */}
          <div className="space-y-3">
            {(Object.keys(data.checks) as (keyof HealthResponse["checks"])[]).map((k) => {
              const c = data.checks[k];
              const meta = ROW_META[k];
              return <CheckRow key={k} label={meta.label} Icon={meta.Icon} check={c} />;
            })}
          </div>

          {/* Test-send actions — verify transport actually works before any
              real lead lands. The Postmark approval flow is a long-tail issue
              where the configured provider returns 422 for un-approved senders;
              this gives the operator the exact provider message instead of
              waiting for a real lead to fail silently. */}
          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Send className="h-4 w-4 text-brand-300" /> Test the transport
            </div>
            <p className="mt-1 text-[11px] text-ink-tertiary">
              Sends a real email / SMS via the configured provider. Useful for verifying Postmark approval, Twilio
              From-number, and the EMAIL_LIVE flag before a real lead submits.
            </p>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {/* Email test */}
              <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-secondary">
                  <Mail className="h-3 w-3 text-brand-300" /> Test email
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    placeholder="you@example.com"
                    className="h-8 flex-1 rounded-md border border-bg-border bg-bg-card px-2 text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
                  />
                  <button
                    onClick={() => sendTest("email")}
                    disabled={sendingEmail || !data.checks.email.ok}
                    title={data.checks.email.ok ? "Send a test email through the configured provider" : "Email provider not configured — set POSTMARK_TOKEN or RESEND_TOKEN"}
                    className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 text-[11px] font-semibold shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sendingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Send test
                  </button>
                </div>
                {lastEmailResult && <TestResultLine result={lastEmailResult} />}
              </div>

              {/* SMS test */}
              <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-secondary">
                  <Smartphone className="h-3 w-3 text-brand-300" /> Test SMS
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={testSmsTo}
                    onChange={(e) => setTestSmsTo(e.target.value)}
                    placeholder="+1 555 555 0123"
                    className="h-8 flex-1 rounded-md border border-bg-border bg-bg-card px-2 text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
                  />
                  <button
                    onClick={() => sendTest("sms")}
                    disabled={sendingSms || !data.checks.sms.ok}
                    title={data.checks.sms.ok ? "Send a test SMS through Twilio" : "Twilio not configured — set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM"}
                    className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 text-[11px] font-semibold hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sendingSms ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Send test
                  </button>
                </div>
                {lastSmsResult && <TestResultLine result={lastSmsResult} />}
              </div>
            </div>
          </div>
        </>
      )}

      {loading && !data && (
        <div className="grid place-items-center rounded-xl border border-dashed border-bg-border py-12 text-ink-tertiary">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
    </div>
  );
}

function TestResultLine({ result }: { result: TestResult }) {
  const tone = result.ok
    ? "border-accent-green/30 bg-accent-green/5 text-accent-green"
    : result.suppressed
      ? "border-accent-amber/30 bg-accent-amber/5 text-accent-amber"
      : "border-accent-red/30 bg-accent-red/5 text-accent-red";
  return (
    <div className={`mt-2 rounded-md border ${tone} px-2 py-1.5 text-[10px]`}>
      {result.ok ? (
        <>
          <CheckCircle2 className="mr-1 inline h-3 w-3" />
          Sent
          {result.sentTo && result.sentTo !== "" && <> · delivered to {result.sentTo}</>}
          {result.provider && <span className="opacity-70"> · via {result.provider}</span>}
        </>
      ) : result.suppressed ? (
        <>
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          Suppressed — recipient is on the suppression list. Un-suppress at <a href="/admin/suppressions" className="underline">/admin/suppressions</a>.
        </>
      ) : (
        <>
          <XCircle className="mr-1 inline h-3 w-3" />
          Failed{result.errorMessage ? `: ${result.errorMessage}` : ""}
        </>
      )}
    </div>
  );
}

function CheckRow({
  label,
  Icon,
  check,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  check: CheckResult;
}) {
  const StatusIcon = check.ok ? CheckCircle2 : check.severity === "blocking" ? XCircle : check.severity === "warning" ? AlertTriangle : AlertCircle;
  const tone = check.ok
    ? "border-accent-green/30 bg-accent-green/5"
    : check.severity === "blocking"
      ? "border-accent-red/30 bg-accent-red/5"
      : check.severity === "warning"
        ? "border-accent-amber/30 bg-accent-amber/5"
        : "border-bg-border bg-bg-card";
  const statusText = check.ok
    ? "text-accent-green"
    : check.severity === "blocking"
      ? "text-accent-red"
      : check.severity === "warning"
        ? "text-accent-amber"
        : "text-ink-tertiary";
  const statusBg = check.ok
    ? "bg-accent-green/15"
    : check.severity === "blocking"
      ? "bg-accent-red/15"
      : check.severity === "warning"
        ? "bg-accent-amber/15"
        : "bg-bg-hover";
  return (
    <div className={`rounded-xl border ${tone} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${statusBg}`}>
            <Icon className={`h-4 w-4 ${statusText}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{label}</span>
              <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusBg} ${statusText}`}>
                <StatusIcon className="h-3 w-3" />
                {check.ok ? "OK" : check.severity}
              </span>
            </div>
            {check.affects.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-ink-tertiary">
                {check.affects.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {Object.keys(check.detail).length > 0 && (
        <div className="mt-3 grid gap-1.5 rounded-md border border-bg-border bg-bg-hover/30 p-3 text-[11px]">
          {Object.entries(check.detail).map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-start justify-between gap-2">
              <span className="text-ink-tertiary">{humanKey(k)}</span>
              <span className={`font-mono text-right ${k === "fixHint" ? "text-accent-amber" : "text-ink-secondary"}`}>
                {renderValue(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RollupTile({
  label,
  value,
  tone,
  Icon,
  hint,
}: {
  label: string;
  value: string;
  tone: "green" | "amber" | "red" | "default";
  Icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  const map = {
    green: { bg: "bg-accent-green/15", text: "text-accent-green", border: "border-accent-green/30" },
    amber: { bg: "bg-accent-amber/15", text: "text-accent-amber", border: "border-accent-amber/30" },
    red: { bg: "bg-accent-red/15", text: "text-accent-red", border: "border-accent-red/30" },
    default: { bg: "bg-bg-hover", text: "text-ink-secondary", border: "border-bg-border" },
  };
  const t = map[tone];
  return (
    <div className={`rounded-xl border ${t.border} bg-bg-card p-4`}>
      <div className="flex items-center justify-between">
        <div className={`grid h-8 w-8 place-items-center rounded-lg ${t.bg}`}>
          <Icon className={`h-4 w-4 ${t.text}`} />
        </div>
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${t.text}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-ink-tertiary">{hint}</div>}
    </div>
  );
}

function overallLabel(o: "green" | "yellow" | "red"): string {
  return o === "green" ? "All good" : o === "yellow" ? "Degraded" : "Blocked";
}
function overallTone(o: "green" | "yellow" | "red"): string {
  return o === "green" ? "text-accent-green" : o === "yellow" ? "text-accent-amber" : "text-accent-red";
}
function humanKey(k: string): string {
  // camelCase -> "Camel Case"
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60_000)}m ago`;
}
