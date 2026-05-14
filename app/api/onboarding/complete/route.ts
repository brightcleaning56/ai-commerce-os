import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FLOWS, PERSONA_LANDING, PERSONA_TO_ROLE, type Persona } from "@/lib/onboarding";
import { onboardingSessions, type OnboardingSession } from "@/lib/onboardingState";
import {
  getBackend,
  store,
  type BusinessRecord,
  type BusinessSource,
} from "@/lib/store";
import { supplierRegistry } from "@/lib/supplierRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/complete — finalize the session.
 *
 * Slice 8: actually creates records per persona, not just status flip.
 *
 *   admin       writes a workspace-config blob so the workspace owner's
 *               choices (AI defaults, approval mode, compliance toggles,
 *               integrations preference) are persisted somewhere the
 *               app code can read. Slice 8.5 wires those configs into
 *               actual app behavior; for now they're recorded for audit.
 *   team        no record creation -- the invite-accept path already
 *               minted the per-user token. We just write the team
 *               preferences (workflows + AI agent access + approval
 *               limits + comms) onto a per-user-prefs blob keyed by
 *               session.email.
 *   buyer       upserts a BusinessRecord with source="onboarding_buyer"
 *               so the operator sees the buyer in /admin/businesses
 *               immediately. Email-matched dedupe prevents duplicate
 *               records on retry.
 *   supplier    creates a SupplierRecord (status="pending"). Operator
 *               reviews on /admin/suppliers + flips to active +
 *               issues a portal token, just like the existing
 *               /portal/signup path.
 *   distributor creates a SupplierRecord with kind="Distributor". We
 *               don't have a separate distributor store today; using
 *               the supplier registry with a kind discriminator avoids
 *               new infrastructure for slice 8.
 *
 * Returns: { ok, landingHref, role, session, missing? }
 *   - missing[] populated if required questions are still empty
 *     (gates client from "Complete")
 */

const WORKSPACE_CONFIG_FILE = "workspace-config.json";
const TEAM_PREFS_FILE = "team-prefs.json";

type WorkspaceConfig = {
  id: string;             // workspace id; for now there's only one ("primary")
  ownerEmail?: string;
  companyName?: string;
  answers: Record<string, Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
};

type TeamPref = {
  email: string;
  answers: Record<string, Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
};

function readSessionId(req: NextRequest): string | null {
  return req.cookies.get("avyn_onboarding")?.value ?? null;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asAddress(v: unknown): { city?: string; state?: string; zip?: string; country?: string } | null {
  if (!v || typeof v !== "object") return null;
  const a = v as { city?: string; state?: string; zip?: string; country?: string };
  return a;
}

// ─── Per-persona finalizers ─────────────────────────────────────────

async function completeAdmin(session: OnboardingSession): Promise<{ ownerEmail?: string }> {
  const ownerEmail = asString(session.answers.identity?.email) ?? session.email;
  const companyName = asString(session.answers.company?.companyName);
  const config: WorkspaceConfig = {
    id: "primary",
    ownerEmail,
    companyName,
    answers: session.answers,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sessionId: session.id,
  };
  // Single-tenant for now -- last write wins, but we keep the most recent
  // config so the operator's most recent setup answers are queryable.
  const existing = await getBackend().read<WorkspaceConfig[]>(WORKSPACE_CONFIG_FILE, []);
  const filtered = existing.filter((c) => c.id !== "primary");
  await getBackend().write(WORKSPACE_CONFIG_FILE, [config, ...filtered]);
  return { ownerEmail };
}

async function completeTeam(session: OnboardingSession): Promise<void> {
  // Team users come from /invite -- the per-user token is already minted.
  // We just persist their preferences keyed by their email so the app
  // can read department/agents/limits when they sign in.
  const email = asString(session.answers.identity?.email)?.toLowerCase().trim() ?? session.email;
  if (!email) return;
  const pref: TeamPref = {
    email,
    answers: session.answers,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sessionId: session.id,
  };
  const existing = await getBackend().read<TeamPref[]>(TEAM_PREFS_FILE, []);
  const filtered = existing.filter((p) => p.email !== email);
  await getBackend().write(TEAM_PREFS_FILE, [pref, ...filtered]);
}

async function completeBuyer(session: OnboardingSession): Promise<{ businessId: string }> {
  const a = session.answers;
  const email = asString(a.company?.email)?.toLowerCase().trim() ?? session.email ?? "";
  const name = asString(a.company?.companyName) ?? "Untitled buyer";
  const addr = asAddress(a.regions?.deliveryAddress);

  // Dedupe by email
  const existing = email ? await store.getBusinessByEmail(email) : null;
  if (existing) {
    await store.updateBusiness(existing.id, {
      name,
      contactName: asString(a.company?.fullName),
      contactTitle: asString(a.company?.title),
      phone: asString(a.company?.phone),
      website: asString(a.company?.website),
      city: addr?.city,
      state: addr?.state,
      zip: addr?.zip,
      country: addr?.country ?? existing.country,
      industry: Array.isArray(a.needs?.industries) ? (a.needs!.industries as string[]).join(", ") : undefined,
      tags: ["buyer", `volume:${asString(a.volume?.monthlyVolume) ?? "unknown"}`],
      notes: asString(a.needs?.topProductsNotes),
      source: "onboarding_buyer" as BusinessSource,
      status: "active",
    });
    return { businessId: existing.id };
  }

  const biz: BusinessRecord = {
    id: `biz_${crypto.randomBytes(8).toString("hex")}`,
    name,
    email,
    contactName: asString(a.company?.fullName),
    contactTitle: asString(a.company?.title),
    phone: asString(a.company?.phone),
    website: asString(a.company?.website),
    city: addr?.city,
    state: addr?.state,
    zip: addr?.zip,
    country: (addr?.country ?? "US").toUpperCase().slice(0, 2),
    industry: Array.isArray(a.needs?.industries) ? (a.needs!.industries as string[]).join(", ") : undefined,
    tags: ["buyer", `volume:${asString(a.volume?.monthlyVolume) ?? "unknown"}`],
    notes: asString(a.needs?.topProductsNotes),
    status: "active",
    source: "onboarding_buyer",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.addBusiness(biz);
  return { businessId: biz.id };
}

async function completeSupplierLike(
  session: OnboardingSession,
  forceKind?: "Distributor",
): Promise<{ supplierId: string }> {
  const a = session.answers;
  const legalName = asString(a.identity?.legalName) ?? "Untitled supplier";
  const email = asString(a.identity?.email)?.toLowerCase().trim() ?? session.email ?? "";
  const declaredKind = asString(a.identity?.kind);
  const kind = (forceKind || declaredKind || "Manufacturer") as
    | "Manufacturer"
    | "Wholesaler"
    | "Distributor"
    | "Dropship"
    | "Trader";
  const addr =
    asAddress(a.distribution?.primaryWarehouse) ??
    asAddress(a.warehouses?.primaryWarehouse);

  // Categories: industries (supplier flow) or freightModes (distributor)
  const cats: string[] = Array.isArray(a.industries?.industries)
    ? (a.industries!.industries as string[])
    : Array.isArray(a.freight?.freightModes)
      ? (a.freight!.freightModes as string[])
      : [];

  const created = await supplierRegistry.create({
    legalName,
    dbaName: asString(a.identity?.tradeName),
    email,
    phone: asString(a.identity?.phone),
    website: asString(a.identity?.website),
    kind,
    country: (addr?.country ?? "US").toUpperCase().slice(0, 2),
    state: addr?.state,
    city: addr?.city,
    categories: cats.slice(0, 20),
    status: "pending",
  } as Parameters<typeof supplierRegistry.create>[0]);

  return { supplierId: created.id };
}

// ─── Handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const id = readSessionId(req);
  if (!id) return NextResponse.json({ error: "No onboarding session" }, { status: 404 });
  const session = await onboardingSessions.get(id);
  if (!session) return NextResponse.json({ error: "Session expired or not found" }, { status: 404 });
  if (!session.persona) {
    return NextResponse.json({ error: "Persona not chosen yet" }, { status: 400 });
  }
  if (session.status === "completed") {
    return NextResponse.json({
      ok: true,
      alreadyCompleted: true,
      landingHref: PERSONA_LANDING[session.persona],
      session,
    });
  }

  // Validate every step's required answers are present (skipping
  // steps gated out by showIf).
  const flow = FLOWS[session.persona];
  const missing: string[] = [];
  for (const step of flow.steps) {
    // Skip showIf-gated steps that don't match
    if (step.showIf) {
      const bucket = step.showIf.stepId
        ? (session.answers[step.showIf.stepId] ?? {})
        : Object.values(session.answers).reduce(
            (acc, b) => ({ ...acc, ...(b as Record<string, unknown>) }),
            {} as Record<string, unknown>,
          );
      const v = bucket[step.showIf.questionId];
      if (step.showIf.equals !== undefined && v !== step.showIf.equals) continue;
      if (step.showIf.includes !== undefined) {
        const includes = Array.isArray(v) && v.includes(step.showIf.includes);
        if (!includes) continue;
      }
    }
    const answers = session.answers[step.id] ?? {};
    for (const q of step.questions) {
      if (!q.required) continue;
      // Email-verify required => session.emailVerified must be true
      if (q.type === "email-verify") {
        if (!session.emailVerified) {
          missing.push(`${step.id}.${q.id} (email not verified)`);
        }
        continue;
      }
      const v = answers[q.id];
      if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
        missing.push(`${step.id}.${q.id}`);
      }
    }
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Required questions still empty", missing },
      { status: 422 },
    );
  }

  // Per-persona finalize
  const persona: Persona = session.persona;
  let result: Record<string, unknown> = {};
  try {
    if (persona === "admin") {
      result = await completeAdmin(session);
    } else if (persona === "team") {
      await completeTeam(session);
    } else if (persona === "buyer") {
      result = await completeBuyer(session);
    } else if (persona === "supplier") {
      result = await completeSupplierLike(session);
    } else if (persona === "distributor") {
      result = await completeSupplierLike(session, "Distributor");
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Finalize failed: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 500 },
    );
  }

  const role = PERSONA_TO_ROLE[persona];
  const updated = await onboardingSessions.complete(id, {
    role,
    userId: typeof result.businessId === "string"
      ? result.businessId
      : typeof result.supplierId === "string"
        ? result.supplierId
        : undefined,
  });

  return NextResponse.json({
    ok: true,
    landingHref: PERSONA_LANDING[persona],
    role,
    result,
    session: updated,
  });
}
