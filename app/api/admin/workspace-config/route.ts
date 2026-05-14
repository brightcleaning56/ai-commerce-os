import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import {
  getWorkspaceConfig,
  patchWorkspaceConfig,
  type AiAggressiveness,
  type AiTone,
  type ApprovalMode,
  type UnsubscribeMode,
} from "@/lib/workspaceConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET   /api/admin/workspace-config — read effective config (defaults
 *                                     fall through if admin hasn't
 *                                     completed onboarding yet)
 * PATCH /api/admin/workspace-config — partial update without re-running
 *                                     onboarding. Each field maps back
 *                                     to its (step, question) location
 *                                     in the onboarding answer map so
 *                                     re-reads see the change unchanged.
 *
 * Capability: system:write to mutate, system:read to view -- this is
 * workspace-level configuration.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "system:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const config = await getWorkspaceConfig();
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCapability(req, "system:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Parameters<typeof patchWorkspaceConfig>[0] = {};
  if (typeof body.aiTone === "string") {
    const allowed: AiTone[] = ["warm-friendly", "professional", "formal", "direct"];
    if (allowed.includes(body.aiTone as AiTone)) patch.aiTone = body.aiTone as AiTone;
  }
  if (typeof body.aiAggressiveness === "string") {
    const allowed: AiAggressiveness[] = ["conservative", "balanced", "aggressive"];
    if (allowed.includes(body.aiAggressiveness as AiAggressiveness)) {
      patch.aiAggressiveness = body.aiAggressiveness as AiAggressiveness;
    }
  }
  if (typeof body.approvalMode === "string") {
    const allowed: ApprovalMode[] = ["all", "first-touch", "high-stakes", "none"];
    if (allowed.includes(body.approvalMode as ApprovalMode)) {
      patch.approvalMode = body.approvalMode as ApprovalMode;
    }
  }
  if (typeof body.dailySendCap === "number" && body.dailySendCap >= 0) {
    patch.dailySendCap = Math.min(body.dailySendCap, 5000);
  }
  if (typeof body.approvalNotify === "boolean") patch.approvalNotify = body.approvalNotify;
  if (typeof body.unsubscribeMode === "string") {
    const allowed: UnsubscribeMode[] = ["auto", "channel-only"];
    if (allowed.includes(body.unsubscribeMode as UnsubscribeMode)) {
      patch.unsubscribeMode = body.unsubscribeMode as UnsubscribeMode;
    }
  }
  if (typeof body.gdprMode === "boolean") patch.gdprMode = body.gdprMode;
  if (typeof body.auditRetentionDays === "number" && body.auditRetentionDays >= 30) {
    patch.auditRetentionDays = Math.min(body.auditRetentionDays, 3650);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to patch" }, { status: 400 });
  }

  const updated = await patchWorkspaceConfig(patch);
  return NextResponse.json({ ok: true, config: updated });
}
