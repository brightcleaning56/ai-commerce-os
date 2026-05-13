import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ALL_CAPABILITIES, ROLES, type Capability, type Role } from "@/lib/capabilities";
import { resolveCapabilities } from "@/lib/rolePolicy";
import { getOperator } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — return the current session's identity + effective
 * capabilities so the client (sidebar, TopBar, page guards) can render
 * a UI that matches what the server will actually allow.
 *
 * Returns:
 *   - role: "Owner" (signed in via ADMIN_TOKEN) or the role on the
 *     user's HMAC-signed invite token
 *   - capabilities: the full effective set (Owner = every capability;
 *     others = override-or-default from /admin/users matrix)
 *   - email: for non-Owner, the email from the token payload; for
 *     Owner, the OPERATOR_EMAIL env value
 *   - name: same source. For Owner the OPERATOR_NAME; for users we
 *     don't have a name in the token, so we return null (UI can show
 *     the email instead)
 *
 * Not capability-gated — every authenticated session needs to be able
 * to learn what it can do. Unauthenticated callers get 401 from
 * requireAdmin.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const op = getOperator();

  // Dev mode → behave as Owner with full caps for UI purposes.
  if (auth.mode === "dev") {
    return NextResponse.json({
      role: "Owner" as Role,
      email: op.email,
      name: op.name,
      capabilities: ALL_CAPABILITIES,
      isOwner: true,
      isDev: true,
    });
  }

  // Owner path: ADMIN_TOKEN match has no auth.user.
  if (!auth.user) {
    return NextResponse.json({
      role: "Owner" as Role,
      email: op.email,
      name: op.name,
      capabilities: ALL_CAPABILITIES,
      isOwner: true,
      isDev: false,
    });
  }

  // Per-user token: resolve their role's capabilities from the store.
  const rawRole = auth.user.role;
  if (!(ROLES as readonly string[]).includes(rawRole)) {
    return NextResponse.json(
      {
        error: `Unknown role "${rawRole}" — token may be stale. Owner should re-issue it from /admin/users.`,
      },
      { status: 403 },
    );
  }
  const role = rawRole as Role;
  const caps = await resolveCapabilities(role);

  return NextResponse.json({
    role,
    email: auth.user.email,
    name: null,
    capabilities: Array.from(caps) as Capability[],
    isOwner: false,
    isDev: false,
  });
}
