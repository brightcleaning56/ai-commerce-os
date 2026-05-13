import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/postmark-status â€” live snapshot of the operator's
 * Postmark account so we can answer "is email actually working" without
 * making the operator dig through the Postmark dashboard.
 *
 * Hits three Postmark APIs server-side using POSTMARK_TOKEN:
 *   1. GET /server          server config + name + approval color
 *   2. GET /stats/outbound  send count today
 *   3. GET /messages/outbound?count=10  last 10 messages with status
 *   4. GET /bounces?count=5 last 5 bounces (delivery failures)
 *
 * Returns a normalized payload the /admin/system-health UI renders as a
 * panel. Auto-detects common issues:
 *   - "pending review" approval state -> only verified senders can receive
 *   - Last 10 messages have failures -> domain DNS / suppression issues
 *   - Bounce rate > 5% -> deliverability problem
 *
 * NEVER returns the Postmark token itself, only derived state.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const token = process.env.POSTMARK_TOKEN;
  if (!token) {
    return NextResponse.json({
      configured: false,
      error: "POSTMARK_TOKEN not set in env",
      fixHint:
        "Set POSTMARK_TOKEN in Netlify env vars. Get the token from Postmark Console > Servers > <your-server> > API Tokens.",
    });
  }

  const headers = {
    Accept: "application/json",
    "X-Postmark-Server-Token": token,
  };

  // Run the four requests in parallel â€” they're independent.
  const [serverRes, statsRes, messagesRes, bouncesRes] = await Promise.allSettled([
    fetch("https://api.postmarkapp.com/server", { headers, cache: "no-store" }),
    fetch("https://api.postmarkapp.com/stats/outbound", { headers, cache: "no-store" }),
    fetch("https://api.postmarkapp.com/messages/outbound?count=10&offset=0", { headers, cache: "no-store" }),
    fetch("https://api.postmarkapp.com/bounces?count=5&offset=0", { headers, cache: "no-store" }),
  ]);

  // Parse server config (most important â€” tells us approval state)
  let server: ServerInfo | null = null;
  let serverError: string | null = null;
  if (serverRes.status === "fulfilled") {
    if (serverRes.value.ok) {
      const j = (await serverRes.value.json()) as PostmarkServer;
      server = {
        id: j.ID,
        name: j.Name,
        color: j.Color,
        // Postmark uses "ApprovalState" â€” approved accounts return "Approved",
        // new accounts return "Pending" (can only send to verified senders).
        approvalState: j.ApprovalState ?? "Approved",
        smtpApiActivated: j.SmtpApiActivated ?? false,
        deliveryType: j.DeliveryType ?? "Live",
        bounceHookUrl: j.BounceHookUrl ?? null,
        inboundHookUrl: j.InboundHookUrl ?? null,
      };
    } else {
      serverError = `Postmark API ${serverRes.value.status}: ${await serverRes.value.text().catch(() => "")}`;
    }
  } else {
    serverError = `Network error: ${String(serverRes.reason).slice(0, 200)}`;
  }

  // Today's outbound stats
  let stats: StatsInfo | null = null;
  if (statsRes.status === "fulfilled" && statsRes.value.ok) {
    const j = (await statsRes.value.json()) as PostmarkStats;
    stats = {
      sent: j.Sent ?? 0,
      bounced: j.Bounced ?? 0,
      spamComplaints: j.SpamComplaints ?? 0,
      tracked: j.Tracked ?? 0,
      bounceRate:
        (j.Sent ?? 0) === 0 ? 0 : Math.round(((j.Bounced ?? 0) / (j.Sent ?? 1)) * 1000) / 10,
    };
  }

  // Recent message log
  let recentMessages: MessageInfo[] = [];
  if (messagesRes.status === "fulfilled" && messagesRes.value.ok) {
    const j = (await messagesRes.value.json()) as { Messages: PostmarkMessage[] };
    recentMessages = (j.Messages ?? []).map((m) => ({
      messageId: m.MessageID,
      to: m.Recipients?.[0] ?? "(unknown)",
      subject: m.Subject ?? "",
      status: m.Status ?? "unknown",
      receivedAt: m.ReceivedAt ?? "",
    }));
  }

  // Recent bounces
  let recentBounces: BounceInfo[] = [];
  if (bouncesRes.status === "fulfilled" && bouncesRes.value.ok) {
    const j = (await bouncesRes.value.json()) as { Bounces: PostmarkBounce[] };
    recentBounces = (j.Bounces ?? []).map((b) => ({
      id: b.ID,
      email: b.Email ?? "",
      type: b.Type ?? "",
      typeCode: b.TypeCode ?? 0,
      description: b.Description ?? "",
      bouncedAt: b.BouncedAt ?? "",
    }));
  }

  // Auto-detect headline issues for the UI
  const issues: string[] = [];
  if (server?.approvalState === "Pending") {
    issues.push(
      "Account in PENDING APPROVAL â€” Postmark will only deliver to addresses you've verified as senders. Submit your account for approval in Postmark dashboard.",
    );
  }
  if (server?.deliveryType !== "Live") {
    issues.push(
      `Server delivery type is "${server?.deliveryType}" â€” flip to Live in Postmark dashboard for real delivery.`,
    );
  }
  if (stats && stats.bounceRate > 5) {
    issues.push(
      `Bounce rate today: ${stats.bounceRate}% (Postmark alerts at 5%). Check the bounces below.`,
    );
  }
  if (recentMessages.length > 0 && recentMessages.every((m) => m.status !== "Sent" && m.status !== "Opened" && m.status !== "Delivered")) {
    issues.push(
      "Last 10 sends all failed to deliver. Most common: sender domain not verified in Postmark, or account is in pending approval.",
    );
  }

  return NextResponse.json({
    configured: true,
    server,
    serverError,
    stats,
    recentMessages,
    recentBounces,
    issues,
    checkedAt: new Date().toISOString(),
  });
}

// â”€â”€â”€ Postmark API response types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PostmarkServer = {
  ID: number;
  Name: string;
  Color: string;
  ApprovalState?: string;       // "Approved" | "Pending"
  SmtpApiActivated?: boolean;
  DeliveryType?: string;        // "Live" | "Sandbox"
  BounceHookUrl?: string;
  InboundHookUrl?: string;
};

type PostmarkStats = {
  Sent?: number;
  Bounced?: number;
  SpamComplaints?: number;
  Tracked?: number;
};

type PostmarkMessage = {
  MessageID: string;
  Recipients?: string[];
  Subject?: string;
  Status?: string;
  ReceivedAt?: string;
};

type PostmarkBounce = {
  ID: number;
  Email?: string;
  Type?: string;
  TypeCode?: number;
  Description?: string;
  BouncedAt?: string;
};

// â”€â”€â”€ Normalized response types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ServerInfo = {
  id: number;
  name: string;
  color: string;
  approvalState: string;
  smtpApiActivated: boolean;
  deliveryType: string;
  bounceHookUrl: string | null;
  inboundHookUrl: string | null;
};

type StatsInfo = {
  sent: number;
  bounced: number;
  spamComplaints: number;
  tracked: number;
  bounceRate: number;
};

type MessageInfo = {
  messageId: string;
  to: string;
  subject: string;
  status: string;
  receivedAt: string;
};

type BounceInfo = {
  id: number;
  email: string;
  type: string;
  typeCode: number;
  description: string;
  bouncedAt: string;
};
