"use client";

/**
 * Minimal CSV exporter — no deps, browser-safe.
 * rows: array of objects. The first row's keys become the header.
 */
export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    // empty file with no header is useless; just no-op
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
