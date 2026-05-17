"use client";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Headphones,
  Loader2,
  Mail,
  Mic,
  PhoneCall,
  PhoneOff,
  Power,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Truck,
  Webhook,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useVoice } from "@/components/voice/VoiceContext";
import OnboardingMetricsCard from "@/components/admin/OnboardingMetricsCard";

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

type CronRunRecord = {
  id: string;
  kind?: "pipeline" | "lead-followups" | "outreach-jobs" | "followups" | "auto-promote-sweep" | "daily-digest";
  ranAt: string;
  durationMs: number;
  status: "success" | "error" | "skipped";
  totals?: {
    products: number;
    buyers: number;
    suppliers: number;
    drafts: number;
    totalCost: number;
  };
  summary?: string;
  errorMessage?: string;
};

const CRON_KIND_LABEL: Record<NonNullable<CronRunRecord["kind"]>, string> = {
  pipeline: "Pipeline",
  "lead-followups": "Lead Followups",
  "outreach-jobs": "Outreach Jobs",
  followups: "Draft Followups",
  "auto-promote-sweep": "Auto-Promote",
  "daily-digest": "Daily Digest",
};

type CronStatusResponse = {
  deployed: boolean;
  platform: string;
  enabled: boolean;
  secretConfigured: boolean;
  scheduleHuman: string;
  nextRunAt: string | null;
  lastRun: CronRunRecord | null;
  recentRuns: CronRunRecord[];
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
    voice: CheckResult;
    compliance: CheckResult;
    postmarkWebhook: CheckResult;
    cron: CheckResult;
    killSwitch: CheckResult;
    auth: CheckResult;
    booking: CheckResult;
    freight: CheckResult;
  };
};

const ROW_META: Record<
  keyof HealthResponse["checks"],
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  anthropic: { label: "Anthropic / AI generation", Icon: Bot },
  email: { label: "Outbound email (Postmark / Resend)", Icon: Mail },
  sms: { label: "Outbound SMS (Twilio)", Icon: Smartphone },
  voice: { label: "Voice / phone (Vapi / Twilio Voice / Bland)", Icon: PhoneCall },
  compliance: { label: "CAN-SPAM compliance footer", Icon: ShieldCheck },
  postmarkWebhook: { label: "Postmark bounce / complaint webhook", Icon: Webhook },
  cron: { label: "Cron / scheduled work", Icon: Clock },
  killSwitch: { label: "Global agent kill-switch", Icon: Power },
  auth: { label: "Admin auth", Icon: ShieldCheck },
  booking: { label: "Booking link (BOOKING_URL)", Icon: Activity },
  freight: { label: "Freight estimates (Shippo / rate-card)", Icon: Truck },
};

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [cronStatus, setCronStatus] = useState<CronStatusResponse | null>(null);
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

  // Per-cron manual trigger -- proxies through /api/admin/cron-trigger which
  // signs the internal request with CRON_SECRET. Pipeline is intentionally
  // not triggerable here; /pipeline page has its own Run Pipeline button.
  const [triggering, setTriggering] = useState<string | null>(null);

  /**
   * Each cron returns a different response shape, so we parse per-kind to
   * give the operator a meaningful toast instead of a generic "Done". The
   * raw payload also lands in the recent-activity panel via the row this
   * trigger creates -- this toast is just immediate feedback.
   */
  function summarizeCronResponse(kind: string, p: Record<string, unknown>): string {
    if (p.skipped === true) {
      return `Skipped — ${p.reason ?? "no-op"}`;
    }
    switch (kind) {
      case "daily-digest":
        // `sent` is a boolean here, not a count. simulated:true means
        // no real provider configured.
        if (p.sent === true) {
          return p.simulated ? `Sent (simulated — no provider)` : `Sent to ${p.to ?? "operator"}`;
        }
        return "Send failed";
      case "lead-followups":
        return `${p.candidateCount ?? 0} candidates · ${p.sent ?? 0} sent · ${p.skipped ?? 0} skipped · ${p.errored ?? 0} errored`;
      case "followups":
        return `${p.candidates ?? 0} candidates · ${p.generated ?? 0} generated · ${p.failed ?? 0} failed`;
      case "auto-promote-sweep":
        return `Scanned ${p.scanned ?? 0} · promoted ${p.promoted ?? 0} · errored ${p.errored ?? 0}`;
      case "outreach-jobs":
        if (p.idle === true) return "No pending jobs";
        return `Job ${(p.jobId as string | undefined)?.slice(-6) ?? "?"} · ${p.drafted ?? 0} drafted · ${p.processedThisTick ?? 0} this tick${p.done ? " · DONE" : ""}`;
      default:
        return "Done";
    }
  }

  async function triggerCron(kind: string) {
    setTriggering(kind);
    try {
      const r = await fetch("/api/admin/cron-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(d.error ?? `Trigger failed (${r.status})`);
      }
      const p = (d.payload ?? {}) as Record<string, unknown>;
      const summary = summarizeCronResponse(kind, p);
      const tone = p.ok === false || (kind === "daily-digest" && p.sent === false && p.skipped !== true)
        ? "error"
        : "success";
      toast(`${kind} · ${summary} (${d.durationMs}ms)`, tone);
      // Reload the cron status so the new row appears in the activity panel.
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Trigger failed", "error");
    } finally {
      setTriggering(null);
    }
  }

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
      // Parallel: env-introspection health AND cron run history. The cron
      // endpoint is unauthenticated (read-only) so any operator can see it.
      const [healthR, cronR] = await Promise.all([
        fetch("/api/admin/system-health", { cache: "no-store", credentials: "include" }),
        fetch("/api/cron/status", { cache: "no-store" }).catch(() => null),
      ]);
      if (!healthR.ok) {
        const body = await healthR.json().catch(() => ({}));
        setError(body.error ?? `API returned ${healthR.status}`);
        return;
      }
      setData(await healthR.json());
      if (cronR?.ok) setCronStatus(await cronR.json());
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

      {/* Slice 26: onboarding metrics card -- self-fetches, hides
          quietly on a fresh workspace with zero sessions. */}
      <OnboardingMetricsCard />

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

          {/* Postmark live status — queries Postmark's API directly so the
              operator can see "is email actually working right now?" vs
              having to dig through Postmark's dashboard. */}
          <PostmarkStatusCard />

          {/* Voice diagnostics — mic test + place test call to verify the
              full audio path before any real lead. Lives next to the
              transport-test card since it serves the same purpose:
              prove things work without waiting for a real event. */}
          <VoiceDiagnosticsCard />

          {/* Freight live probe (slice 72) — hits estimateLane() with
              a CN->US-CA / 100kg payload so the operator can verify
              Shippo actually responds before any /quote/[id] freight
              preview fails on them. Reports configured vs effective
              provider so a Shippo error that fell back to the rate
              card is obvious. */}
          <FreightProbeCard />

          {/* Slice 91: Twilio webhook URL helper -- collects the four
              URLs you need to paste into Twilio Console (TwiML App,
              phone number Voice + Messaging webhooks) with one-click
              copy buttons. Saves the operator from constructing them
              by hand from NEXT_PUBLIC_APP_ORIGIN + memorized paths. */}
          <TwilioWebhookHelper />

          {/* Recent cron activity — shows what actually fired vs the
              schedule. All 6 crons now record CronRun objects, so each
              kind appears here as soon as it fires (or skips). */}
          {cronStatus && (
            <div className="rounded-xl border border-bg-border bg-bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bg-border px-5 py-3.5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-brand-300" /> Recent cron activity
                </div>
                <div className="text-[11px] text-ink-tertiary">
                  Pipeline · {cronStatus.scheduleHuman}
                  {cronStatus.nextRunAt && (
                    <> · next {new Date(cronStatus.nextRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>
                  )}
                </div>
              </div>

              {/* Manual trigger row — fires the cron handler immediately via
                  /api/admin/cron-trigger (which signs the call with CRON_SECRET
                  server-side, never exposing the secret to the client).
                  Pipeline is intentionally absent -- /pipeline page has its own
                  Run Pipeline button with proper config inputs. */}
              <div className="flex flex-wrap items-center gap-2 border-b border-bg-border bg-bg-hover/30 px-5 py-3">
                <span className="text-[10px] uppercase tracking-wider text-ink-tertiary">Trigger now:</span>
                {(
                  [
                    { kind: "daily-digest", label: "Daily Digest", hint: "Send the morning email summary right now" },
                    { kind: "lead-followups", label: "Lead Followups", hint: "Run the day-N nudge pass for inbound leads" },
                    { kind: "auto-promote-sweep", label: "Auto-Promote", hint: "Rescore + promote any hot leads that escaped the sync path" },
                    { kind: "outreach-jobs", label: "Outreach Jobs", hint: "Process the next batch of the bulk-draft queue" },
                    { kind: "followups", label: "Draft Followups", hint: "Generate followup drafts for buyers who haven't engaged" },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.kind}
                    type="button"
                    onClick={() => triggerCron(c.kind)}
                    disabled={triggering === c.kind}
                    title={c.hint}
                    className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-2.5 py-1 text-[11px] font-semibold text-ink-secondary transition hover:border-brand-500/40 hover:bg-bg-hover hover:text-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {triggering === c.kind ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    {c.label}
                  </button>
                ))}
              </div>
              {cronStatus.recentRuns.length === 0 ? (
                <div className="px-5 py-8 text-center text-[11px] text-ink-tertiary">
                  No cron runs recorded yet.{" "}
                  {!cronStatus.deployed
                    ? "Cron schedules only fire when deployed to Netlify or Vercel."
                    : "Wait for the next scheduled fire."}
                </div>
              ) : (
                <ul className="divide-y divide-bg-border text-[11px]">
                  {cronStatus.recentRuns.slice(0, 15).map((run) => {
                    const statusBg =
                      run.status === "success"
                        ? "bg-accent-green/15 text-accent-green"
                        : run.status === "error"
                          ? "bg-accent-red/15 text-accent-red"
                          : "bg-bg-hover text-ink-secondary";
                    const StatusIcon =
                      run.status === "success"
                        ? CheckCircle2
                        : run.status === "error"
                          ? XCircle
                          : Clock;
                    const kindLabel = run.kind ? CRON_KIND_LABEL[run.kind] : "Pipeline";
                    return (
                      <li key={run.id} className="flex flex-wrap items-center gap-3 px-5 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusBg}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {run.status}
                        </span>
                        <span className="min-w-[110px] text-[10px] font-semibold uppercase tracking-wider text-brand-200">
                          {kindLabel}
                        </span>
                        <span className="text-ink-secondary">
                          {new Date(run.ranAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="text-ink-tertiary">
                          {(run.durationMs / 1000).toFixed(1)}s
                        </span>
                        {run.summary && (
                          <span className="text-ink-tertiary">{run.summary}</span>
                        )}
                        {!run.summary && run.totals && (
                          <span className="text-ink-tertiary">
                            {run.totals.products}p · {run.totals.buyers}b · {run.totals.drafts}d ·{" "}
                            ${run.totals.totalCost.toFixed(4)}
                          </span>
                        )}
                        {run.errorMessage && (
                          <span className="text-accent-red" title={run.errorMessage}>
                            {run.errorMessage.length > 80
                              ? run.errorMessage.slice(0, 80) + "…"
                              : run.errorMessage}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
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

// ─── Postmark live status card ───────────────────────────────────────
//
// Queries /api/admin/postmark-status which proxies the Postmark REST
// API server-side using POSTMARK_TOKEN. Surfaces approval state,
// today's send count + bounce rate, last 10 outbound messages, and
// recent bounces so the operator can answer "is email actually
// working" without leaving the app.

type PostmarkServerInfo = {
  id: number;
  name: string;
  color: string;
  approvalState: string;
  smtpApiActivated: boolean;
  deliveryType: string;
  bounceHookUrl: string | null;
  inboundHookUrl: string | null;
};
type PostmarkStatsInfo = {
  sent: number;
  bounced: number;
  spamComplaints: number;
  tracked: number;
  bounceRate: number;
};
type PostmarkMessageInfo = {
  messageId: string;
  to: string;
  subject: string;
  status: string;
  receivedAt: string;
};
type PostmarkBounceInfo = {
  id: number;
  email: string;
  type: string;
  typeCode: number;
  description: string;
  bouncedAt: string;
};
type PostmarkStatusResponse = {
  configured: boolean;
  error?: string;
  fixHint?: string;
  server: PostmarkServerInfo | null;
  serverError: string | null;
  stats: PostmarkStatsInfo | null;
  recentMessages: PostmarkMessageInfo[];
  recentBounces: PostmarkBounceInfo[];
  issues: string[];
  checkedAt: string;
};

function PostmarkStatusCard() {
  const [data, setData] = useState<PostmarkStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/postmark-status", { cache: "no-store" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
      }
      const j = (await res.json()) as PostmarkStatusResponse;
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bg-border px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-brand-300" /> Postmark live status
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
          {data?.checkedAt && <span>checked {relTime(data.checkedAt)}</span>}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-base px-2 py-1 text-[11px] hover:bg-bg-border disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Recheck
          </button>
        </div>
      </div>

      <div className="space-y-3 p-5">
        {error && (
          <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            Could not reach status endpoint: {error}
          </div>
        )}

        {data && !data.configured && (
          <div className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            <div className="font-semibold">Postmark not configured</div>
            <div className="mt-0.5">{data.error}</div>
            {data.fixHint && <div className="mt-1 text-amber-300/80">{data.fixHint}</div>}
          </div>
        )}

        {data?.serverError && (
          <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            Postmark API error: {data.serverError}
          </div>
        )}

        {data && data.issues.length > 0 && (
          <div className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
            <div className="mb-1 flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" /> Auto-detected issues
            </div>
            <ul className="space-y-1 pl-4">
              {data.issues.map((iss, i) => (
                <li key={i} className="list-disc">{iss}</li>
              ))}
            </ul>
          </div>
        )}

        {data?.server && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <PostmarkStat
              label="Approval"
              value={data.server.approvalState}
              tone={data.server.approvalState === "Approved" ? "green" : "amber"}
            />
            <PostmarkStat
              label="Delivery"
              value={data.server.deliveryType}
              tone={data.server.deliveryType === "Live" ? "green" : "amber"}
            />
            <PostmarkStat
              label="Sent today"
              value={data.stats ? String(data.stats.sent) : "—"}
              tone="neutral"
            />
            <PostmarkStat
              label="Bounce rate"
              value={data.stats ? `${data.stats.bounceRate}%` : "—"}
              tone={
                data.stats && data.stats.bounceRate > 5
                  ? "red"
                  : data.stats && data.stats.bounceRate > 1
                    ? "amber"
                    : "green"
              }
            />
          </div>
        )}

        {data?.server && (
          <div className="text-[11px] text-ink-tertiary">
            Server <span className="font-mono text-ink-secondary">{data.server.name}</span>
            {data.server.bounceHookUrl ? " · bounce webhook wired" : " · no bounce webhook"}
            {data.server.inboundHookUrl ? " · inbound webhook wired" : ""}
          </div>
        )}

        {data && data.recentMessages.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Last {data.recentMessages.length} outbound messages
            </div>
            <div className="overflow-hidden rounded-md border border-bg-border">
              <table className="w-full text-[11px]">
                <tbody>
                  {data.recentMessages.map((m) => {
                    const good = m.status === "Sent" || m.status === "Opened" || m.status === "Delivered";
                    return (
                      <tr key={m.messageId} className="border-b border-bg-border last:border-0">
                        <td className="w-20 px-2 py-1.5 align-top">
                          <span
                            className={
                              good
                                ? "rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200"
                                : "rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-200"
                            }
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 align-top text-ink-secondary">
                          <div className="truncate font-mono text-[10px]">{m.to}</div>
                          <div className="truncate text-ink-tertiary">{m.subject}</div>
                        </td>
                        <td className="w-24 px-2 py-1.5 text-right align-top text-[10px] text-ink-tertiary">
                          {m.receivedAt ? relTime(m.receivedAt) : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data && data.recentBounces.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Recent bounces ({data.recentBounces.length})
            </div>
            <ul className="space-y-1 rounded-md border border-rose-300/20 bg-rose-500/5 p-2 text-[11px]">
              {data.recentBounces.map((b) => (
                <li key={b.id} className="text-rose-200">
                  <span className="font-mono">{b.email}</span> · {b.type}
                  <div className="text-[10px] text-rose-300/70">{b.description}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data && data.configured && !data.server && !data.serverError && (
          <div className="text-[11px] text-ink-tertiary">No server data returned.</div>
        )}

        {!data && !error && loading && (
          <div className="flex items-center gap-2 text-[12px] text-ink-tertiary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Querying Postmark…
          </div>
        )}
      </div>
    </div>
  );
}

function PostmarkStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "amber" | "red" | "neutral";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-200"
      : tone === "amber"
        ? "text-amber-200"
        : tone === "red"
          ? "text-rose-200"
          : "text-ink-primary";
  return (
    <div className="rounded-md border border-bg-border bg-bg-base px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

// ─── Voice diagnostics card ──────────────────────────────────────────
//
// Three smoke tests so the operator can verify voice end-to-end without
// going through /tasks:
//
//  1. Mic test — getUserMedia() prompts permission + measures input level
//     for 5s. Operator sees a live VU meter that responds to their voice.
//  2. Audio devices — lists available input + output devices via
//     enumerateDevices() so operator knows which mic/speaker is active.
//  3. Test call — operator types their own phone, clicks Place, the
//     browser bridges to PSTN and their phone rings. They answer +
//     hear themselves echoed via Twilio. Verifies full audio path:
//     mic → browser → Twilio → PSTN → operator's phone (and back).
//
function VoiceDiagnosticsCard() {
  const { toast } = useToast();
  const v = useVoice();

  // Mic test state
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0); // 0..100

  // Audio device list
  const [devices, setDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({
    inputs: [],
    outputs: [],
  });

  // Test-call state
  const [testNumber, setTestNumber] = useState("");
  const [testCallActive, setTestCallActive] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        setDevices({
          inputs: all.filter((d) => d.kind === "audioinput"),
          outputs: all.filter((d) => d.kind === "audiooutput"),
        });
      })
      .catch(() => {});
  }, [v.micPermission]);

  /**
   * Mic test: 5s VU meter using AudioContext + AnalyserNode. Tells the
   * operator their mic is actually capturing audio (vs just "permission
   * granted but the device is muted at the OS level").
   */
  async function runMicTest() {
    setMicTesting(true);
    setMicLevel(0);
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        toast("AudioContext not supported in this browser", "error");
        return;
      }
      ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const start = Date.now();
      function tick() {
        analyser.getByteTimeDomainData(data);
        // Compute peak deviation from 128 (silent baseline)
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const dev = Math.abs(data[i] - 128);
          if (dev > peak) peak = dev;
        }
        setMicLevel(Math.min(100, Math.round((peak / 128) * 200)));
        if (Date.now() - start < 5000) {
          raf = requestAnimationFrame(tick);
        }
      }
      tick();
      // Auto-stop after 5s
      await new Promise((r) => setTimeout(r, 5000));
      toast("Mic test complete — you should have seen the meter respond", "success");
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e.name === "NotAllowedError") {
        toast("Mic permission denied", "error");
      } else {
        toast(`Mic test failed: ${e.message ?? "unknown"}`, "error");
      }
    } finally {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      setMicTesting(false);
      setTimeout(() => setMicLevel(0), 500);
    }
  }

  async function placeTest() {
    if (!testNumber.trim()) {
      toast("Enter your phone number first", "error");
      return;
    }
    if (!v.twilioReady) {
      toast("Voice not ready — see the badge in TopBar", "error");
      return;
    }
    setTestCallActive(true);
    const call = await v.placeOutboundCall(testNumber.trim());
    if (!call) {
      setTestCallActive(false);
      return;
    }
    // Auto-hang after 60s if operator forgets to end the call
    setTimeout(() => {
      v.hangup();
      setTestCallActive(false);
    }, 60_000);
  }

  function endTestCall() {
    v.hangup();
    setTestCallActive(false);
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Headphones className="h-4 w-4 text-brand-300" /> Voice diagnostics
      </div>
      <p className="mt-1 text-[11px] text-ink-tertiary">
        Verify mic + audio path before you place a real call. Test call rings the number you enter and
        bridges audio so you hear yourself.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {/* Mic test */}
        <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-secondary">
            <Mic className="h-3 w-3 text-brand-300" /> Microphone test
            <span
              className={`ml-auto rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                v.micPermission === "granted"
                  ? "bg-accent-green/15 text-accent-green"
                  : v.micPermission === "denied"
                    ? "bg-accent-red/15 text-accent-red"
                    : "bg-bg-hover text-ink-tertiary"
              }`}
            >
              {v.micPermission}
            </span>
          </div>
          {/* VU meter */}
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-bg-card">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-green via-accent-amber to-accent-red transition-all duration-75"
              style={{ width: `${micLevel}%` }}
            />
          </div>
          <button
            onClick={runMicTest}
            disabled={micTesting}
            className="mt-3 w-full rounded-md bg-gradient-brand py-1.5 text-[11px] font-semibold shadow-glow disabled:opacity-60"
          >
            {micTesting ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Speak now… (5s)
              </span>
            ) : (
              "Run 5-second mic test"
            )}
          </button>
          <p className="mt-2 text-[10px] text-ink-tertiary">
            Speak normally — the meter should jump green/amber. If it stays flat, your mic is muted at
            the OS level or the browser captured a different device.
          </p>
        </div>

        {/* Test call */}
        <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-secondary">
            <PhoneCall className="h-3 w-3 text-brand-300" /> Test outbound call
            <span
              className={`ml-auto rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                v.twilioReady
                  ? "bg-accent-green/15 text-accent-green"
                  : "bg-bg-hover text-ink-tertiary"
              }`}
            >
              {v.twilioReady ? "ready" : "not ready"}
            </span>
          </div>
          <input
            type="tel"
            value={testNumber}
            onChange={(e) => setTestNumber(e.target.value)}
            placeholder="+1 555 555 0123 (your phone)"
            disabled={testCallActive}
            className="mt-3 h-9 w-full rounded-md border border-bg-border bg-bg-card px-2 text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none disabled:opacity-60"
          />
          {testCallActive ? (
            <button
              onClick={endTestCall}
              className="mt-2 w-full rounded-md bg-accent-red/15 py-1.5 text-[11px] font-semibold text-accent-red hover:bg-accent-red/25"
            >
              <PhoneOff className="mr-1 inline h-3 w-3" /> End test call
            </button>
          ) : (
            <button
              onClick={placeTest}
              disabled={!v.twilioReady || !testNumber.trim()}
              className="mt-2 w-full rounded-md bg-gradient-brand py-1.5 text-[11px] font-semibold shadow-glow disabled:opacity-60"
            >
              <PhoneCall className="mr-1 inline h-3 w-3" /> Place test call
            </button>
          )}
          <p className="mt-2 text-[10px] text-ink-tertiary">
            Calls the number, you answer + hear yourself. Verifies mic → browser → Twilio → PSTN. Auto-ends after 60s.
          </p>
        </div>
      </div>

      {/* Audio device list */}
      {(devices.inputs.length > 0 || devices.outputs.length > 0) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Input devices ({devices.inputs.length})
            </div>
            <ul className="mt-1 space-y-0.5 text-[11px] text-ink-secondary">
              {devices.inputs.map((d) => (
                <li key={d.deviceId} className="truncate">
                  · {d.label || `(unnamed ${d.deviceId.slice(0, 8)})`}
                </li>
              ))}
              {devices.inputs.length === 0 && (
                <li className="text-ink-tertiary">No input devices visible. Grant mic permission to populate.</li>
              )}
            </ul>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Output devices ({devices.outputs.length})
            </div>
            <ul className="mt-1 space-y-0.5 text-[11px] text-ink-secondary">
              {devices.outputs.map((d) => (
                <li key={d.deviceId} className="truncate">
                  · {d.label || `(unnamed ${d.deviceId.slice(0, 8)})`}
                </li>
              ))}
              {devices.outputs.length === 0 && (
                <li className="text-ink-tertiary">No output devices visible.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Freight live-probe card (slice 72) ──────────────────────────────
//
// Runs estimateLane() against a deterministic tiny payload so the
// operator can see "is freight ACTUALLY going to quote when a buyer
// previews?" without waiting for a real /quote/[id] preview to fail.
// Particularly useful when Shippo is configured -- a key with no
// freight-rates entitlement falls back to the rate card silently,
// which the env-var-only health check can't detect.

type FreightProbeResult = {
  ok: boolean;
  configuredProvider?: "shippo" | "fallback";
  effectiveProvider?: "shippo" | "fallback";
  liveProbe?: boolean;
  degraded?: boolean;
  latencyMs?: number;
  laneKey?: string;
  rateCount?: number;
  cheapest?: {
    mode: string;
    estimateUsd: number;
    transitDaysMin: number;
    transitDaysMax: number;
    notes?: string;
  } | null;
  error?: string;
  fixHint?: string;
  checkedAt?: string;
};

function FreightProbeCard() {
  const { toast } = useToast();
  const [result, setResult] = useState<FreightProbeResult | null>(null);
  const [busy, setBusy] = useState(false);
  // Slice 86: auto-probe on mount. Distinct from the manual click in
  // that it stays silent on success (no green toast spam every time
  // the operator opens the page) but still shows the result tiles
  // and toasts on actual problems. Operator still has the Run probe
  // button for an explicit re-check.
  const [autoRan, setAutoRan] = useState(false);

  const runProbe = useCallback(
    async (auto = false) => {
      setBusy(true);
      try {
        const r = await fetch("/api/admin/freight-probe", {
          method: "POST",
          credentials: "include",
        });
        const d = (await r.json().catch(() => ({}))) as FreightProbeResult;
        setResult(d);
        if (d.ok && !d.degraded) {
          // Auto-probe success is silent -- the green tone on the
          // card border is enough confirmation. Manual click still
          // toasts so the operator sees something happened.
          if (!auto) toast(`Freight probe ok (${d.effectiveProvider}, ${d.latencyMs}ms)`, "success");
        } else if (d.ok && d.degraded) {
          toast(`Probe ran but degraded -- Shippo configured, rate-card returned`, "error");
        } else {
          toast(`Freight probe failed -- ${d.error ?? "unknown"}`, "error");
        }
      } catch (err) {
        // Network errors on auto-probe stay silent (operator might
        // be offline / dev server restarting). Manual click toasts.
        if (!auto) toast(err instanceof Error ? err.message : "Network error", "error");
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  // Run once on mount. The `autoRan` guard prevents StrictMode's
  // double-render in dev from firing twice.
  useEffect(() => {
    if (autoRan) return;
    setAutoRan(true);
    void runProbe(true);
  }, [autoRan, runProbe]);

  const tone = !result
    ? "border-bg-border"
    : !result.ok
      ? "border-accent-red/40"
      : result.degraded
        ? "border-accent-amber/40"
        : "border-accent-green/40";

  return (
    <div className={`rounded-xl border bg-bg-card p-5 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Truck className="h-4 w-4 text-brand-300" /> Freight live probe
        </div>
        <button
          type="button"
          onClick={() => runProbe(false)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-[11px] font-semibold shadow-glow disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          Run probe
        </button>
      </div>
      <p className="mt-1 text-[11px] text-ink-tertiary">
        Quotes a CN → US-CA / 100kg shipment via estimateLane(). Verifies the
        configured provider actually responds. Catches the &ldquo;Shippo key has no
        freight entitlement so we silently rate-card&rdquo; case the env check can&apos;t see.
      </p>

      {result && (
        <div className="mt-3 space-y-2">
          {result.degraded && (
            <div className="rounded-md border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-[11px] text-accent-amber">
              <strong className="font-semibold">Degraded:</strong> Shippo configured but the
              rate-card answered. Either the API key lacks freight entitlement, the request
              timed out, or Shippo returned no matching rates. Check server logs for the
              specific error.
            </div>
          )}
          {!result.ok && (
            <div className="rounded-md border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[11px] text-accent-red">
              <strong className="font-semibold">Failed:</strong> {result.error}
              {result.fixHint && (
                <div className="mt-1 text-accent-amber">{result.fixHint}</div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
            <ProbeStat label="Configured" value={result.configuredProvider ?? "—"} />
            <ProbeStat
              label="Effective"
              value={result.effectiveProvider ?? "—"}
              tone={
                result.effectiveProvider === "shippo"
                  ? "green"
                  : result.configuredProvider === "shippo"
                    ? "amber"
                    : "neutral"
              }
            />
            <ProbeStat label="Latency" value={result.latencyMs ? `${result.latencyMs}ms` : "—"} />
            <ProbeStat label="Rates" value={result.rateCount != null ? String(result.rateCount) : "—"} />
          </div>
          {result.cheapest && (
            <div className="rounded-md border border-bg-border bg-bg-hover/30 p-2 text-[11px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Cheapest:
              </span>
              <span className="ml-2 font-mono">{result.cheapest.mode}</span>
              {" · "}
              <span className="font-semibold text-ink-primary">
                ${result.cheapest.estimateUsd.toLocaleString()}
              </span>
              {" · "}
              {result.cheapest.transitDaysMin}-{result.cheapest.transitDaysMax}d
              {result.cheapest.notes && (
                <div className="mt-0.5 text-ink-tertiary">{result.cheapest.notes}</div>
              )}
            </div>
          )}
          {result.checkedAt && (
            <div className="text-[10px] text-ink-tertiary">checked {relTime(result.checkedAt)}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Twilio webhook helper (slice 91) ────────────────────────────────
//
// Operators setting up Twilio (voice OR SMS) need to paste four URLs
// into Twilio Console:
//   1. TwiML App > Voice Configuration > Request URL  (outbound calls)
//   2. Phone Numbers > <num> > Voice Configuration > Webhook  (inbound)
//   3. recordingStatusCallback (set in the TwiML response, but useful)
//   4. Phone Numbers > <num> > Messaging Configuration > Webhook  (SMS in)
//
// Each URL has a tiny Copy button. Origin is NEXT_PUBLIC_APP_ORIGIN
// when set (production deploys), else window.location.origin (dev),
// else a clearly-marked placeholder so the operator notices.

function TwilioWebhookHelper() {
  const { toast } = useToast();
  const [origin, setOrigin] = useState("https://YOUR-DOMAIN");
  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_APP_ORIGIN;
    if (env) setOrigin(env);
    else if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const urls = [
    {
      label: "Outbound TwiML",
      path: "/api/voice/twiml",
      where: "Twilio Console > Voice > TwiML > Apps > <your app> > Voice Configuration > Request URL (POST)",
    },
    {
      label: "Inbound Voice",
      path: "/api/voice/inbound",
      where: "Twilio Console > Phone Numbers > <your number> > Voice Configuration > A call comes in: Webhook (POST)",
    },
    {
      label: "Recording status",
      path: "/api/voice/recording-status",
      where: "Automatic (set in TwiML response). Listed for debugging webhook reachability.",
    },
    {
      label: "Inbound SMS",
      path: "/api/webhooks/twilio/sms",
      where: "Twilio Console > Phone Numbers > <your number> > Messaging Configuration > A message comes in: Webhook (POST)",
    },
  ];

  function copy(url: string, label: string) {
    navigator.clipboard.writeText(url).then(
      () => toast(`${label} URL copied`, "success"),
      () => toast("Clipboard blocked", "error"),
    );
  }

  const usingPlaceholder = origin.includes("YOUR-DOMAIN");

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Webhook className="h-4 w-4 text-brand-300" /> Twilio webhook URLs
      </div>
      <p className="mt-1 text-[11px] text-ink-tertiary">
        Copy these into Twilio Console to wire your number into AVYN. Origin resolves from{" "}
        <code className="rounded bg-bg-hover px-1 text-[10px]">NEXT_PUBLIC_APP_ORIGIN</code>{" "}
        when set, else the current browser URL.
      </p>
      {usingPlaceholder && (
        <div className="mt-2 rounded-md border border-accent-amber/40 bg-accent-amber/10 px-2 py-1.5 text-[10px] text-accent-amber">
          Origin not detected -- set NEXT_PUBLIC_APP_ORIGIN to your deployed URL before copying.
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {urls.map((u) => {
          const full = `${origin}${u.path}`;
          return (
            <li
              key={u.path}
              className="rounded-md border border-bg-border bg-bg-hover/30 p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                    {u.label}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-ink-secondary">
                    {full}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copy(full, u.label)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2 py-1 text-[10px] font-semibold text-ink-secondary hover:bg-bg-hover"
                  title="Copy URL"
                >
                  Copy
                </button>
              </div>
              <div className="mt-1.5 text-[10px] text-ink-tertiary">{u.where}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProbeStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "amber" | "red" | "neutral";
}) {
  const t =
    tone === "green"
      ? "text-accent-green"
      : tone === "amber"
        ? "text-accent-amber"
        : tone === "red"
          ? "text-accent-red"
          : "text-ink-primary";
  return (
    <div className="rounded-md border border-bg-border bg-bg-base px-2 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold ${t}`}>{value}</div>
    </div>
  );
}
