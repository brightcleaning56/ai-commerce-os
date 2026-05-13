import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  ALL_CAPABILITIES,
  ASSIGNABLE_ROLES,
  DEFAULT_NON_OWNER_CAPABILITIES,
  RESOURCES,
  RESOURCE_LABELS,
  ROLES,
  SUGGESTED_PRESETS,
  type Capability,
  type Role,
  type RolePermissionOverrides,
} from "@/lib/capabilities";
import {
  getRolePermissionOverrides,
  saveRolePermissionOverrides,
} from "@/lib/rolePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/role-permissions
 *
 * Returns everything the /admin/users matrix UI needs to render in one
 * shot:
 *   - The catalog of capabilities + resources + role list
 *   - The current persisted overrides (only roles that have been edited)
 *   - The effective capabilities per role (defaults layered if no
 *     override exists)
 *   - The suggested presets per role (so "Apply suggested" is a
 *     one-click action without re-fetching)
 *
 * Open to anyone authenticated — invitees should be able to see what
 * their role can do. Mutating requires Owner (PUT below).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const overrides = await getRolePermissionOverrides();

  // Build the "effective" map. Owner is always all. Others: override if
  // present, else read-only default.
  const effective: Record<Role, Capability[]> = {} as Record<Role, Capability[]>;
  effective.Owner = [...ALL_CAPABILITIES];
  for (const r of ASSIGNABLE_ROLES) {
    effective[r] = overrides[r] ?? [...DEFAULT_NON_OWNER_CAPABILITIES];
  }

  return NextResponse.json({
    roles: ROLES,
    assignableRoles: ASSIGNABLE_ROLES,
    resources: RESOURCES,
    resourceLabels: RESOURCE_LABELS,
    capabilities: ALL_CAPABILITIES,
    defaultNonOwnerCapabilities: DEFAULT_NON_OWNER_CAPABILITIES,
    suggestedPresets: SUGGESTED_PRESETS,
    overrides,
    effective,
  });
}

/**
 * PUT /api/admin/role-permissions
 *
 * Replace the persisted overrides wholesale. Owner-only — we reject
 * per-user-token callers because letting them edit their own role's
 * capabilities is privilege escalation.
 *
 * Body: { overrides: Partial<Record<NonOwnerRole, Capability[]>> }
 * Unknown roles / capabilities are silently dropped (validated in
 * saveRolePermissionOverrides).
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Owner-only mutation. auth.user is set only for per-user tokens.
  if (auth.mode === "production" && auth.user) {
    return NextResponse.json(
      {
        error:
          "Only the workspace owner (signed in with ADMIN_TOKEN) can edit role permissions. Letting roles edit their own capabilities would be privilege escalation.",
      },
      { status: 403 },
    );
  }

  let body: { overrides?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.overrides || typeof body.overrides !== "object" || Array.isArray(body.overrides)) {
    return NextResponse.json(
      { error: "Body must be { overrides: { <Role>: Capability[] } }" },
      { status: 400 },
    );
  }

  await saveRolePermissionOverrides(body.overrides as RolePermissionOverrides);

  const next = await getRolePermissionOverrides();
  return NextResponse.json({ ok: true, overrides: next });
}
