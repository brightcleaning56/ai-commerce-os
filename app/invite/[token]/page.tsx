"use client";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type InviteRole =
  | "Admin"
  | "Sales"
  | "Operator"
  | "Finance"
  | "Marketing"
  | "Support"
  | "Analyst"
  | "Developer"
  | "Viewer";
type InviteStatus = "pending" | "accepted" | "cancelled" | "expired";

type InvitePayload = {
  role: InviteRole;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  invitedBy: { name: string; company: string };
  workspace: string;
};

// Plain-language summary per role. The actual capabilities are set by
// the workspace owner on /admin/users, so these are best-guess
// descriptions of the suggested presets, not enforced contracts.
const ROLE_BLURB: Record<InviteRole, string> = {
  Admin: "Workspace administration — user management, system health, audit log, kill switch. No billing or direct integrations work.",
  Sales: "Run the pipeline — leads, deals, outreach, CRM, quotes, sales calls.",
  Operator: "Day-to-day operations — transactions, calls and voicemails, tasks, supplier coordination.",
  Finance: "Money — billing, earnings, escrow, transaction reads.",
  Marketing: "Top-of-funnel — outreach campaigns, automations, demand signals.",
  Support: "Customer-facing — calls, voicemails, lead comms.",
  Analyst: "Read-only everywhere — reports, insights, audit, transaction history.",
  Developer: "Tech surface — API keys, integrations, data sources, system health.",
  Viewer: "Read-only access across the workspace, no write actions.",
};

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [userToken, setUserToken] = useState<string>("");
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setLoadError("Missing invite token. Open the link from your email.");
        setLoading(false);
        return;
      }
      try {
        const r = await fetch(`/api/invites/${token}`, { cache: "no-store" });
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(d.error ?? `Couldn't load invite (${r.status})`);
        } else {
          setInvite(d as InvitePayload);
          if (d.status === "accepted") setAccepted(true);
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

  async function submitAccept() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Accept failed (${r.status})`);
      if (typeof d.userToken === "string") setUserToken(d.userToken);
      if (typeof d.tokenError === "string") setTokenError(d.tokenError);
      setAccepted(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't accept invite");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-app text-ink-primary">
      <div className="mx-auto max-w-md px-5 py-12 sm:py-20">
        {/* Brand */}
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-brand shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="text-lg font-bold tracking-tight">AVYN Commerce</div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your invite…
          </div>
        ) : loadError ? (
          <ErrorCard title="Invite link unusable" message={loadError} />
        ) : invite?.status === "cancelled" ? (
          <ErrorCard
            title="This invite was cancelled"
            message={`${invite.invitedBy.name} revoked it. Ask them to send a new one if you still want to join.`}
            icon="cancelled"
          />
        ) : invite?.status === "expired" ? (
          <ErrorCard
            title="This invite has expired"
            message={`Invites are valid for 14 days. Ask ${invite.invitedBy.name} to send a fresh one.`}
            icon="expired"
          />
        ) : accepted && invite ? (
          <AcceptedCard invite={invite} userToken={userToken} tokenError={tokenError} />
        ) : invite ? (
          <div className="space-y-6">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                You&apos;ve been invited
              </div>
              <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
                Join {invite.workspace}
              </h1>
              <p className="mt-2 text-sm text-ink-secondary">
                <span className="font-medium text-ink-primary">{invite.invitedBy.name}</span>
                {" "}added you to their AVYN Commerce workspace as{" "}
                <span className="font-semibold text-brand-200">{invite.role}</span>.
              </p>
            </div>

            <div className="rounded-xl border border-bg-border bg-bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-500/15">
                  <Users className="h-4 w-4 text-brand-200" />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                    Your role
                  </div>
                  <div className="mt-0.5 text-sm font-semibold">{invite.role}</div>
                  <div className="mt-1 text-[12px] text-ink-secondary">
                    {ROLE_BLURB[invite.role]}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-bg-border pt-3 text-[11px] text-ink-tertiary">
                Invite expires <span className="text-ink-secondary">{formatDate(invite.expiresAt)}</span>
              </div>
            </div>

            {/* Honesty note: per-role permissions aren't enforced yet. */}
            <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-4 text-[12px]">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" />
                <div className="text-ink-secondary">
                  <strong className="font-semibold text-accent-amber">Heads up:</strong>
                  {" "}accepting will give you a personal sign-in token on the next screen.
                  Until per-role permissions ship, the token grants full workspace access
                  regardless of role — same as {invite.invitedBy.name.split(" ")[0]} has today.
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-bg-border bg-bg-card p-5">
              <div className="text-sm font-semibold">Your name</div>
              <p className="mt-0.5 text-[11px] text-ink-tertiary">
                How should we display you when you do show up in the workspace?
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitAccept()}
                placeholder="Your full name"
                maxLength={80}
                autoFocus
                className="mt-3 h-11 w-full rounded-lg border border-bg-border bg-bg-app px-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
              />
              <button
                onClick={submitAccept}
                disabled={submitting || name.trim().length < 2}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-2.5 text-sm font-semibold shadow-glow disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Accepting…
                  </>
                ) : (
                  <>
                    Accept invite
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AcceptedCard({
  invite,
  userToken,
  tokenError,
}: {
  invite: InvitePayload;
  userToken: string;
  tokenError: string | null;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!userToken) return;
    try {
      await navigator.clipboard.writeText(userToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — fall back to selecting via Reveal
      setShow(true);
    }
  }

  // If token mint failed (e.g. ADMIN_TOKEN not set in dev) we fall back
  // to the old "we'll email you" message so the page still confirms.
  if (!userToken || tokenError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-accent-green">
          <CheckCircle2 className="h-6 w-6" />
          <h1 className="text-xl font-bold">You&apos;re in</h1>
        </div>
        <p className="text-sm text-ink-secondary">
          We let <span className="font-medium text-ink-primary">{invite.invitedBy.name}</span>{" "}
          know you accepted the{" "}
          <span className="font-semibold text-brand-200">{invite.role}</span> seat at{" "}
          <span className="font-medium text-ink-primary">{invite.workspace}</span>.
        </p>
        <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-4 text-[12px] text-ink-secondary">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" />
            <div>
              We couldn&apos;t generate your sign-in token right now
              {tokenError ? <> ({tokenError})</> : null}. {invite.invitedBy.name.split(" ")[0]}{" "}
              will follow up once it&apos;s sorted.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-accent-green">
        <CheckCircle2 className="h-6 w-6" />
        <h1 className="text-xl font-bold">You&apos;re in</h1>
      </div>
      <p className="text-sm text-ink-secondary">
        Welcome to <span className="font-medium text-ink-primary">{invite.workspace}</span>.
        Below is your personal sign-in token. Save it somewhere safe — we won&apos;t show it
        again.
      </p>

      <div className="rounded-xl border border-bg-border bg-bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Your sign-in token
          </div>
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-app px-2 py-1 text-[11px] text-ink-secondary hover:bg-bg-border"
          >
            {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {show ? "Hide" : "Reveal"}
          </button>
        </div>
        <div
          className="mt-2 break-all rounded-md border border-bg-border bg-bg-app px-3 py-2 font-mono text-[11px] text-ink-primary"
          style={{ filter: show ? undefined : "blur(5px)" }}
        >
          {userToken}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-bg-border bg-bg-app px-3 py-2 text-[12px] font-medium text-ink-primary hover:bg-bg-border"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy token"}
          </button>
          <a
            href={`/signin?next=/`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-brand px-3 py-2 text-[12px] font-semibold shadow-glow"
          >
            Sign in
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="mt-3 text-[10px] text-ink-tertiary">
          Token expires in 90 days. Paste it into the Access Token field on the sign-in page.
        </div>
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card p-4 text-[12px] text-ink-secondary">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
          <div>
            Treat this token like a password — anyone who has it can sign in as you. If you
            lose it, ask {invite.invitedBy.name.split(" ")[0]} to resend your invite.
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon?: "cancelled" | "expired";
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-accent-red">
        {icon === "cancelled" ? <XCircle className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      <p className="text-sm text-ink-secondary">{message}</p>
      <a
        href="https://avyncommerce.com"
        className="inline-flex items-center gap-1 text-sm text-brand-200 hover:underline"
      >
        Visit avyncommerce.com
        <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}
