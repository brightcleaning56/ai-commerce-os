"use client";
import { useId } from "react";

/**
 * AVYN Commerce mark — A and V interlocked monogram inside an open arc.
 *
 * Gradient mirrors the brand palette: magenta (#c026d3) → indigo (#6366f1)
 * → cyan (#06b6d4). A small glint at the top-right arc end echoes the
 * starpoint in the brand image; a magenta dot marks the arc start.
 */
export function AvynMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const id = `avyn-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AVYN Commerce"
    >
      <defs>
        <linearGradient id={`${id}-arc`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c026d3" />
          <stop offset="55%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id={`${id}-av`} x1="0" y1="0.2" x2="1" y2="0.8">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Arc — open at bottom-left, full sweep to top-right */}
      <path
        d="M 8 32 A 16 16 0 1 1 35 22"
        stroke={`url(#${id}-arc)`}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Magenta dot at arc start */}
      <circle cx="8" cy="32" r="1.5" fill="#c026d3" />
      {/* Cyan glint at arc end (echoing the starpoint in the brand image) */}
      <circle cx="35" cy="22" r="3" fill={`url(#${id}-glow)`} />
      <circle cx="35" cy="22" r="1.2" fill="#22d3ee" />

      {/* A left stroke */}
      <path
        d="M 9 31 L 19 11"
        stroke={`url(#${id}-av)`}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* A right stroke (doubles as V left stroke) */}
      <path
        d="M 19 11 L 27 31"
        stroke={`url(#${id}-av)`}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* A crossbar */}
      <path
        d="M 13 24 L 24 24"
        stroke={`url(#${id}-av)`}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* V right stroke — saturated cyan to anchor the right edge */}
      <path
        d="M 24 24 L 33 11"
        stroke="#22d3ee"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AvynWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-black tracking-wider ${className}`}
      style={{
        background: "linear-gradient(90deg, #c084fc 0%, #818cf8 50%, #22d3ee 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}
    >
      AVYN
    </span>
  );
}

/**
 * Full lockup: mark + wordmark + tagline. Drop-in for marketing pages,
 * empty states, login screen.
 */
export function AvynLockup({
  size = 36,
  showTagline = true,
  className = "",
}: {
  size?: number;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className="grid place-items-center rounded-lg bg-[#0a0014]"
        style={{
          height: size + 6,
          width: size + 6,
          boxShadow: "0 0 14px rgba(192,38,211,0.35)",
        }}
      >
        <AvynMark size={size - 4} />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold">
          <AvynWordmark /> Commerce
        </div>
        {showTagline && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-tertiary">
            AI · Automation · Growth
          </div>
        )}
      </div>
    </div>
  );
}
