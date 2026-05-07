import fs from "node:fs";
import path from "node:path";
import type { Buyer } from "@/lib/buyers";
import type { Product } from "@/lib/products";
import type { ScrapeResult } from "@/lib/scrapers";

// On Vercel the project filesystem is read-only — only /tmp is writable.
// In dev, we use ./data so persistence survives restarts.
// Either way, we keep an in-memory mirror so reads never hit disk twice
// in the same lambda warm window.
const DATA_DIR = process.env.VERCEL
  ? "/tmp/ai-commerce-os"
  : path.join(process.cwd(), "data");

const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const RUNS_FILE = path.join(DATA_DIR, "agent-runs.json");
const SIGNALS_FILE = path.join(DATA_DIR, "signals.json");
const BUYERS_FILE = path.join(DATA_DIR, "discovered-buyers.json");
const DRAFTS_FILE = path.join(DATA_DIR, "drafts.json");

// In-memory mirror — stays warm across requests on the same lambda instance,
// resets on cold start. Acts as the single source of truth when fs is read-only.
const memCache = new Map<string, unknown>();
let fsWritable: boolean | null = null;

function checkFsWritable(): boolean {
  if (fsWritable !== null) return fsWritable;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const probe = path.join(DATA_DIR, ".probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    fsWritable = true;
  } catch {
    fsWritable = false;
    if (typeof console !== "undefined") {
      console.warn("[store] filesystem not writable; using in-memory cache");
    }
  }
  return fsWritable;
}

function readJSON<T>(file: string, fallback: T): T {
  // Prefer warm cache
  if (memCache.has(file)) return memCache.get(file) as T;
  if (!checkFsWritable()) return fallback;
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = raw.trim() ? (JSON.parse(raw) as T) : fallback;
    memCache.set(file, parsed);
    return parsed;
  } catch (e) {
    console.error("[store] read failed:", file, e);
    return fallback;
  }
}

function writeJSON(file: string, data: unknown) {
  // Always update the warm cache so subsequent reads are correct
  // even if disk write fails on a read-only filesystem.
  memCache.set(file, data);
  if (!checkFsWritable()) return;
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("[store] write failed:", file, e);
  }
}

export type DiscoveredProduct = Product & {
  source: "agent";
  agent: string;
  discoveredAt: string; // ISO
  runId: string;
  rationale: string;
};

export type AgentRun = {
  id: string;
  agent: "trend-hunter" | "buyer-discovery" | "outreach";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "success" | "error";
  inputCategory: string | null;
  inputProductName?: string;
  productCount: number;
  buyerCount?: number;
  modelUsed: string;
  inputTokens?: number;
  outputTokens?: number;
  estCostUsd?: number;
  usedFallback: boolean;
  errorMessage?: string;
  signalsUsed?: number;
  signalSources?: string[];
};

export type DiscoveredBuyer = Buyer & {
  source: "agent";
  agent: string;
  discoveredAt: string;
  runId: string;
  rationale: string;
  forProduct: string; // product name this buyer was discovered for
};

export type OutreachDraft = {
  id: string;
  runId: string;
  createdAt: string;
  buyerId: string;
  buyerCompany: string;
  buyerName: string;
  buyerTitle: string;
  productName: string;
  status: "draft" | "approved" | "sent" | "rejected";
  email: { subject: string; body: string };
  linkedin: { body: string };
  sms: { body: string };
  modelUsed: string;
  estCostUsd?: number;
  usedFallback: boolean;
};

export const store = {
  getProducts(): DiscoveredProduct[] {
    return readJSON<DiscoveredProduct[]>(PRODUCTS_FILE, []);
  },
  saveProducts(items: DiscoveredProduct[]) {
    const existing = store.getProducts();
    const all = [...items, ...existing].slice(0, 200);
    writeJSON(PRODUCTS_FILE, all);
  },
  getRuns(): AgentRun[] {
    return readJSON<AgentRun[]>(RUNS_FILE, []);
  },
  saveRun(run: AgentRun) {
    const existing = store.getRuns();
    const all = [run, ...existing].slice(0, 100);
    writeJSON(RUNS_FILE, all);
  },
  getSignals(): ScrapeResult | null {
    return readJSON<ScrapeResult | null>(SIGNALS_FILE, null);
  },
  saveSignals(result: ScrapeResult) {
    writeJSON(SIGNALS_FILE, result);
  },
  getDiscoveredBuyers(): DiscoveredBuyer[] {
    return readJSON<DiscoveredBuyer[]>(BUYERS_FILE, []);
  },
  saveDiscoveredBuyers(items: DiscoveredBuyer[]) {
    const existing = store.getDiscoveredBuyers();
    const all = [...items, ...existing].slice(0, 200);
    writeJSON(BUYERS_FILE, all);
  },
  getDrafts(): OutreachDraft[] {
    return readJSON<OutreachDraft[]>(DRAFTS_FILE, []);
  },
  saveDraft(draft: OutreachDraft) {
    const existing = store.getDrafts();
    const all = [draft, ...existing].slice(0, 200);
    writeJSON(DRAFTS_FILE, all);
  },
  updateDraftStatus(id: string, status: OutreachDraft["status"]) {
    const drafts = store.getDrafts();
    const idx = drafts.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    drafts[idx].status = status;
    writeJSON(DRAFTS_FILE, drafts);
    return drafts[idx];
  },
};
