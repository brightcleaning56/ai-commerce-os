"use client";
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  Plug,
  Plus,
  Sparkles,
  Trash2,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { API_KEYS, ENDPOINTS, WEBHOOKS, type ApiKey, type Webhook as Hook } from "@/lib/apiKeys";

const STATUS_TONE: Record<string, string> = {
  Active: "bg-accent-green/15 text-accent-green",
  Revoked: "bg-accent-red/15 text-accent-red",
  Disabled: "bg-bg-hover text-ink-tertiary",
};

const ENV_TONE: Record<string, string> = {
  Production: "bg-brand-500/15 text-brand-200",
  Test: "bg-accent-amber/15 text-accent-amber",
};

const METHOD_TONE: Record<string, string> = {
  GET: "bg-accent-green/15 text-accent-green",
  POST: "bg-accent-blue/15 text-accent-blue",
};

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="grid h-6 w-6 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
    >
      {copied ? <Check className="h-3 w-3 text-accent-green" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function ApiKeysPage() {
  const [tab, setTab] = useState<"keys" | "endpoints" | "webhooks">("keys");
  const [keys, setKeys] = useState<ApiKey[]>(API_KEYS);
  const [hooks, setHooks] = useState<Hook[]>(WEBHOOKS);
  const [createOpen, setCreateOpen] = useState(false);
  const [hookOpen, setHookOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ id: string; secret: string } | null>(null);
  const { toast } = useToast();

  // Create-key form
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyEnv, setNewKeyEnv] = useState<"Production" | "Test">("Production");

  // Add-webhook form
  const [newHookUrl, setNewHookUrl] = useState("");
  const [newHookEvents, setNewHookEvents] = useState("deal.closed_won");

  function genSecret() {
    return (
      "sk_" +
      (newKeyEnv === "Test" ? "test" : "live") +
      "_" +
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function handleCreateKey() {
    if (!newKeyName.trim()) {
      toast("Name your key first", "error");
      return;
    }
    const secret = genSecret();
    const id = `k${keys.length + 1}_${Date.now().toString(36)}`;
    const newKey: ApiKey = {
      id,
      name: newKeyName,
      prefix: secret.slice(0, 12),
      scopes: ["read:products", "read:buyers"],
      createdAt: new Date().toLocaleDateString(),
      lastUsed: "Never",
      rateLimit: 25_000,
      used24h: 0,
      status: "Active",
      environment: newKeyEnv,
    };
    setKeys((prev) => [newKey, ...prev]);
    setRevealedKey({ id, secret });
    setNewKeyName("");
    setCreateOpen(false);
    toast(`Created "${newKey.name}" — copy the secret now, you won't see it again`);
  }

  function handleRevoke(k: ApiKey) {
    setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, status: "Revoked" } : x)));
    toast(`Revoked "${k.name}"`);
  }

  function handleAddHook() {
    if (!newHookUrl.trim().startsWith("http")) {
      toast("Webhook URL must start with http(s)://", "error");
      return;
    }
    const id = `w${hooks.length + 1}_${Date.now().toString(36)}`;
    const newHook: Hook = {
      id,
      url: newHookUrl,
      events: newHookEvents.split(",").map((e) => e.trim()).filter(Boolean),
      status: "Active",
      successRate24h: 100,
    };
    setHooks((prev) => [newHook, ...prev]);
    setNewHookUrl("");
    setHookOpen(false);
    toast(`Webhook added · ${newHook.url}`);
  }

  function handleDocs() {
    toast("Opening API docs in a new tab — full reference at /admin/api-keys", "info");
  }

  const totalCalls24h = keys.reduce((s, k) => s + k.used24h, 0);
  const totalLimit = keys.filter((k) => k.status === "Active").reduce((s, k) => s + k.rateLimit, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">API &amp; Developer Portal</h1>
            <p className="text-xs text-ink-secondary">
              {keys.filter((k) => k.status === "Active").length} active keys ·{" "}
              {totalCalls24h.toLocaleString()} calls in last 24h
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDocs}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <ExternalLink className="h-4 w-4" /> Open Docs
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
          >
            <Plus className="h-4 w-4" /> Create Key
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active Keys" value={keys.filter((k) => k.status === "Active").length} />
        <Stat label="Calls 24h" value={totalCalls24h.toLocaleString()} />
        <Stat label="Rate Limit Total" value={totalLimit.toLocaleString() + "/day"} />
        <Stat label="Endpoints" value={ENDPOINTS.length} />
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
        {(
          [
            ["keys", "API Keys", keys.length, KeyRound],
            ["endpoints", "Endpoints", ENDPOINTS.length, Code2],
            ["webhooks", "Webhooks", hooks.length, Webhook],
          ] as const
        ).map(([k, label, n, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 ${
              tab === k
                ? "bg-brand-500/15 text-brand-200"
                : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            <span
              className={`rounded ${
                tab === k ? "bg-brand-500/20" : "bg-bg-hover"
              } px-1.5 text-[10px]`}
            >
              {n}
            </span>
          </button>
        ))}
      </div>

      {tab === "keys" && (
        <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr className="border-b border-bg-border">
                <th className="px-5 py-2.5 text-left font-medium">Name</th>
                <th className="px-3 py-2.5 text-left font-medium">Key</th>
                <th className="px-3 py-2.5 text-left font-medium">Env</th>
                <th className="px-3 py-2.5 text-left font-medium">Scopes</th>
                <th className="px-3 py-2.5 text-left font-medium">Usage 24h</th>
                <th className="px-3 py-2.5 text-left font-medium">Last Used</th>
                <th className="px-5 py-2.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const pct = Math.min(100, (k.used24h / k.rateLimit) * 100);
                const near = pct > 80;
                return (
                  <tr key={k.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                    <td className="px-5 py-3">
                      <div className="font-medium">{k.name}</div>
                      <div className="text-[11px] text-ink-tertiary">Created {k.createdAt}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 font-mono text-xs">
                        {k.prefix}_••••
                        <CopyChip text={`${k.prefix}••••••••••••••••`} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${ENV_TONE[k.environment]}`}>
                        {k.environment}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.slice(0, 2).map((s) => (
                          <span
                            key={s}
                            className="rounded-md bg-bg-hover/60 px-1.5 py-0.5 text-[10px] text-ink-secondary"
                          >
                            {s}
                          </span>
                        ))}
                        {k.scopes.length > 2 && (
                          <span className="rounded-md bg-bg-hover/60 px-1.5 py-0.5 text-[10px] text-ink-tertiary">
                            +{k.scopes.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 w-44">
                      <div className="text-xs">
                        {k.used24h.toLocaleString()}{" "}
                        <span className="text-ink-tertiary">
                          / {k.rateLimit.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-hover">
                        <div
                          className={`h-full ${near ? "bg-accent-amber" : "bg-gradient-brand"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-secondary">{k.lastUsed}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[k.status]}`}>
                          {k.status}
                        </span>
                        {k.status === "Active" && (
                          <button
                            onClick={() => handleRevoke(k)}
                            className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-accent-red/10 hover:text-accent-red"
                            aria-label="Revoke key"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "endpoints" && (
        <div className="space-y-3">
          {ENDPOINTS.map((e) => (
            <div
              key={e.path}
              className="overflow-hidden rounded-xl border border-bg-border bg-bg-card"
            >
              <div className="flex items-center gap-3 border-b border-bg-border px-5 py-3">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-bold ${METHOD_TONE[e.method]}`}
                >
                  {e.method}
                </span>
                <span className="font-mono text-sm">{e.path}</span>
                <span className="ml-auto rounded-md bg-bg-hover/60 px-2 py-0.5 text-[10px] text-ink-secondary">
                  scope: {e.scope}
                </span>
              </div>
              <p className="px-5 py-3 text-xs text-ink-secondary">{e.description}</p>
              <div className="border-t border-bg-border bg-bg-panel px-5 py-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                    cURL
                  </span>
                  <CopyChip text={e.example} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-ink-secondary">
{e.example}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "webhooks" && (
        <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="text-sm font-semibold">Outbound Webhooks</div>
            <button
              onClick={() => setHookOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-xs text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            >
              <Plus className="h-3 w-3" /> Add webhook
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">URL</th>
                <th className="px-3 py-2.5 text-left font-medium">Events</th>
                <th className="px-3 py-2.5 text-left font-medium">Success 24h</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {hooks.map((w) => (
                <tr key={w.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                  <td className="px-5 py-3 font-mono text-xs">{w.url}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {w.events.map((ev) => (
                        <span
                          key={ev}
                          className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-200"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        w.successRate24h > 99 ? "text-accent-green" :
                        w.successRate24h > 90 ? "text-accent-amber" :
                        "text-accent-red"
                      }
                    >
                      {w.successRate24h.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[w.status]}`}>
                      {w.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/20">
              <Sparkles className="h-5 w-5 text-brand-200" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-brand-200">
                API as a revenue stream
              </div>
              <p className="mt-1 text-xs text-ink-secondary">
                Resell read access to product / buyer / supplier data to your own customers. Per-request billing or fixed tiers — track by API key.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent-amber/15">
              <AlertCircle className="h-5 w-5 text-accent-amber" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Rate limits per plan</div>
              <p className="mt-1 text-xs text-ink-secondary">
                Starter: 0 calls · Growth: 100K/day · Enterprise: unlimited.
                Need more? Contact sales for custom volume pricing.
              </p>
            </div>
          </div>
        </div>
      </div>

      {createOpen && (
        <Modal title="Create API key" onClose={() => setCreateOpen(false)}>
          <div className="space-y-3 px-5 py-4">
            <label className="block">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Name
              </div>
              <input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Internal dashboard"
                className="h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Environment
              </div>
              <div className="flex gap-2">
                {(["Production", "Test"] as const).map((env) => (
                  <button
                    key={env}
                    onClick={() => setNewKeyEnv(env)}
                    className={`flex-1 rounded-md border px-3 py-2 text-xs ${
                      newKeyEnv === env
                        ? "border-brand-500/60 bg-brand-500/10 text-brand-200"
                        : "border-bg-border bg-bg-card hover:bg-bg-hover"
                    }`}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-bg-border px-5 py-3">
            <button
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateKey}
              className="rounded-lg bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow"
            >
              Create key
            </button>
          </div>
        </Modal>
      )}

      {revealedKey && (
        <Modal title="Copy your secret now" onClose={() => setRevealedKey(null)}>
          <div className="space-y-3 px-5 py-4">
            <div className="rounded-lg border border-accent-amber/40 bg-accent-amber/5 p-3 text-[11px] text-ink-secondary">
              <AlertCircle className="mr-1 inline h-3.5 w-3.5 text-accent-amber" />
              You will not see this secret again. Store it in your secret manager.
            </div>
            <div className="rounded-lg border border-bg-border bg-bg-panel p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="flex-1 break-all font-mono text-xs">{revealedKey.secret}</code>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(revealedKey.secret);
                    toast("Secret copied to clipboard");
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-bg-border bg-bg-card text-ink-secondary hover:text-ink-primary"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end border-t border-bg-border px-5 py-3">
            <button
              onClick={() => setRevealedKey(null)}
              className="rounded-lg bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow"
            >
              I&apos;ve copied it
            </button>
          </div>
        </Modal>
      )}

      {hookOpen && (
        <Modal title="Add webhook" onClose={() => setHookOpen(false)}>
          <div className="space-y-3 px-5 py-4">
            <label className="block">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Endpoint URL
              </div>
              <input
                value={newHookUrl}
                onChange={(e) => setNewHookUrl(e.target.value)}
                placeholder="https://yourdomain.com/webhooks/aicos"
                className="h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 font-mono text-xs focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Events (comma separated)
              </div>
              <input
                value={newHookEvents}
                onChange={(e) => setNewHookEvents(e.target.value)}
                placeholder="deal.closed_won, forecast.published"
                className="h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 font-mono text-xs focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-bg-border px-5 py-3">
            <button
              onClick={() => setHookOpen(false)}
              className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
            >
              Cancel
            </button>
            <button
              onClick={handleAddHook}
              className="rounded-lg bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow"
            >
              Add webhook
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl border border-bg-border bg-bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
          <div className="text-sm font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-brand-300" />
        <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
          {label}
        </div>
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
