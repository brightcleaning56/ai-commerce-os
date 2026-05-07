/**
 * Optional Sentry integration. Activates if @sentry/nextjs is installed AND
 * SENTRY_DSN is set in env. No-op otherwise.
 *
 * To enable:
 *   1. npm install @sentry/nextjs
 *   2. Run `npx @sentry/wizard@latest -i nextjs` (sets up sentry.{client,server,edge}.config.ts)
 *   3. Set SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT in env
 *   4. Set LOG_TO_SENTRY=true so the structured logger bridges errors here
 *
 * Without these steps, errors still log to stdout — Sentry just doesn't see them.
 */

export async function captureException(err: unknown, context?: Record<string, unknown>) {
  if (!process.env.SENTRY_DSN) return;
  try {
    // @ts-expect-error optional dep
    const Sentry = await import(/* webpackIgnore: true */ "@sentry/nextjs");
    Sentry.captureException(err, { extra: context });
  } catch {
    // package not installed — silently no-op
  }
}

export async function captureMessage(msg: string, context?: Record<string, unknown>) {
  if (!process.env.SENTRY_DSN) return;
  try {
    // @ts-expect-error optional dep
    const Sentry = await import(/* webpackIgnore: true */ "@sentry/nextjs");
    Sentry.captureMessage(msg, { extra: context });
  } catch {
    // package not installed — silently no-op
  }
}
