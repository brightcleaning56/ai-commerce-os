/**
 * Storage-backend interface. Implementations: file (dev), kv (prod), postgres (future).
 *
 * The contract is intentionally minimal — every entity is stored as a single
 * JSON-encoded value keyed by a "file path" string. The store facade
 * (lib/store.ts) does its own list manipulation, so backends only need to
 * implement get/set/delete primitives.
 *
 * All operations are async. Backends MAY use sync internals (the file backend
 * does), but the interface is async so callers don't care.
 */
export interface StoreBackend {
  /** Backend name for diagnostics ("file", "kv", "postgres"). */
  readonly name: string;

  /**
   * Read a JSON-encoded value by key. Returns the fallback if the key is
   * unset or the read fails. NEVER throws — backends should swallow errors
   * and log them, returning the fallback. The store layer relies on this.
   */
  read<T>(key: string, fallback: T): Promise<T>;

  /**
   * Write a JSON-encodable value at the given key. Resolves on success,
   * rejects only on truly fatal errors (the store layer doesn't catch).
   */
  write(key: string, data: unknown): Promise<void>;

  /**
   * Delete a key. Resolves regardless of whether the key existed.
   */
  remove(key: string): Promise<void>;

  /**
   * Best-effort warmup — pre-load the backend into a hot cache if any.
   * Backends with no warmup do nothing. Callers should NOT depend on this
   * being called; reads must work without it.
   */
  warmup?(keys: string[]): Promise<void>;

  /**
   * Health check. Returns the backend name + any diagnostic info.
   * Used by /api/admin/health.
   */
  health(): Promise<{ name: string; ok: boolean; detail?: string }>;
}
