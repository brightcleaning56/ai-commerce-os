import { NextResponse } from "next/server";
import { getOperator } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator profile — returned to client components that need to display
 * the workspace owner (sidebar footer, settings, etc).
 *
 * No auth gate — operator name + email are not secrets (they appear in
 * outgoing emails anyway). Phone is optional and also non-secret.
 */
export async function GET() {
  const op = getOperator();
  return NextResponse.json({
    name: op.name,
    email: op.email,
    company: op.company,
    title: op.title,
    initials: op.initials,
    phone: op.phone ?? null,
  });
}
