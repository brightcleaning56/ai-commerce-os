/**
 * Role-based capabilities for AI Commerce OS.
 *
 * Concept:
 *   - 10 roles. Owner is special (always has every capability, never
 *     editable). The other 9 are configurable by the workspace owner.
 *   - 12 resources × {read, write} = 24 capability strings.
 *   - Default state for every non-Owner role = ALL read, NO write
 *     ("read-only across everything"). Owner toggles writes on per
 *     role as needed.
 *   - "Suggested presets" let the owner one-click a sensible starting
 *     point per role (Sales gets leads+deals+outreach write, etc.)
 *     without us pretending the presets are mandatory.
 *
 * Token-side: lib/userToken.ts already embeds the user's Role in the
 * JWT-style payload. requireCapability() in lib/auth.ts looks up the
 * effective capabilities for the user's role via lib/rolePolicy.ts
 * and checks the requested capability against that set.
 *
 * Owner bypass: ADMIN_TOKEN holders never go through the role lookup
 * — they're the workspace owner and always have all 24 capabilities.
 * This is enforced in requireCapability().
 */

export const ROLES = [
  "Owner",
  "Admin",
  "Sales",
  "Operator",
  "Finance",
  "Marketing",
  "Support",
  "Analyst",
  "Developer",
  "Viewer",
] as const;
export type Role = (typeof ROLES)[number];

/**
 * The 9 non-Owner roles. Owner is excluded from configurable lists
 * because their permissions are constant (everything).
 */
export const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== "Owner") as Exclude<Role, "Owner">[];

/**
 * Atomic resources we gate. Keep this list flat — finer-grained
 * scopes (e.g. transactions:cancel) can be layered on later without
 * forcing every existing call site to migrate.
 */
export const RESOURCES = [
  "users",          // /admin/users (invite, cancel, issue tokens)
  "audit",          // /admin/audit
  "system",         // /admin/system-health, kill switch, env-level config
  "billing",        // /admin/billing
  "leads",          // /leads + /api/leads
  "deals",          // /pipeline + /deals + /quotes
  "outreach",       // outreach jobs, marketing automations
  "transactions",   // /transactions + /api/transactions
  "voice",          // /calls + voicemails + outbound dialer
  "earnings",       // /earnings + /escrow + finance reports
  "apikeys",        // /admin/api-keys + integrations + data sources
  "reports",        // /reports + /insights
] as const;
export type Resource = (typeof RESOURCES)[number];

export type Action = "read" | "write";
export type Capability = `${Resource}:${Action}`;

export const ALL_CAPABILITIES: Capability[] = RESOURCES.flatMap((r) => [
  `${r}:read` as Capability,
  `${r}:write` as Capability,
]);

/**
 * Default capabilities for a non-Owner role at workspace bootstrap.
 * Per the "Read-only across everything" rule: every resource:read is
 * granted, no writes. Owner toggles writes on individually.
 */
export const DEFAULT_NON_OWNER_CAPABILITIES: Capability[] = RESOURCES.map(
  (r) => `${r}:read` as Capability,
);

/**
 * Suggested presets per role — these are NOT the defaults (read-only is).
 * They're "Apply suggested" one-click starting points the owner can use
 * if they don't want to toggle from scratch. They reflect the role
 * descriptions Eric approved in the scope question.
 *
 * Owner is always all-capabilities and isn't listed here.
 */
export const SUGGESTED_PRESETS: Record<Exclude<Role, "Owner">, Capability[]> = {
  // Admin = user mgmt, system health, audit, kill switch. NOT billing
  // (that's Finance's call) and NOT direct integrations work (Developer).
  Admin: [
    "users:read", "users:write",
    "audit:read",
    "system:read", "system:write",
    "leads:read", "deals:read", "outreach:read",
    "transactions:read", "voice:read",
    "earnings:read", "billing:read",
    "apikeys:read", "reports:read",
  ],
  // Sales = leads, deals/pipeline, outreach, CRM (covered by leads/deals)
  Sales: [
    "users:read",
    "leads:read", "leads:write",
    "deals:read", "deals:write",
    "outreach:read", "outreach:write",
    "transactions:read",
    "voice:read", "voice:write",
    "reports:read",
  ],
  // Operator = transactions, voice/calls, tasks (no separate task cap —
  // tasks ride on whatever drives them; transactions+voice covers it)
  Operator: [
    "users:read",
    "transactions:read", "transactions:write",
    "voice:read", "voice:write",
    "leads:read",
    "deals:read",
    "reports:read",
  ],
  // Finance = billing, earnings, escrow, transactions read
  Finance: [
    "users:read",
    "billing:read", "billing:write",
    "earnings:read", "earnings:write",
    "transactions:read",
    "reports:read",
    "audit:read",
  ],
  // Marketing = outreach + automations + signals/demand (rides on
  // outreach + reports for now)
  Marketing: [
    "users:read",
    "outreach:read", "outreach:write",
    "leads:read",
    "reports:read",
  ],
  // Support = voice/calls, leads read, customer comms (no separate
  // comms cap — leads write covers comments)
  Support: [
    "users:read",
    "voice:read", "voice:write",
    "leads:read", "leads:write",
    "transactions:read",
  ],
  // Analyst = read-only across everything
  Analyst: [
    "users:read",
    "audit:read",
    "leads:read",
    "deals:read",
    "outreach:read",
    "transactions:read",
    "voice:read",
    "earnings:read",
    "reports:read",
    "system:read",
  ],
  // Developer = api keys, integrations, system health
  Developer: [
    "users:read",
    "system:read", "system:write",
    "apikeys:read", "apikeys:write",
    "audit:read",
    "reports:read",
  ],
  // Viewer = literally read everything, write nothing
  Viewer: [...DEFAULT_NON_OWNER_CAPABILITIES],
};

/**
 * Human-readable labels for the resources — what the UI shows on the
 * permissions matrix. Mirrors the row headers Eric will see in
 * /admin/users.
 */
export const RESOURCE_LABELS: Record<Resource, string> = {
  users: "Users & invites",
  audit: "Audit log",
  system: "System health & kill switch",
  billing: "Billing & subscriptions",
  leads: "Leads & CRM",
  deals: "Deals & pipeline",
  outreach: "Outreach & automations",
  transactions: "Transactions & escrow",
  voice: "Calls & voicemails",
  earnings: "Earnings",
  apikeys: "API keys & integrations",
  reports: "Reports & insights",
};

/**
 * Permission map shape persisted in the store (key: roles_permissions).
 * Owner is intentionally omitted — owner always has ALL_CAPABILITIES
 * regardless of what's stored.
 *
 * Empty map (no overrides) → every non-Owner role uses the defaults
 * (read-only). Once the owner saves changes, only the roles touched
 * appear in the map.
 */
export type RolePermissionOverrides = Partial<
  Record<Exclude<Role, "Owner">, Capability[]>
>;
