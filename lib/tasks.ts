/**
 * Server-side Task store — shared across teammates, browsers, devices.
 *
 * Replaces (alongside) the per-browser `aicos:tasks:v1` localStorage
 * task list. Same shape so the existing /tasks UI can read both
 * sources and dedupe by id during the migration window. New writes
 * dual-write to BOTH localStorage AND here; the read path on /tasks
 * merges them. Eventually localStorage drops out entirely.
 *
 * Why dual-write instead of cutover-then-migrate: the operator has
 * weeks of accumulated tasks in localStorage today. Hard-cutting to
 * server-only would make those vanish. Dual-write keeps them visible
 * while new tasks immediately become cross-browser-visible.
 *
 * Node-only.
 */
import { getBackend } from "./store";

const TASKS_FILE = "tasks.json";
const MAX_RETAINED = 2000;

export type TaskCallOutcome =
  | "connected"
  | "voicemail"
  | "no-answer"
  | "wrong-number"
  | "callback-scheduled";

export type TaskAttempt = {
  at: string;                  // ISO
  durationSec?: number;
  outcome: TaskCallOutcome;
  notes?: string;
  callbackAt?: string;         // ISO when outcome=callback-scheduled
  callSid?: string;            // Twilio CallSid when placed via VoiceProvider
};

export type Task = {
  /** Client-generated id (e.g. "t_<base36 timestamp>"). Allowed because
   *  task creation is operator-initiated; collisions are practically
   *  impossible at human typing speed and we trust the operator side. */
  id: string;
  buyerId: string;
  buyerCompany: string;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  type: "phone" | "sequence";
  done?: boolean;
  attempts?: TaskAttempt[];
  createdAt: string;           // ISO; client provides or server defaults
  /** Email of the operator who created the task (best-effort; comes
   *  from the API auth context, not the client body). */
  createdBy?: string;
  updatedAt: string;           // ISO; bumped on every mutation server-side
};

function isTaskShape(v: unknown): v is Task {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<Task>;
  return (
    typeof t.id === "string" &&
    typeof t.buyerId === "string" &&
    typeof t.buyerCompany === "string" &&
    typeof t.buyerName === "string"
  );
}

export const tasksStore = {
  async list(): Promise<Task[]> {
    const all = await getBackend().read<Task[]>(TASKS_FILE, []);
    return all.filter(isTaskShape);
  },

  async get(id: string): Promise<Task | null> {
    const all = await tasksStore.list();
    return all.find((t) => t.id === id) ?? null;
  },

  /**
   * Upsert by id. Lets the client provide its own id (matches localStorage
   * pattern) so server-side records collide with the corresponding
   * client-side record during the dual-write window.
   */
  async upsert(input: Omit<Task, "updatedAt"> & { updatedAt?: string }): Promise<Task> {
    if (!input.id) throw new Error("id is required");
    const existing = (await getBackend().read<Task[]>(TASKS_FILE, [])).filter(isTaskShape);
    const now = new Date().toISOString();
    const idx = existing.findIndex((t) => t.id === input.id);
    const prev = idx === -1 ? null : existing[idx];
    const merged: Task = {
      ...prev,
      ...input,
      attempts: input.attempts ?? prev?.attempts ?? [],
      createdAt: prev?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    };
    if (idx === -1) {
      const next = [merged, ...existing].slice(0, MAX_RETAINED);
      await getBackend().write(TASKS_FILE, next);
    } else {
      existing[idx] = merged;
      await getBackend().write(TASKS_FILE, existing);
    }
    return merged;
  },

  async patch(id: string, patch: Partial<Omit<Task, "id" | "createdAt">>): Promise<Task | null> {
    const existing = (await getBackend().read<Task[]>(TASKS_FILE, [])).filter(isTaskShape);
    const idx = existing.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const merged: Task = {
      ...existing[idx],
      ...patch,
      id: existing[idx].id,
      createdAt: existing[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    existing[idx] = merged;
    await getBackend().write(TASKS_FILE, existing);
    return merged;
  },

  async remove(id: string): Promise<boolean> {
    const existing = (await getBackend().read<Task[]>(TASKS_FILE, [])).filter(isTaskShape);
    const next = existing.filter((t) => t.id !== id);
    if (next.length === existing.length) return false;
    await getBackend().write(TASKS_FILE, next);
    return true;
  },

  async appendAttempt(id: string, attempt: TaskAttempt): Promise<Task | null> {
    const existing = (await getBackend().read<Task[]>(TASKS_FILE, [])).filter(isTaskShape);
    const idx = existing.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const next: Task = {
      ...existing[idx],
      attempts: [...(existing[idx].attempts ?? []), attempt],
      updatedAt: new Date().toISOString(),
    };
    existing[idx] = next;
    await getBackend().write(TASKS_FILE, existing);
    return next;
  },
};
