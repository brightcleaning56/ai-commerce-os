"use client";
import { X } from "lucide-react";
import { useEffect } from "react";

export default function Drawer({
  open,
  onClose,
  title,
  width = "max-w-xl",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-40 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 h-full w-full ${width} transform border-l border-bg-border bg-bg-panel shadow-2xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md border border-bg-border hover:bg-bg-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[calc(100%-57px)] overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
