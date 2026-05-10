"use client";
import { useEffect, useState } from "react";

/**
 * Resolves the chart-relevant CSS variables to concrete hex values so
 * Recharts (which doesn't accept var(--…) in its props) can render with
 * the right palette in both light and dark mode. Re-resolves when the
 * theme changes.
 */
export type ChartColors = {
  grid: string;       // --color-bg-border
  axis: string;       // --color-ink-tertiary
  tooltipBg: string;  // --color-bg-card
  tooltipBorder: string;
  tooltipLabel: string;
};

const FALLBACK_DARK: ChartColors = {
  grid: "#252538",
  axis: "#6e6e85",
  tooltipBg: "#161624",
  tooltipBorder: "#252538",
  tooltipLabel: "#9b9bb5",
};

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(FALLBACK_DARK);

  useEffect(() => {
    function resolve(): ChartColors {
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      const get = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback;
      return {
        grid: get("--color-bg-border", FALLBACK_DARK.grid),
        axis: get("--color-ink-tertiary", FALLBACK_DARK.axis),
        tooltipBg: get("--color-bg-card", FALLBACK_DARK.tooltipBg),
        tooltipBorder: get("--color-bg-border", FALLBACK_DARK.tooltipBorder),
        tooltipLabel: get("--color-ink-secondary", FALLBACK_DARK.tooltipLabel),
      };
    }
    setColors(resolve());

    // Watch for theme class changes on <html>
    const observer = new MutationObserver(() => setColors(resolve()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Also re-resolve on system-pref change (when in "system" mode the
    // class may not change but the resolved values do)
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => setColors(resolve());
    mql.addEventListener?.("change", handler);

    return () => {
      observer.disconnect();
      mql.removeEventListener?.("change", handler);
    };
  }, []);

  return colors;
}
