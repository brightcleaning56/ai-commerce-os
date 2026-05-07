"use client";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "success" | "info" | "error";
type Toast = { id: number; kind: ToastKind; msg: string };

type Ctx = {
  toast: (msg: string, kind?: ToastKind) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    return { toast: () => {} };
  }
  return ctx;
}

let nextId = 1;

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((msg: string, kind: ToastKind = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, msg }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => {
          const tone =
            t.kind === "success"
              ? { bg: "bg-bg-panel border-accent-green/40 shadow-accent-green/20", text: "text-accent-green", Icon: CheckCircle2 }
              : t.kind === "error"
              ? { bg: "bg-bg-panel border-accent-red/40 shadow-accent-red/20", text: "text-accent-red", Icon: AlertTriangle }
              : { bg: "bg-bg-panel border-bg-border shadow-brand-500/20", text: "text-brand-300", Icon: Info };
          const Icon = tone.Icon;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-2.5 rounded-lg border ${tone.bg} px-4 py-2.5 text-xs shadow-2xl`}
            >
              <Icon className={`h-3.5 w-3.5 ${tone.text}`} />
              <span className="text-ink-secondary">{t.msg}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="ml-1 grid h-5 w-5 place-items-center rounded text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
