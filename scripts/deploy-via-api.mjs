#!/usr/bin/env node
/**
 * Direct Vercel deploy via REST API — bypasses the CLI's broken team-check
 * for new "Northstar" / `limited:true` accounts.
 *
 * Usage:
 *   VERCEL_TOKEN=<token> node scripts/deploy-via-api.mjs
 *
 * Flow:
 *   1. Walk the project directory, building a file list (respecting .gitignore-ish patterns)
 *   2. SHA1-hash + upload each file to /v2/files
 *   3. POST /v13/deployments with the file digests + projectSettings
 *   4. Poll /v13/deployments/<id> until READY or ERROR
 *   5. Print the deploy URL
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error("VERCEL_TOKEN env var required");
  process.exit(1);
}

const PROJECT_NAME = process.env.PROJECT_NAME || "ai-commerce-os";
const ROOT = process.cwd();

const IGNORES = [
  /^node_modules(\/|$)/,
  /^\.next(\/|$)/,
  /^\.next\.dev\.bak(\/|$)/,
  /^\.git(\/|$)/,
  /^\.vercel(\/|$)/,
  /^data(\/|$)/,
  /^\.env(\..*)?\.local$/,
  /^\.env$/,
  /^dev\.log$/,
  /^dev\.err\.log$/,
  /^\.build\.log$/,
  /^tsconfig\.tsbuildinfo$/,
  /^netlify(\/|$)/,        // not deploying to Netlify here
  /\.swp$/,
  /\.DS_Store$/,
];

function shouldIgnore(rel) {
  return IGNORES.some((re) => re.test(rel));
}

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(base, entry.name);
    if (shouldIgnore(rel)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, rel));
    } else if (entry.isFile()) {
      out.push({ rel, full });
    }
  }
  return out;
}

async function api(method, url, body, extraHeaders = {}) {
  const res = await fetch(`https://api.vercel.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json ?? text, raw: text };
}

async function uploadFile(file) {
  const data = fs.readFileSync(file.full);
  const sha = crypto.createHash("sha1").update(data).digest("hex");
  const res = await fetch(`https://api.vercel.com/v2/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/octet-stream",
      "x-vercel-digest": sha,
    },
    body: data,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`upload ${file.rel} → ${res.status}: ${t.slice(0, 200)}`);
  }
  return { file: file.rel, sha, size: data.length };
}

(async () => {
  console.log(`[deploy] project=${PROJECT_NAME} root=${ROOT}`);

  // Whoami probe (we already know the token works for API)
  const me = await api("GET", "/v2/user");
  if (me.status !== 200) {
    console.error(`Token invalid: ${me.status} ${me.raw.slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`[deploy] auth ok — user=${me.body.user?.email} team=${me.body.user?.defaultTeamId ?? "(personal)"}`);

  console.log(`[deploy] walking project...`);
  const files = walk(ROOT);
  const totalSize = files.reduce((s, f) => s + fs.statSync(f.full).size, 0);
  console.log(`[deploy] found ${files.length} files, ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

  console.log(`[deploy] uploading files (parallel batches of 8)...`);
  const uploaded = [];
  const BATCH = 8;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(uploadFile));
    uploaded.push(...results);
    if (uploaded.length % 24 === 0 || uploaded.length === files.length) {
      console.log(`  ${uploaded.length}/${files.length}`);
    }
  }
  console.log(`[deploy] all ${uploaded.length} files uploaded`);

  // Read env vars from .env.local
  const envFile = path.join(ROOT, ".env.local");
  const envVars = {};
  if (fs.existsSync(envFile)) {
    const text = fs.readFileSync(envFile, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (m && m[2].trim()) envVars[m[1]] = m[2].trim();
    }
    console.log(`[deploy] loaded ${Object.keys(envVars).length} env vars from .env.local`);
  }

  console.log(`[deploy] creating deployment...`);
  const deploy = await api("POST", "/v13/deployments", {
    name: PROJECT_NAME,
    target: "production",
    files: uploaded.map((u) => ({ file: u.file, sha: u.sha, size: u.size })),
    projectSettings: {
      framework: "nextjs",
      buildCommand: null,
      installCommand: null,
      outputDirectory: null,
      devCommand: null,
      rootDirectory: null,
    },
    env: envVars,
    build: { env: envVars },
  });

  if (deploy.status !== 200 && deploy.status !== 201) {
    console.error(`[deploy] creation failed: ${deploy.status}`);
    console.error(JSON.stringify(deploy.body, null, 2).slice(0, 2000));
    process.exit(1);
  }

  const dId = deploy.body.id;
  const dUrl = deploy.body.url;
  console.log(`[deploy] created: ${dId}`);
  console.log(`[deploy] preview URL (https://${dUrl}) is being built...`);

  // Poll until ready
  let state = deploy.body.readyState || "QUEUED";
  let lastState = "";
  let polls = 0;
  const maxPolls = 60; // 5 minutes max
  while (state !== "READY" && state !== "ERROR" && state !== "CANCELED" && polls < maxPolls) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await api("GET", `/v13/deployments/${dId}`);
    if (poll.status !== 200) {
      console.warn(`  poll ${polls + 1}: HTTP ${poll.status}`);
      continue;
    }
    state = poll.body.readyState;
    if (state !== lastState) {
      console.log(`  → ${state}`);
      lastState = state;
    } else {
      process.stdout.write(".");
    }
    polls++;
  }
  console.log("");

  if (state === "READY") {
    console.log(`\n✓ DEPLOYED`);
    console.log(`  Production URL: https://${dUrl}`);
    console.log(`  Inspect:       https://vercel.com/${me.body.user.username}/${PROJECT_NAME}`);
  } else {
    console.log(`\n✗ Final state: ${state}`);
    // Try to fetch build logs
    const logs = await api("GET", `/v3/deployments/${dId}/events?builds=1&limit=50`);
    if (logs.body && Array.isArray(logs.body)) {
      console.log("\nBuild events:");
      for (const ev of logs.body.slice(-30)) {
        console.log(`  [${ev.type}] ${ev.text || ev.payload?.text || JSON.stringify(ev.payload).slice(0, 120)}`);
      }
    }
    process.exit(1);
  }
})().catch((e) => {
  console.error("deploy crashed:", e.message);
  console.error(e.stack);
  process.exit(1);
});
