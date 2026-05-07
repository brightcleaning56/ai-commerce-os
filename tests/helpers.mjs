/**
 * Shared helpers for integration tests. Tests hit the running dev server at
 * BASE_URL (default http://localhost:3000) — start it before running tests.
 *
 * Auth: if ADMIN_TOKEN is set in the dev server's env, tests need it too.
 * Pass it via TEST_ADMIN_TOKEN env var, OR drop a `.env.test` with the value.
 * Tests that hit /api/admin/* automatically include the bearer header.
 */

import fs from "node:fs";
import path from "node:path";

export const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

// Read ADMIN_TOKEN from .env.local if not in env (dev convenience)
function loadAdminToken() {
  if (process.env.TEST_ADMIN_TOKEN) return process.env.TEST_ADMIN_TOKEN;
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  try {
    const envFile = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envFile)) {
      const raw = fs.readFileSync(envFile, "utf-8");
      const match = raw.match(/^ADMIN_TOKEN=(.+)$/m);
      if (match) return match[1].trim();
    }
  } catch {}
  return null;
}
export const ADMIN_TOKEN = loadAdminToken();

// Paths the middleware leaves open — must match middleware.ts. Tests targeting
// these paths don't get the admin bearer header attached (matches real-world use).
const PUBLIC_PREFIXES = [
  "/api/share/",
  "/api/quotes/",
  "/api/webhooks/",
  "/api/cron/",
  "/api/operator",
  "/api/auth/",
];
function isPublicPath(p) {
  return PUBLIC_PREFIXES.some((prefix) => p.startsWith(prefix));
}

export async function api(path, init = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  // Auto-attach admin auth for ALL gated endpoints when token is available.
  // Public paths are explicitly excluded so 401-on-public tests still work.
  if (ADMIN_TOKEN && !isPublicPath(path) && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, headers: res.headers };
}

export async function runPipeline(opts = {}) {
  const res = await api("/api/agents/pipeline", {
    method: "POST",
    body: JSON.stringify({
      category: null,
      maxProducts: 1,
      maxBuyersPerProduct: 1,
      findSuppliers: false,
      ...opts,
    }),
  });
  if (res.status !== 200) {
    throw new Error(`Pipeline failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

export async function viewShare(pipelineId, token, ua = "TestSuite/1.0") {
  return api(`/api/share/${pipelineId}?t=${encodeURIComponent(token)}`, {
    headers: { "User-Agent": ua },
  });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

export function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
}
