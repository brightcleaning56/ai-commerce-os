import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supplierRegistry } from "@/lib/supplierRegistry";
import { mintSupplierToken } from "@/lib/userToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/suppliers/[id]/portal-token
 *
 * Mint a /portal-scoped HMAC-signed sign-in token for a supplier. The
 * supplier pastes this token at /signin (or follows a magic link
 * constructed from the returned signinUrl) and lands on /portal scoped
 * to their own data only.
 *
 * Owner-only (rejects per-user-token holders even if they have
 * leads:write — minting tokens for external users is privilege
 * escalation that staff shouldn't get without ADMIN_TOKEN). Optional
 * body { email? } overrides which contact email is embedded in the
 * token payload; defaults to the supplier's registered email.
 *
 * Returns the raw token + signinUrl ONCE. We never store the token
 * server-side beyond the HMAC payload; if the supplier loses it the
 * owner mints a new one (the old one stays valid until exp; rotate
 * ADMIN_TOKEN if mass-revoke is required).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Only the workspace owner can issue supplier portal tokens.
  if (auth.mode === "production" && auth.user) {
    return NextResponse.json(
      {
        error:
          "Only the workspace owner (signed in with ADMIN_TOKEN) can issue supplier portal tokens.",
      },
      { status: 403 },
    );
  }

  const { id } = await params;
  const supplier = await supplierRegistry.get(id);
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — we fall back to the registered email.
  }
  const emailOverride = typeof body.email === "string" ? body.email.trim() : "";
  const email = emailOverride || supplier.email;

  let token = "";
  try {
    token = await mintSupplierToken({ supplierId: supplier.id, email });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mint failed" },
      { status: 500 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com";
  // Magic-link variant — pre-fills the token so the supplier just
  // clicks once instead of pasting. Token still in the URL (plain
  // text), so prefer the manual paste flow when the link will land
  // somewhere it might get logged (forwarded email, etc.).
  const magicLink = `${origin}/signin?t=${encodeURIComponent(token)}&next=${encodeURIComponent("/portal")}`;
  return NextResponse.json({
    ok: true,
    token,
    magicLink,
    signinUrl: `${origin}/signin`,
    portalUrl: `${origin}/portal`,
    email,
    supplierId: supplier.id,
    issuedAt: new Date().toISOString(),
  });
}
