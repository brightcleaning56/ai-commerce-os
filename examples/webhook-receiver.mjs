#!/usr/bin/env node
/**
 * Sample webhook receiver — demonstrates signature verification.
 *
 * Run locally:
 *   SHARE_FIRSTVIEW_WEBHOOK_SECRET=<same secret you configured> \
 *   PORT=8765 \
 *   node examples/webhook-receiver.mjs
 *
 * Then point AI Commerce OS at it:
 *   SHARE_FIRSTVIEW_WEBHOOK_URL=http://localhost:8765/webhook
 *   SHARE_FIRSTVIEW_WEBHOOK_SECRET=<same secret>
 *
 * Open a tracked share link → this server logs the verified payload.
 *
 * In production: replace this script with your own integration (Slack
 * incoming webhook, an internal HTTP endpoint, etc). Always verify the
 * signature before trusting the body — anyone can hit your webhook URL.
 */
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8765);
const SECRET = process.env.SHARE_FIRSTVIEW_WEBHOOK_SECRET ?? "";

if (!SECRET) {
  console.warn(
    "[receiver] SHARE_FIRSTVIEW_WEBHOOK_SECRET not set — accepting unsigned payloads. " +
      "Don't run like this in production.",
  );
}

function verifySignature(rawBody, header) {
  if (!header || !SECRET) return false;
  const m = /^sha256=([a-f0-9]+)$/i.exec(header.trim());
  if (!m) return false;
  const presented = Buffer.from(m[1], "hex");
  const expected = crypto.createHmac("sha256", SECRET).update(rawBody).digest();
  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(presented, expected);
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404).end();
    return;
  }
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const sig = req.headers["x-aicos-signature"];
    const verified = SECRET ? verifySignature(raw, sig) : true;
    if (!verified) {
      console.warn("[receiver] REJECTED — signature mismatch:", sig);
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      res.writeHead(400).end();
      return;
    }
    console.log("[receiver] verified payload:");
    console.log("  event:", payload.event);
    console.log("  pipelineId:", payload.pipelineId);
    console.log("  linkLabel:", payload.linkLabel);
    console.log("  scope:", payload.scope);
    console.log("  viewer:", JSON.stringify(payload.viewer));
    console.log("  ts:", payload.ts);
    console.log("");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true }));
  });
});

server.listen(PORT, () => {
  console.log(`[receiver] listening on http://localhost:${PORT}/webhook`);
  console.log(`[receiver] signature verification: ${SECRET ? "ENABLED" : "DISABLED (no secret)"}`);
});
