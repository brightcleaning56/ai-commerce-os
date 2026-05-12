"use client";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type InviteRole = "Admin" | "Operator" | "Viewer" | "Billing";
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

const ROLE_BLURB: Record<InviteRole, string> = {
  Admin: "Full operator powers minus billing — manage agents, the CRM pipeline, and the marketplace.",
  Operator: "Run your assigned agents and your slice of the CRM pipeline.",
  Viewer: "Read-only access — see what the workspace is doing without making changes.",
  Billing: "Manage subscriptions, invoices, and payment methods. No operational access.",
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
          <AcceptedCard invite={invite} />
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

            {/* Honesty note — Eric's rule: never lie to a user about capability */}
            <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-4 text-[12px]">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" />
                <div className="text-ink-secondary">
                  <strong className="font-semibold text-accent-amber">Heads up:</strong>
                  {" "}per-user sign-in for AVYN Commerce isn&apos;t live yet. Accepting confirms
                  you&apos;re joining and notifies {invite.invitedBy.name.split(" ")[0]} — you&apos;ll get
                  a follow-up email with a sign-in link once it ships. Nothing to install or set up today.
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

function AcceptedCard({ invite }: { invite: InvitePayload }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-accent-green">
        <CheckCircle2 className="h-6 w-6" />
        <h1 className="text-xl font-bold">You&apos;re in</h1>
      </div>
      <p className="text-sm text-ink-secondary">
        We let <span className="font-medium text-ink-primary">{invite.invitedBy.name}</span> know
        you accepted the <span className="font-semibold text-brand-200">{invite.role}</span> seat
        at <span className="font-medium text-ink-primary">{invite.workspace}</span>.
      </p>
      <div className="rounded-xl border border-bg-border bg-bg-card p-4 text-[12px] text-ink-secondary">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
          <div>
            Next step is on us — when per-user sign-in ships, we&apos;ll email you a link to set
            up your account. No action needed from you today.
          </div>
        </div>
      </div>
      <a
        href="https://avyncommerce.com"
        className="inline-flex items-center gap-1 text-sm text-brand-200 hover:underline"
      >
        Learn more about AVYN Commerce
        <ArrowRight className="h-3.5 w-3.5" />
      </a>
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
