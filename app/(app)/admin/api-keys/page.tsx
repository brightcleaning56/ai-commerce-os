"use client";
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

type Scope =
  | "read:health"
  | "read:insights"
  | "read:leads"
  | "read:campaigns"
  | "write:leads";

type Environment = "Production" | "Test";
type Status = "Active" | "Revoked";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  environment: Environment;
  status: Status;
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  revokedAt?: string;
  usageWindow: string[];
  used24h: number;
};

const SCOPE_LABEL: Record<Scope, string> = {
  "read:health": "read:health · proof-of-life check",
  "read:insights": "read:insights · outreach leaderboards",
  "read:leads": "read:leads · list captured leads",
  "read:campaigns": "read:campaigns · derived campaigns",
  "write:leads": "write:leads · POST programmatic leads (planned — endpoint not yet live)",
};

const SCOPE_ENABLED: Record<Scope, boolean> = {
  "read:health": true,
  "read:insights": true,
  "read:leads": false,
  "read:campaigns": false,
  "write:leads": false,
};

const STATUS_TONE: Record<Status, string> = {
  Active: "bg-accent-green/15 text-accent-green",
  Revoked: "bg-accent-red/15 text-accent-red",
};

const ENV_TONE: Record<Environment, string> = {
  Production: "bg-brand-500/15 text-brand-200",
  Test: "bg-accent-amber/15 text-accent-amber",
};

// Endpoints actually live behind Bearer auth today. New ones get added
// here as they ship — never advertise an endpoint until it's deployable.
const LIVE_ENDPOINTS: { method: "GET" | "POST"; path: string; scope: Scope; description: string }[] = [
  {
    method: "GET",
    path: "/api/v1/health",
    scope: "read:health",
    description: "Proof-of-life. Returns workspace + key environment + server time. Useful for synthetic monitoring.",
  },
  {
    method: "GET",
    path: "/api/v1/insights",
    scope: "read:insights",
    description: "Outreach insights — same leaderboards (channel, model, touch, subjects, cost) the in-app /outreach panel renders.",
  },
];

function relativeTime(iso?: string): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 30 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2 py-1 text-[11px] hover:bg-bg-hover"
    >
      {copied ? <Check className="h-3 w-3 text-accent-green" /> : <Copy className="h-3 w-3" />}
      {label ?? "Copy"}
    </button>
  );
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"keys" | "endpoints">("keys");
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyEnv, setNewKeyEnv] = useState<Environment>("Test");
  const [newKeyScopes, setNewKeyScopes] = useState<Scope[]>(["read:health"]);
  const [submitting, setSubmitting] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ keyName: string; secret: string } | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/admin/api-keys", { cache: "no-store" });
      if (r.status === 401) {
        setLoadError("Not signed in — visit /signin and try again.");
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setLoadError(`API returned ${r.status}: ${body.error ?? r.statusText}`);
        return;
      }
      const d = await r.json();
      setKeys(d.keys ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleScope(s: Scope) {
    setNewKeyScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  async function submitCreate() {
    if (!newKeyName.trim()) {
      toast("Name your key first", "error");
      return;
    }
    if (newKeyScopes.length === 0) {
      toast("Pick at least one scope", "error");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          environment: newKeyEnv,
          scopes: newKeyScopes,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Create failed (${r.status})`);
      setRevealedSecret({ keyName: d.key.name, secret: d.secret });
      setNewKeyName("");
      setNewKeyScopes(["read:health"]);
      setCreateOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Create failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(k: ApiKey) {
    if (!confirm(`Revoke "${k.name}" (${k.prefix}…)?\nAny callers using this key will start getting 401s immediately.`)) return;
    setRevokingId(k.id);
    try {
      const r = await fetch(`/api/admin/api-keys/${k.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Revoke failed (${r.status})`);
      toast(`Revoked "${k.name}"`, "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Revoke failed", "error");
    } finally {
      setRevokingId(null);
    }
  }

  const counts = useMemo(() => {
    const list = keys ?? [];
    return {
      total: list.length,
      active: list.filter((k) => k.status === "Active").length,
      revoked: list.filter((k) => k.status === "Revoked").length,
      requests24h: list.reduce((sum, k) => sum + (k.used24h ?? 0), 0),
    };
  }, [keys]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://avyncommerce.com";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">API Keys</h1>
            <p className="text-xs text-ink-secondary">
              {counts.active} active · {counts.revoked} revoked · {counts.requests24h.toLocaleString()} requests in last 24h
            </p>
          </div>
        </div>
        <button
          onClick={() => setCreateOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
        >
          <Plus className="h-4 w-4" /> {createOpen ? "Close" : "Create key"}
        </button>
      </div>

      <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
            <AlertCircle className="h-3.5 w-3.5 text-accent-amber" />
          </div>
          <div className="flex-1 text-ink-secondary">
            <span className="font-semibold text-accent-amber">Real keys, real auth</span>
            {" "}— keys created here authenticate against{" "}
            <code className="rounded bg-bg-hover px-1 text-[10px]">/api/v1/*</code>.
            Secrets are SHA-256 hashed at rest and shown ONCE on creation —
            we cannot recover them. Use the Endpoints tab to see what&apos;s live;
            we never advertise a route that isn&apos;t actually deployed.
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load keys:</strong> {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile k="Active" v={counts.active} />
        <Tile k="Revoked" v={counts.revoked} hint="kept for audit" />
        <Tile k="Live endpoints" v={LIVE_ENDPOINTS.length} />
        <Tile k="Requests 24h" v={counts.requests24h.toLocaleString()} />
      </div>

      {/* One-time secret reveal */}
      {revealedSecret && (
        <div className="rounded-xl border-2 border-accent-green/40 bg-accent-green/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-accent-green">
                <Check className="h-4 w-4" /> &ldquo;{revealedSecret.keyName}&rdquo; created — copy the secret now
              </div>
              <p className="mt-1 text-[11px] text-ink-secondary">
                This secret will <strong>never</strong> be shown again. Store it in your secrets manager
                immediately. If you lose it, revoke + recreate.
              </p>
            </div>
            <button
              onClick={() => setRevealedSecret(null)}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card p-3 font-mono text-xs">
            <span className="flex-1 truncate">{revealedSecret.secret}</span>
            <CopyButton text={revealedSecret.secret} label="Copy secret" />
          </div>
          <div className="mt-3 text-[11px] text-ink-secondary">
            Test it:
            <CopyButton
              text={`curl ${origin}/api/v1/health -H "Authorization: Bearer ${revealedSecret.secret}"`}
              label="Copy curl"
            />
          </div>
        </div>
      )}

      {/* Create form */}
      {createOpen && (
        <div className="rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-500/5 to-transparent p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Create a new key</div>
            <button
              onClick={() => setCreateOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Name (e.g. &quot;Slack bot&quot; or &quot;Looker dashboard&quot;)"
              maxLength={80}
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
            <select
              value={newKeyEnv}
              onChange={(e) => setNewKeyEnv(e.target.value as Environment)}
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
            >
              {(["Test", "Production"] as Environment[]).map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="mt-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-tertiary">Scopes</div>
            <div className="space-y-1.5">
              {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => {
                const enabled = SCOPE_ENABLED[s];
                const checked = newKeyScopes.includes(s);
                return (
                  <label
                    key={s}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] ${
                      enabled ? "cursor-pointer hover:bg-bg-hover" : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!enabled}
                      onChange={() => enabled && toggleScope(s)}
                      className="accent-brand-500"
                    />
                    <span className={enabled ? "" : "italic"}>{SCOPE_LABEL[s]}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <button
            onClick={submitCreate}
            disabled={submitting || !newKeyName.trim() || newKeyScopes.length === 0}
            className="mt-4 flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Create &amp; reveal secret
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
        {(["keys", "endpoints"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 ${
              tab === t ? "bg-brand-500/15 text-brand-200" : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`}
          >
            {t === "keys" ? "Keys" : `Endpoints (${LIVE_ENDPOINTS.length})`}
          </button>
        ))}
      </div>

      {tab === "keys" ? (
        <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          {keys === null && !loadError ? (
            <div className="px-5 py-12 text-center text-xs text-ink-tertiary">
              <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : keys && keys.length === 0 ? (
            <div className="px-5 py-12 text-center text-xs text-ink-tertiary">
              <KeyRound className="mx-auto mb-2 h-6 w-6" />
              <div className="text-sm font-semibold text-ink-primary">No keys yet</div>
              <p className="mt-1">Create your first key above to start hitting <code className="rounded bg-bg-hover px-1">/api/v1/*</code>.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                  <tr className="border-b border-bg-border">
                    <th className="px-5 py-2.5 text-left font-medium">Key</th>
                    <th className="px-3 py-2.5 text-left font-medium">Scopes</th>
                    <th className="px-3 py-2.5 text-left font-medium">Env</th>
                    <th className="px-3 py-2.5 text-left font-medium">24h calls</th>
                    <th className="px-3 py-2.5 text-left font-medium">Last used</th>
                    <th className="px-5 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(keys ?? []).map((k) => (
                    <tr key={k.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                      <td className="px-5 py-3">
                        <div className="font-medium">{k.name}</div>
                        <div className="font-mono text-[11px] text-ink-tertiary">
                          {k.prefix}…{" "}
                          <span className="ml-1 text-[10px] text-ink-tertiary">created {relativeTime(k.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <span key={s} className="rounded bg-bg-hover px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${ENV_TONE[k.environment]}`}>
                          {k.environment}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-ink-secondary">{(k.used24h ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-ink-secondary">{relativeTime(k.lastUsedAt)}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[k.status]}`}>
                          {k.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {k.status === "Active" ? (
                          <button
                            onClick={() => revoke(k)}
                            disabled={revokingId === k.id}
                            className="inline-flex items-center gap-1 text-[11px] text-ink-tertiary hover:text-accent-red disabled:opacity-60"
                          >
                            {revokingId === k.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            Revoke
                          </button>
                        ) : (
                          <span className="text-[11px] text-ink-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {LIVE_ENDPOINTS.map((ep) => (
            <div key={ep.path} className="rounded-xl border border-bg-border bg-bg-card p-4">
              <div className="flex items-start gap-3">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    ep.method === "GET" ? "bg-accent-green/15 text-accent-green" : "bg-accent-blue/15 text-accent-blue"
                  }`}
                >
                  {ep.method}
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-sm font-semibold">{ep.path}</code>
                    <span className="rounded bg-bg-hover px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary">
                      requires {ep.scope}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-secondary">{ep.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-md bg-bg-app/50 px-2 py-1 font-mono text-[11px] text-ink-secondary">
                      curl {origin}{ep.path} -H &quot;Authorization: Bearer sk_…&quot;
                    </code>
                    <CopyButton
                      text={`curl ${origin}${ep.path} -H "Authorization: Bearer YOUR_KEY"`}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-bg-border bg-bg-card p-4 text-[12px] text-ink-tertiary">
            <div className="flex items-start gap-2">
              <Code2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Need an endpoint that&apos;s not here yet (e.g. <code className="rounded bg-bg-hover px-1">read:leads</code>,
                {" "}<code className="rounded bg-bg-hover px-1">read:campaigns</code>,
                {" "}<code className="rounded bg-bg-hover px-1">write:leads</code>)? They&apos;re scoped but not yet
                routed — ping the operator and they&apos;ll prioritize. We never list a route here until it&apos;s
                actually deployable.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ k, v, hint }: { k: string; v: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{k}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
      {hint && <div className="text-[10px] text-ink-tertiary">{hint}</div>}
    </div>
  );
}
