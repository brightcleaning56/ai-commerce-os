import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AVYN Commerce — AI · Automation · Growth",
    template: "%s · AVYN Commerce",
  },
  description:
    "AVYN Commerce orchestrates the full deal lifecycle — discovery, outreach, contracts, escrow, payouts. AI · Automation · Growth.",
  applicationName: "AVYN Commerce",
  authors: [{ name: "Eric Moore" }],
  keywords: ["AVYN", "AVYN Commerce", "AI commerce", "B2B automation", "escrow", "supplier discovery", "buyer discovery"],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "AVYN Commerce",
    description: "AI · Automation · Growth — autonomous commerce orchestration.",
    siteName: "AVYN Commerce",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "AVYN Commerce",
    description: "AI · Automation · Growth.",
  },
};

/**
 * Inline theme initializer — runs synchronously BEFORE React hydration so
 * there's no light/dark flash on page load. Reads `avyn:theme` from
 * localStorage (operator's preference): "light" | "dark" | "system".
 * Defaults to "dark" (the brand's intended look).
 */
const themeInit = `
(function() {
  try {
    var stored = localStorage.getItem('avyn:theme');
    var resolved;
    if (stored === 'light' || stored === 'dark') {
      resolved = stored;
    } else if (stored === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } else {
      // No preference saved yet — default to dark (brand default)
      resolved = 'dark';
    }
    var html = document.documentElement;
    html.classList.remove('light', 'dark');
    html.classList.add(resolved);
    html.style.colorScheme = resolved;
  } catch (e) {
    // localStorage blocked (private mode, embedded frame). Default to dark.
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="bg-bg-base text-ink-primary">{children}</body>
    </html>
  );
}
