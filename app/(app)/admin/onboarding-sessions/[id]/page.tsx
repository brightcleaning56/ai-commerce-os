"use client";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ExternalLink,
  Factory,
  FileText,
  Loader2,
  ShoppingCart,
  Trash2,
  Truck,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * /admin/onboarding-sessions/[id] — full session detail.
 *
 * Three sections:
 *   1. Header card -- persona, status, email, verified badge, timing
 *   2. Answers replay -- step-by-step playback of what the user
 *      actually entered, rendered as a key/value list per step
 *   3. Documents -- inline preview links for any uploaded files
 *      (PDF / image renders in browser via the document endpoint)
 *
 * Operator can also delete the session (spam / test data cleanup).
 */

type Persona = "admin" | "team" | "buyer" | "supplier" | "distributor";
type Status = "active" | "completed" | "abandoned";

type Session = {
  id: string;
  persona: Persona | null;
  status: Status;
  answers: Record<string, Record<string, unknown>>;
  currentStepId: string | null;
  email?: string;
  emailVerified?: boolean;
  documentsUploaded?: string[];
  resultUserId?: string;
  resultRole?: string;
  ipHash?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type DocMeta = {
  sessionId: string;
  kind: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

const PERSONA_ICON: Record<Persona, typeof Building2> = {
  admin: Building2,
  team: Users,
  buyer: ShoppingCart,
  supplier: Factory,
  distributor: Truck,
};

const PERSONA_LABEL: Record<Persona, string> = {
  admin: "Platform owner",
  team: "Team member",
  buyer: "Buyer",
  supplier: "Supplier",
  distributor: "Distributor",
};

const STATUS_TONE: Record<Status, string> = {
  active: "bg-accent-blue/15 text-accent-blue",
  completed: "bg-accent-green/15 text-accent-green",
  abandoned: "bg-bg-hover text-ink-tertiary",
};

const STATUS_ICON: Record<Status, typeof Circle> = {
  active: Clock,
  completed: CheckCircle2,
  abandoned: XCircle,
};

function formatValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    return v.join(", ");
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val != null && val !== "")
      .map(([k, val]) => `${k}: ${val}`)
      .join(" · ");
  }
  return String(v);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function OnboardingSessionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";

  const [session, setSession] = useState<Session | null>(null);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/onboarding-sessions/${id}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Load failed (${r.status})`);
      }
      const d = await r.json();
      setSession(d.session ?? null);
      setDocs(d.documents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load session");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteSession() {
    if (!id || !session) return;
    const ok = confirm(
      `Delete this onboarding session?\n\n` +
        `Persona: ${session.persona ?? "—"}\n` +
        `Email: ${session.email ?? "—"}\n` +
        `Status: ${session.status}\n\n` +
        `Records this session created (BusinessRecord/SupplierRecord) won't be touched. Delete those separately if needed.`,
    );
    if (!ok) return;
    try {
      const r = await fetch(`/api/admin/onboarding-sessions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Delete failed (${r.status})`);
      }
      router.push("/admin/onboarding-sessions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (loading && !session) {
    return (
      <div className="flex h-64 items-center justify-center text-ink-tertiary">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading session…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Link href="/admin/onboarding-sessions" className="inline-flex items-center gap-1 text-[12px] text-ink-tertiary hover:text-ink-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sessions
        </Link>
        <div className="rounded-xl border border-bg-border bg-bg-card p-8 text-center">
          <div className="text-sm font-semibold">Session not found</div>
          {error && <p className="mt-1 text-[12px] text-accent-red">{error}</p>}
        </div>
      </div>
    );
  }

  const PersonaIcon = session.persona ? PERSONA_ICON[session.persona] : Circle;
  const StatusIcon = STATUS_ICON[session.status];

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href="/admin/onboarding-sessions"
        className="inline-flex items-center gap-1 text-[12px] text-ink-tertiary hover:text-ink-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sessions
      </Link>

      {/* Header card */}
      <div className="rounded-xl border border-bg-border bg-bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-bg-app">
              <PersonaIcon className="h-5 w-5 text-ink-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                {session.persona ? PERSONA_LABEL[session.persona] : "No persona"}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-secondary">
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[session.status]}`}>
                  <StatusIcon className="h-3 w-3" />
                  {session.status}
                </span>
                <span className="font-mono text-[11px] text-ink-tertiary">{session.id}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void deleteSession()}
            className="inline-flex items-center gap-1 rounded-md border border-accent-red/30 bg-accent-red/5 px-2.5 py-1.5 text-[11px] text-accent-red hover:bg-accent-red/15"
          >
            <Trash2 className="h-3 w-3" /> Delete session
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Meta label="Email" value={session.email ?? "—"} mono />
          <Meta
            label="Verified"
            value={session.emailVerified ? "Yes" : "No"}
            tone={session.emailVerified ? "ok" : "warn"}
          />
          <Meta label="Last step" value={session.currentStepId ?? "—"} mono />
          <Meta label="Resulting role" value={session.resultRole ?? "—"} />
          <Meta label="Result record id" value={session.resultUserId ?? "—"} mono />
          <Meta label="Created" value={new Date(session.createdAt).toLocaleString()} />
          <Meta label="Updated" value={new Date(session.updatedAt).toLocaleString()} />
          {session.completedAt && (
            <Meta label="Completed" value={new Date(session.completedAt).toLocaleString()} />
          )}
        </div>

        {/* Cross-link to the resulting record */}
        {session.resultUserId && session.persona && (
          <div className="mt-4 rounded-md border border-accent-blue/30 bg-accent-blue/5 px-3 py-2 text-[12px]">
            {(session.persona === "supplier" || session.persona === "distributor") && (
              <Link
                href={`/admin/suppliers/${session.resultUserId}`}
                className="inline-flex items-center gap-1 text-accent-blue hover:underline"
              >
                Open the SupplierRecord this session created
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {session.persona === "buyer" && (
              <Link
                href={`/admin/businesses?focus=${encodeURIComponent(session.resultUserId)}`}
                className="inline-flex items-center gap-1 text-accent-blue hover:underline"
              >
                Open the BusinessRecord this session created
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {session.persona === "admin" && (
              <span className="text-ink-tertiary">
                Admin onboarding writes to <span className="font-mono">workspace-config.json</span>. Slice 9+ wires a viewer.
              </span>
            )}
            {session.persona === "team" && (
              <span className="text-ink-tertiary">
                Team prefs stored in <span className="font-mono">team-prefs.json</span> keyed by email.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Answers replay */}
      <div>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Answers · {Object.keys(session.answers).length} step{Object.keys(session.answers).length === 1 ? "" : "s"} touched
        </h2>
        {Object.keys(session.answers).length === 0 ? (
          <div className="rounded-xl border border-bg-border bg-bg-card p-6 text-center text-[12px] text-ink-tertiary">
            No answers saved yet.
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(session.answers).map(([stepId, bucket]) => (
              <div key={stepId} className="rounded-xl border border-bg-border bg-bg-card">
                <div className="border-b border-bg-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
                  Step: {stepId}
                </div>
                <div className="divide-y divide-bg-border/40">
                  {Object.entries(bucket as Record<string, unknown>).map(([qid, val]) => (
                    <div
                      key={qid}
                      className="flex flex-wrap items-start gap-2 px-4 py-2"
                    >
                      <div className="min-w-[140px] font-mono text-[11px] text-ink-tertiary">
                        {qid}
                      </div>
                      <div className="flex-1 text-[12px] text-ink-primary">
                        {formatValue(val)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Uploaded documents · {docs.length}
        </h2>
        {docs.length === 0 ? (
          <div className="rounded-xl border border-bg-border bg-bg-card p-6 text-center text-[12px] text-ink-tertiary">
            No documents uploaded.
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.kind}
                className="flex items-center gap-3 rounded-xl border border-bg-border bg-bg-card px-4 py-2.5"
              >
                <FileText className="h-4 w-4 shrink-0 text-ink-secondary" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold">{d.kind}</div>
                  <div className="truncate text-[11px] text-ink-tertiary">
                    {d.filename} · {d.contentType} · {formatBytes(d.sizeBytes)} · uploaded{" "}
                    {new Date(d.uploadedAt).toLocaleString()}
                  </div>
                </div>
                <a
                  href={`/api/admin/onboarding-sessions/${session.id}/document?kind=${encodeURIComponent(d.kind)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-app px-2.5 py-1 text-[11px] text-ink-secondary hover:bg-bg-hover"
                >
                  <Download className="h-3 w-3" /> Open
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fingerprint footer */}
      {(session.ipHash || session.userAgent) && (
        <div className="rounded-md border border-bg-border bg-bg-card/40 px-3 py-2 text-[10px] text-ink-tertiary">
          {session.ipHash && (
            <>
              IP fingerprint: <span className="font-mono">{session.ipHash}</span>
              {session.userAgent ? " · " : ""}
            </>
          )}
          {session.userAgent && <>UA: <span className="font-mono">{session.userAgent}</span></>}
        </div>
      )}
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "ok" | "warn";
}) {
  const valueColor =
    tone === "ok" ? "text-accent-green" : tone === "warn" ? "text-accent-amber" : "text-ink-primary";
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-0.5 text-[12px] ${valueColor} ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
