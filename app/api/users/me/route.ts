import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { defaultInitialsFor, userProfiles } from "@/lib/userProfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/users/me — return the editable profile for the current
 * non-Owner session. Owner sessions get 200 with profile=null since
 * the owner identity comes from OPERATOR_* env vars (read-only).
 *
 * PATCH /api/users/me — upsert the current session's profile. Body
 * accepts displayName, phone, initials, avatarColor. All optional;
 * passing "" clears the field. Email + role are NEVER editable here
 * (they come from the HMAC token). Owner sessions get 403 — they
 * use OPERATOR_* env vars, not this store.
 *
 * Auth: requireAdmin (which now accepts both ADMIN_TOKEN and
 * per-user invite tokens). We branch on auth.user to detect non-owner.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (!auth.user) {
    // Owner / dev mode — no profile to read; tell the client to use
    // /api/operator instead.
    return NextResponse.json({ profile: null, isOwner: true });
  }

  const profile = await userProfiles.get(auth.user.sub);
  return NextResponse.json({
    profile,
    isOwner: false,
    sub: auth.user.sub,
    email: auth.user.email,
    role: auth.user.role,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (!auth.user) {
    return NextResponse.json(
      {
        error:
          "Owner profile is read-only here — set OPERATOR_NAME/OPERATOR_EMAIL/OPERATOR_TITLE env vars instead.",
      },
      { status: 403 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Whitelist editable fields. Email + role are never accepted from
  // the body — those come from the signed token and are immutable
  // from this surface.
  const patch: Parameters<typeof userProfiles.upsert>[2] = {};
  if (typeof body.displayName === "string") patch.displayName = body.displayName;
  if (typeof body.phone === "string") patch.phone = body.phone;
  if (typeof body.initials === "string") patch.initials = body.initials;
  if (typeof body.avatarColor === "string") patch.avatarColor = body.avatarColor;

  const profile = await userProfiles.upsert(auth.user.sub, auth.user.email, patch);

  // Default the initials when the client didn't send one — so the UI
  // doesn't show "?" forever for users who only set displayName.
  const initials = profile.initials || defaultInitialsFor(profile);

  return NextResponse.json({
    ok: true,
    profile: { ...profile, initials },
  });
}
