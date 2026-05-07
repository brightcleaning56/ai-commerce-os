export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: ("read:products" | "read:buyers" | "read:suppliers" | "write:outreach" | "read:insights")[];
  createdAt: string;
  lastUsed: string;
  rateLimit: number;
  used24h: number;
  status: "Active" | "Revoked";
  environment: "Production" | "Test";
};

export const API_KEYS: ApiKey[] = [
  {
    id: "k1",
    name: "Production – Main",
    prefix: "sk_live_4f29",
    scopes: ["read:products", "read:buyers", "write:outreach", "read:insights"],
    createdAt: "Jan 18, 2024",
    lastUsed: "12 min ago",
    rateLimit: 100_000,
    used24h: 38_412,
    status: "Active",
    environment: "Production",
  },
  {
    id: "k2",
    name: "Trend feed → internal Slack bot",
    prefix: "sk_live_b811",
    scopes: ["read:products", "read:insights"],
    createdAt: "Mar 04, 2024",
    lastUsed: "2h ago",
    rateLimit: 25_000,
    used24h: 8_240,
    status: "Active",
    environment: "Production",
  },
  {
    id: "k3",
    name: "Test sandbox",
    prefix: "sk_test_aa72",
    scopes: ["read:products", "read:buyers", "read:suppliers"],
    createdAt: "Apr 22, 2024",
    lastUsed: "Yesterday",
    rateLimit: 10_000,
    used24h: 412,
    status: "Active",
    environment: "Test",
  },
  {
    id: "k4",
    name: "Old data scraper",
    prefix: "sk_live_19ee",
    scopes: ["read:products"],
    createdAt: "Nov 02, 2023",
    lastUsed: "3 weeks ago",
    rateLimit: 50_000,
    used24h: 0,
    status: "Revoked",
    environment: "Production",
  },
];

export type Endpoint = {
  method: "GET" | "POST";
  path: string;
  description: string;
  scope: string;
  example: string;
};

export const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/v1/products/trending",
    description: "Returns products ranked by demand score with optional category filter.",
    scope: "read:products",
    example: `curl https://api.aicommerce.os/v1/products/trending?category=Pet+Supplies \\\n  -H "Authorization: Bearer sk_live_..."`,
  },
  {
    method: "GET",
    path: "/v1/products/{id}/demand",
    description: "Full demand breakdown: search volume, social, competition, saturation.",
    scope: "read:products",
    example: `curl https://api.aicommerce.os/v1/products/p1/demand \\\n  -H "Authorization: Bearer sk_live_..."`,
  },
  {
    method: "GET",
    path: "/v1/buyers/discover",
    description: "Find buyers with intent score > X for a product/category.",
    scope: "read:buyers",
    example: `curl "https://api.aicommerce.os/v1/buyers/discover?industry=Pet+Supplies&min_intent=80" \\\n  -H "Authorization: Bearer sk_live_..."`,
  },
  {
    method: "GET",
    path: "/v1/suppliers/{id}",
    description: "Full supplier profile, including verification + risk flags.",
    scope: "read:suppliers",
    example: `curl https://api.aicommerce.os/v1/suppliers/s1 \\\n  -H "Authorization: Bearer sk_live_..."`,
  },
  {
    method: "POST",
    path: "/v1/outreach/sequences",
    description: "Create a new AI-personalized outreach sequence for a buyer list.",
    scope: "write:outreach",
    example: `curl -X POST https://api.aicommerce.os/v1/outreach/sequences \\\n  -H "Authorization: Bearer sk_live_..." \\\n  -H "Content-Type: application/json" \\\n  -d '{\"buyer_ids\":[\"b1\",\"b2\"],\"template\":\"summer_fitness\"}'`,
  },
  {
    method: "GET",
    path: "/v1/insights/forecasts",
    description: "Stream trend forecasts with confidence + horizon. Pro+ only.",
    scope: "read:insights",
    example: `curl https://api.aicommerce.os/v1/insights/forecasts \\\n  -H "Authorization: Bearer sk_live_..."`,
  },
];

export type Webhook = {
  id: string;
  url: string;
  events: string[];
  status: "Active" | "Disabled";
  successRate24h: number;
};

export const WEBHOOKS: Webhook[] = [
  {
    id: "w1",
    url: "https://hooks.acme.com/avyn/deal-closed",
    events: ["deal.closed_won", "deal.stage_changed"],
    status: "Active",
    successRate24h: 99.4,
  },
  {
    id: "w2",
    url: "https://internal.brand.io/intel",
    events: ["forecast.published", "intent.spike"],
    status: "Active",
    successRate24h: 100,
  },
  {
    id: "w3",
    url: "https://staging.example.com/in",
    events: ["risk.alert"],
    status: "Disabled",
    successRate24h: 0,
  },
];
