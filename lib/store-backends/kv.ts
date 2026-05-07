import type { StoreBackend } from "./types";

/**
 * Vercel KV / Upstash Redis backend. Production-grade persistence.
 *
 * Activates when STORE_BACKEND=kv. Requires either:
 *   - @vercel/kv installed AND KV_URL + KV_REST_API_TOKEN env vars (Vercel KV)
 *   - @upstash/redis installed AND UPSTASH_REDIS_REST_URL + ..._TOKEN
 *
 * Both packages are loaded via dynamic import — the build does NOT fail if
 * neither is installed (the backend just throws a clear error at runtime).
 *
 * Storage shape:
 *   key "drafts.json" -> JSON-stringified array
 *   key "pipeline-runs.json" -> JSON-stringified array
 *   etc. — same key naming as file backend so migration is a copy.
 *
 * Performance: every read is a network round-trip to KV. The in-memory cache
 * (kept here too) hides repeat reads in the same lambda warm window. Writes
 * are write-through: cache + KV in parallel.
 */
export class KvBackend implements StoreBackend {
  readonly name = "kv";
  private memCache = new Map<string, unknown>();
  private clientPromise: Promise<KvClient> | null = null;
  private flavor: "vercel" | "upstash" | "unknown" = "unknown";

  /** Lazy-load the KV client. Throws if no compatible package is installed. */
  private getClient(): Promise<KvClient> {
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = (async () => {
      // Try @vercel/kv first
      try {
        // @ts-expect-error optional dep — installed only when STORE_BACKEND=kv with Vercel KV
        const mod = (await import(/* webpackIgnore: true */ "@vercel/kv")) as { kv?: VercelKv };
        if (mod && mod.kv) {
          this.flavor = "vercel";
          return adaptVercel(mod.kv);
        }
      } catch {
        // not installed
      }
      // Fall back to @upstash/redis
      try {
        // @ts-expect-error optional dep — installed only when STORE_BACKEND=kv with Upstash
        const mod = (await import(/* webpackIgnore: true */ "@upstash/redis")) as { Redis?: UpstashCtor };
        if (mod && mod.Redis) {
          const url =
            process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
          const token =
            process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
          if (!url || !token) {
            throw new Error(
              "[store/kv] @upstash/redis found but UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN) are not set",
            );
          }
          this.flavor = "upstash";
          return adaptUpstash(new mod.Redis({ url, token }));
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("[store/kv]")) throw e;
      }
      throw new Error(
        "[store/kv] No KV client found. Install @vercel/kv (with KV_URL + KV_REST_API_TOKEN) or @upstash/redis (with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).",
      );
    })();
    return this.clientPromise;
  }

  async read<T>(key: string, fallback: T): Promise<T> {
    if (this.memCache.has(key)) return this.memCache.get(key) as T;
    try {
      const client = await this.getClient();
      const raw = await client.get(key);
      if (raw === null || raw === undefined) return fallback;
      // Vercel KV returns parsed JSON; @upstash/redis returns strings.
      // The adapters normalize this so we always get unparsed strings or
      // already-parsed objects depending on flavor — try to handle both.
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      this.memCache.set(key, parsed);
      return parsed as T;
    } catch (e) {
      console.error("[store/kv] read failed:", key, e);
      return fallback;
    }
  }

  async write(key: string, data: unknown): Promise<void> {
    this.memCache.set(key, data);
    try {
      const client = await this.getClient();
      await client.set(key, JSON.stringify(data));
    } catch (e) {
      console.error("[store/kv] write failed:", key, e);
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    this.memCache.delete(key);
    try {
      const client = await this.getClient();
      await client.del(key);
    } catch (e) {
      console.error("[store/kv] delete failed:", key, e);
    }
  }

  async warmup(keys: string[]): Promise<void> {
    try {
      const client = await this.getClient();
      // Batch fetch — both Vercel KV and Upstash support pipelined gets
      await Promise.all(
        keys.map(async (key) => {
          if (this.memCache.has(key)) return;
          const raw = await client.get(key);
          if (raw === null || raw === undefined) return;
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          this.memCache.set(key, parsed);
        }),
      );
    } catch (e) {
      console.warn("[store/kv] warmup partial:", e);
    }
  }

  async health(): Promise<{ name: string; ok: boolean; detail?: string }> {
    try {
      const client = await this.getClient();
      // Round-trip probe key — write, read, delete
      const probeKey = "__health_probe__";
      const probeVal = `ok-${Date.now()}`;
      await client.set(probeKey, probeVal);
      const got = await client.get(probeKey);
      await client.del(probeKey);
      const ok = got === probeVal || got === `"${probeVal}"`;
      return {
        name: this.name,
        ok,
        detail: `flavor=${this.flavor}, probe=${ok ? "ok" : "mismatch"}`,
      };
    } catch (e) {
      return {
        name: this.name,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

// ─── Internal adapter shapes ───────────────────────────────────────────────

interface KvClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

interface VercelKv {
  get(key: string): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

interface UpstashCtor {
  new (config: { url: string; token: string }): {
    get(key: string): Promise<unknown>;
    set(key: string, value: string): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
  };
}

function adaptVercel(kv: VercelKv): KvClient {
  return {
    get: (key) => kv.get(key),
    set: (key, value) => kv.set(key, value),
    del: (key) => kv.del(key),
  };
}

function adaptUpstash(client: InstanceType<UpstashCtor>): KvClient {
  return {
    get: (key) => client.get(key),
    set: (key, value) => client.set(key, value),
    del: (key) => client.del(key),
  };
}
