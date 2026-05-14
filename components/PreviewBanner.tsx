"use client";
import { AlertTriangle, Sparkles } from "lucide-react";
import Link from "next/link";

/**
 * Honest-labeling banner for surfaces that LOOK operational but
 * aren't yet wired to a real backend.
 *
 * Use cases:
 *   - A form whose Submit button only shows a toast
 *   - A list of "rules" that don't actually execute
 *   - A catalog of features where most rows are "Coming soon"
 *
 * Two visual tones:
 *   tone="preview" (amber)  — feature is coming, UI is decorative
 *   tone="planned"  (blue)  — roadmap item; not even decorative yet
 *
 * Optional `href` + `linkLabel` to point operators at the real
 * surface that does work today (e.g. /deals → /outreach for the
 * actual quote pipeline).
 */
export default function PreviewBanner({
  title,
  body,
  tone = "preview",
  href,
  linkLabel,
}: {
  title: string;
  body: string;
  tone?: "preview" | "planned";
  href?: string;
  linkLabel?: string;
}) {
  const wrapClass =
    tone === "preview"
      ? "border-accent-amber/30 bg-accent-amber/5"
      : "border-accent-blue/30 bg-accent-blue/5";
  const iconClass =
    tone === "preview" ? "text-accent-amber" : "text-accent-blue";
  const Icon = tone === "preview" ? AlertTriangle : Sparkles;
  return (
    <div className={`rounded-xl border ${wrapClass} px-4 py-3`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1 text-[12px] text-ink-secondary">
          <div className={`font-semibold ${iconClass}`}>{title}</div>
          <p className="mt-0.5">{body}</p>
          {href && linkLabel && (
            <Link
              href={href}
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-200 hover:underline"
            >
              {linkLabel} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
