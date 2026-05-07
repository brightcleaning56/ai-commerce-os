"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * A persistent Set<string> backed by localStorage.
 * Returns the current set, a check, and toggle/add/remove helpers.
 */
export function useLocalSet(key: string) {
  const [items, setItems] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed.filter((x) => typeof x === "string"));
      }
    } catch {}
    setHydrated(true);
  }, [key]);

  const persist = useCallback(
    (next: string[]) => {
      setItems(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    },
    [key]
  );

  const has = useCallback((id: string) => items.includes(id), [items]);

  const toggle = useCallback(
    (id: string) => {
      const next = items.includes(id) ? items.filter((x) => x !== id) : [...items, id];
      persist(next);
    },
    [items, persist]
  );

  const add = useCallback(
    (id: string) => {
      if (items.includes(id)) return;
      persist([...items, id]);
    },
    [items, persist]
  );

  const remove = useCallback(
    (id: string) => {
      persist(items.filter((x) => x !== id));
    },
    [items, persist]
  );

  return { items, has, toggle, add, remove, hydrated };
}
