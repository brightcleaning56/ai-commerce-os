import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { tasksStore, type TaskCallOutcome } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tasks — list all server-side tasks.
 *   Capability: leads:read (tasks are buyer-attached follow-ups).
 *
 * POST /api/tasks — upsert a task by id (client provides id; idempotent).
 *   Capability: leads:write.
 *   Body: { id, buyerId, buyerCompany, buyerName, buyerPhone?, buyerEmail?,
 *           type: "phone" | "sequence", done?, attempts?, createdAt? }
 *   createdBy is taken from the auth context, not the body.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const tasks = await tasksStore.list();
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Required fields. We let the client provide an id (matches the
  // localStorage pattern so dual-writes converge on the same record).
  const id = typeof body.id === "string" ? body.id.trim().slice(0, 80) : "";
  const buyerId = typeof body.buyerId === "string" ? body.buyerId.trim().slice(0, 80) : "";
  const buyerCompany = typeof body.buyerCompany === "string" ? body.buyerCompany.trim().slice(0, 200) : "";
  const buyerName = typeof body.buyerName === "string" ? body.buyerName.trim().slice(0, 200) : "";
  const typeRaw = typeof body.type === "string" ? body.type : "";
  if (!id || !buyerId || !buyerCompany || !buyerName) {
    return NextResponse.json(
      { error: "id, buyerId, buyerCompany, buyerName are required" },
      { status: 400 },
    );
  }
  const type: "phone" | "sequence" = typeRaw === "sequence" ? "sequence" : "phone";

  const op = getOperator();
  const isOwner = auth.mode === "production" ? !auth.user : true;
  const createdBy = isOwner ? op.email : (auth.user?.email ?? "unknown");

  const str = (k: string, max = 200) => {
    const v = body[k];
    return typeof v === "string" ? v.trim().slice(0, max) || undefined : undefined;
  };

  // Attempts are best-effort: validate as array of TaskAttempt shape
  // (loose) and pass through. Anything malformed gets filtered.
  const attempts = Array.isArray(body.attempts)
    ? (body.attempts as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({
          at: typeof a.at === "string" ? a.at : new Date().toISOString(),
          durationSec: typeof a.durationSec === "number" ? Math.round(a.durationSec) : undefined,
          outcome: typeof a.outcome === "string" ? (a.outcome as TaskCallOutcome) : "no-answer",
          notes: typeof a.notes === "string" ? a.notes.slice(0, 2000) : undefined,
          callbackAt: typeof a.callbackAt === "string" ? a.callbackAt : undefined,
          callSid: typeof a.callSid === "string" ? a.callSid : undefined,
        }))
    : undefined;

  const task = await tasksStore.upsert({
    id,
    buyerId,
    buyerCompany,
    buyerName,
    buyerPhone: str("buyerPhone", 40),
    buyerEmail: str("buyerEmail"),
    type,
    done: body.done === true,
    attempts,
    createdAt: str("createdAt") ?? new Date().toISOString(),
    createdBy,
  });
  return NextResponse.json({ ok: true, task });
}
