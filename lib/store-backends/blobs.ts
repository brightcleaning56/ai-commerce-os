import type { StoreBackend } from "./types";

/**
 * Netlify Blobs backend. Production-grade persistent storage that survives
 * deploys, cold starts, and container recycles — unlike the file backend
 * which writes to /tmp on Netlify (ephemeral, wiped on every deploy).
 *
 * Activates when STORE_BACKEND=blobs. No external service required —
 * Netlify Blobs auto-configures when running on Netlify Functions or
 * during a Netlify-managed build. Locally (`npm run dev`), it requires a
 * netlify dev session for credentials, otherwise reads will return the
 * fallback and writes will throw — use STORE_BACKEND=file (the default)
 * for local dev.
 *
 * Storage shape:
 *   blob "drafts.json"           -> JSON-stringified array of Draft
 *   blob "leads.json"            -> JSON-stringified array of Lead
 *   blob "transactions.json"     -> JSON-stringified array of Transaction
 *   ...same key naming as the file/kv backends so migration is a copy.
 *
 * Performance: every read is a network round-trip to Blobs. The in-memory
 * cache hides repeat reads in the same lambda warm window. Writes are
 * write-through.
 */

// The @netlify/blobs Store has more methods + richer return types than we
// need. We only care about get/set/delete, so we wrap the raw store in a
// minimal contract to keep the rest of this file simple.
type BlobStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

type RawStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

export class BlobsBackend implements StoreBackend {
  readonly name = "blobs";
  private memCache = new Map<string, unknown>();
  private storePromise: Promise<BlobStore> | null = null;

  /**
   * Lazy-load the @netlify/blobs `getStore`. Single global namespace so
   * all keys live in the same blob store ("avyn-data").
   */
  private getStore(): Promise<BlobStore> {
    if (this.storePromise) return this.storePromise;
    this.storePromise = (async () => {
      try {
        const mod = (await import(/* webpackIgnore: true */ "@netlify/blobs")) as unknown as {
          getStore?: (name: string) => RawStore;
        };
        if (!mod.getStore) {
          throw new Error("[store/blobs] @netlify/blobs is installed but does not export getStore");
        }
        const raw = mod.getStore("avyn-data");
        // Wrap so set/delete return Promise<void> regardless of internal richness.
        return {
          get: (k) => raw.get(k),
          set: async (k, v) => { await raw.set(k, v); },
          delete: async (k) => { await raw.delete(k); },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`[store/blobs] failed to initialize: ${msg}`);
      }
    })();
    return this.storePromise;
  }

  async read<T>(key: string, fallback: T): Promise<T> {
    if (this.memCache.has(key)) return this.memCache.get(key) as T;
    try {
      const store = await this.getStore();
      const raw = await store.get(key);
      if (raw === null || raw === undefined) return fallback;
      const parsed = JSON.parse(raw) as T;
      this.memCache.set(key, parsed);
      return parsed;
    } catch (e) {
      console.error("[store/blobs] read failed:", key, e);
      return fallback;
    }
  }

  async write(key: string, data: unknown): Promise<void> {
    this.memCache.set(key, data);
    try {
      const store = await this.getStore();
      await store.set(key, JSON.stringify(data));
    } catch (e) {
      console.error("[store/blobs] write failed:", key, e);
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    this.memCache.delete(key);
    try {
      const store = await this.getStore();
      await store.delete(key);
    } catch (e) {
      console.error("[store/blobs] delete failed:", key, e);
    }
  }

  async warmup(keys: string[]): Promise<void> {
    try {
      const store = await this.getStore();
      await Promise.all(
        keys.map(async (key) => {
          if (this.memCache.has(key)) return;
          const raw = await store.get(key);
          if (raw === null || raw === undefined) return;
          this.memCache.set(key, JSON.parse(raw));
        }),
      );
    } catch (e) {
      console.error("[store/blobs] warmup partial failure:", e);
    }
  }

  async health(): Promise<{ name: string; ok: boolean; detail?: string }> {
    try {
      const store = await this.getStore();
      // Round-trip a tiny sentinel key to prove the connection works.
      const probe = `_health_probe_${Date.now()}`;
      await store.set(probe, "1");
      const got = await store.get(probe);
      await store.delete(probe);
      return {
        name: this.name,
        ok: got === "1",
        detail: got === "1" ? "Netlify Blobs reachable" : "probe round-trip failed",
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
