"use client";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "avyn:theme";

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "dark";
}

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  const resolved = resolve(theme);
  const html = document.documentElement;
  html.classList.remove("light", "dark");
  html.classList.add(resolved);
  html.style.colorScheme = resolved;
}

/**
 * Theme toggle — button with a dropdown menu for system / light / dark.
 * Persists choice to `avyn:theme` in localStorage; the inline init script
 * in app/layout.tsx reads this on first paint to avoid theme flash.
 *
 * If `variant="icon"` (default), renders as a 36×36 icon button suitable
 * for the TopBar. `variant="full"` renders a full menu inline (for the
 * Settings page).
 */
export default function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Initial sync with what's already on <html> from the init script
  useEffect(() => {
    setTheme(readStored());
  }, []);

  // Listen for OS theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => applyTheme("system");
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, [theme]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function set(t: Theme) {
    setTheme(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
    applyTheme(t);
    setOpen(false);
  }

  const ActiveIcon = theme === "light" ? Sun : theme === "system" ? Monitor : Moon;

  const options: { key: Theme; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "light", label: "Light", Icon: Sun },
    { key: "dark", label: "Dark", Icon: Moon },
    { key: "system", label: "System", Icon: Monitor },
  ];

  if (variant === "full") {
    return (
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => set(o.key)}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              theme === o.key
                ? "border-brand-500/60 bg-brand-500/10 text-brand-200"
                : "border-bg-border bg-bg-card text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`}
          >
            <o.Icon className="h-3.5 w-3.5" />
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-bg-border bg-bg-card hover:bg-bg-hover"
        aria-label={`Theme: ${theme}`}
        title={`Theme: ${theme}`}
      >
        <ActiveIcon className="h-4 w-4 text-ink-secondary" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg border border-bg-border bg-bg-panel shadow-glow">
          <div className="border-b border-bg-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Theme
          </div>
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => set(o.key)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-bg-hover ${
                theme === o.key ? "text-brand-300" : "text-ink-secondary"
              }`}
            >
              <span className="flex items-center gap-2">
                <o.Icon className="h-3.5 w-3.5" />
                {o.label}
              </span>
              {theme === o.key && <ChevronDown className="h-3 w-3 -rotate-90" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
