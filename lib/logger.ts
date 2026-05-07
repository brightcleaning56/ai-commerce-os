/**
 * Minimal structured logger. JSON output in production, human-readable in dev.
 *
 * Auto-redacts known secret fields so an accidental `log.error("auth failed", { token })`
 * doesn't leak tokens to logs.
 *
 * Drop-in for console.log — but with structured context. Once you ship this
 * to a log aggregator (Vercel logs, Datadog, Logtail), the JSON shape lets
 * you filter/alert.
 *
 * Sentry hook: if @sentry/nextjs is installed and LOG_TO_SENTRY=true, errors
 * flow to Sentry too. We don't import @sentry/nextjs directly to avoid a
 * hard dep — see lib/sentry.ts for the optional integration.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (process.env.LOG_LEVEL?.toLowerCase() as Level) || "info";
const isJson = process.env.LOG_FORMAT === "json" || process.env.NODE_ENV === "production";

const REDACT_KEYS = new Set([
  "token", "password", "secret", "apikey", "api_key", "authorization",
  "cookie", "set-cookie", "x-aicos-signature", "anthropic_api_key",
  "shareToken", "shareLinkToken", "smsShareLinkToken", "linkedinShareLinkToken",
  "admin_token", "cron_secret",
]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Redact obvious token-shaped strings (sk-ant-xxx, 24+ char hex)
    if (/^sk-ant-/i.test(value) && value.length > 12) {
      return value.slice(0, 8) + "..." + value.slice(-4);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS.has(k.toLowerCase())) {
        out[k] = "[redacted]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const safe = ctx ? redact(ctx) : undefined;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(safe ? { ctx: safe } : {}),
  };
  if (isJson) {
    const line = JSON.stringify(entry);
    // Use the matching console method so log destinations route correctly
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } else {
    const tag =
      level === "error" ? "\x1b[31mERROR\x1b[0m"
      : level === "warn" ? "\x1b[33mWARN\x1b[0m"
      : level === "info" ? "\x1b[36mINFO\x1b[0m"
      : "DEBUG";
    if (safe) {
      // eslint-disable-next-line no-console
      console.log(`[${tag}] ${msg}`, safe);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[${tag}] ${msg}`);
    }
  }
  // Bridge errors to Sentry if configured (lazy require, no hard dep)
  if (level === "error" && process.env.LOG_TO_SENTRY === "true") {
    void bridgeToSentry(msg, ctx);
  }
}

let _sentryAttempted = false;
let _sentry: { captureException?: (err: unknown, ctx?: unknown) => void; captureMessage?: (msg: string, ctx?: unknown) => void } | null = null;

async function bridgeToSentry(msg: string, ctx?: Record<string, unknown>) {
  if (!_sentryAttempted) {
    _sentryAttempted = true;
    try {
      // @ts-expect-error optional dep
      const mod = await import(/* webpackIgnore: true */ "@sentry/nextjs");
      _sentry = mod;
    } catch {
      _sentry = null;
    }
  }
  if (!_sentry) return;
  try {
    if (ctx?.error instanceof Error) {
      _sentry.captureException?.(ctx.error, { extra: redact(ctx) });
    } else {
      _sentry.captureMessage?.(msg, { extra: redact(ctx) });
    }
  } catch {
    // never let logging itself throw
  }
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};
