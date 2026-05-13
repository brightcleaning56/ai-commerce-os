/**
 * Role policy — persisted capability map for non-Owner roles.
 *
 * Reads from / writes to a single JSON key (roles-permissions.json)
 * via the same StoreBackend the rest of the app uses. NOT edge-safe:
 * imports lib/store.ts which pulls node:fs / @netlify/blobs. Only call
 * from Node route handlers, never from middleware.
 *
 * Resolution order at read time:
 *   1. If the role has an override in the persisted map, use it.
 *   2. Otherwise fall back to DEFAULT_NON_OWNER_CAPABILITIES from
 *      capabilities.ts (all reads granted, no writes).
 *
 * The Owner role never enters this module — it always has every
 * capability and that's enforced in requireCapability(), not here.
 */
import { getBackend } from "./store";
import {
  ALL_CAPABILITIES,
  ASSIGNABLE_ROLES,
  DEFAULT_NON_OWNER_CAPABILITIES,
  type Capability,
  type Role,
  type RolePermissionOverrides,
} from "./capabilities";

const ROLE_PERMISSIONS_FILE = "roles-permissions.json";

/**
 * Read the persisted overrides. Returns an empty object if nothing has
 * been saved yet — callers should layer defaults on top via
 * resolveCapabilities() rather than treating an empty map as "no access".
 */
export async function getRolePermissionOverrides(): Promise<RolePermissionOverrides> {
  const raw = await getBackend().read<RolePermissionOverrides>(
    ROLE_PERMISSIONS_FILE,
    {},
  );
  // Defensive: filter to known capabilities only, drop unknown role keys.
  // Safeguards against stale data left over from earlier schema versions.
  const cleaned: RolePermissionOverrides = {};
  const validCaps = new Set<Capability>(ALL_CAPABILITIES);
  for (const r of ASSIGNABLE_ROLES) {
    const caps = (raw as Record<string, unknown>)[r];
    if (Array.isArray(caps)) {
      const safe = caps.filter((c): c is Capability =>
        typeof c === "string" && validCaps.has(c as Capability),
      );
      cleaned[r] = safe;
    }
  }
  return cleaned;
}

/**
 * Replace the persisted overrides wholesale. Validates keys + values.
 * Owner is silently dropped if included.
 */
export async function saveRolePermissionOverrides(
  next: RolePermissionOverrides,
): Promise<void> {
  const safe: RolePermissionOverrides = {};
  const validCaps = new Set<Capability>(ALL_CAPABILITIES);
  for (const r of ASSIGNABLE_ROLES) {
    const caps = next[r];
    if (Array.isArray(caps)) {
      safe[r] = caps.filter((c) => validCaps.has(c));
    }
  }
  await getBackend().write(ROLE_PERMISSIONS_FILE, safe);
}

/**
 * Effective capabilities for a role. Owner → all 24.
 * Otherwise: override if present, else the read-only default.
 */
export async function resolveCapabilities(role: Role): Promise<Set<Capability>> {
  if (role === "Owner") return new Set(ALL_CAPABILITIES);
  const map = await getRolePermissionOverrides();
  const list = map[role] ?? DEFAULT_NON_OWNER_CAPABILITIES;
  return new Set(list);
}

/**
 * Sync helper used in route handlers that already have the overrides
 * map in hand (e.g. when answering GET /api/admin/role-permissions).
 * Avoids re-reading the store per-role.
 */
export function resolveCapabilitiesSync(
  role: Role,
  overrides: RolePermissionOverrides,
): Set<Capability> {
  if (role === "Owner") return new Set(ALL_CAPABILITIES);
  const list = overrides[role] ?? DEFAULT_NON_OWNER_CAPABILITIES;
  return new Set(list);
}
