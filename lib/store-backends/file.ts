import fs from "node:fs";
import path from "node:path";
import type { StoreBackend } from "./types";

/**
 * File-system backend. Default in dev. On Vercel uses /tmp (ephemeral —
 * production deployments should switch to STORE_BACKEND=kv).
 *
 * Behavior:
 * - Resolves DATA_DIR from process.env.VERCEL (yes → /tmp/ai-commerce-os, no → ./data)
 * - Maintains an in-memory cache so warm-lambda repeat reads are O(1)
 * - Detects read-only filesystem and degrades gracefully to in-memory only
 *
 * Reads are synchronous internally but return Promises to satisfy the interface.
 */
export class FileBackend implements StoreBackend {
  readonly name = "file";
  private dataDir: string;
  private memCache = new Map<string, unknown>();
  private fsWritable: boolean | null = null;

  constructor(dataDir?: string) {
    this.dataDir =
      dataDir ??
      (process.env.VERCEL
        ? "/tmp/ai-commerce-os"
        : path.join(process.cwd(), "data"));
  }

  private resolveFile(key: string): string {
    // Keys come in as "drafts.json" (no path) — resolve under dataDir
    return path.isAbsolute(key) ? key : path.join(this.dataDir, key);
  }

  private checkFsWritable(): boolean {
    if (this.fsWritable !== null) return this.fsWritable;
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const probe = path.join(this.dataDir, ".probe");
      fs.writeFileSync(probe, "ok");
      fs.unlinkSync(probe);
      this.fsWritable = true;
    } catch {
      this.fsWritable = false;
      console.warn("[store/file] filesystem not writable; using in-memory cache");
    }
    return this.fsWritable;
  }

  async read<T>(key: string, fallback: T): Promise<T> {
    const file = this.resolveFile(key);
    if (this.memCache.has(file)) return this.memCache.get(file) as T;
    if (!this.checkFsWritable()) return fallback;
    try {
      if (!fs.existsSync(file)) return fallback;
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = raw.trim() ? (JSON.parse(raw) as T) : fallback;
      this.memCache.set(file, parsed);
      return parsed;
    } catch (e) {
      console.error("[store/file] read failed:", file, e);
      return fallback;
    }
  }

  async write(key: string, data: unknown): Promise<void> {
    const file = this.resolveFile(key);
    // Always update warm cache first — even if disk write fails on a read-only
    // filesystem, subsequent reads in this lambda see the latest value.
    this.memCache.set(file, data);
    if (!this.checkFsWritable()) return;
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("[store/file] write failed:", file, e);
    }
  }

  async remove(key: string): Promise<void> {
    const file = this.resolveFile(key);
    this.memCache.delete(file);
    if (!this.checkFsWritable()) return;
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (e) {
      console.error("[store/file] delete failed:", file, e);
    }
  }

  async health(): Promise<{ name: string; ok: boolean; detail?: string }> {
    const writable = this.checkFsWritable();
    return {
      name: this.name,
      ok: true, // we always work — degrades to in-memory if not writable
      detail: writable
        ? `dataDir=${this.dataDir}, writable=true`
        : `dataDir=${this.dataDir}, in-memory only (read-only fs)`,
    };
  }
}
