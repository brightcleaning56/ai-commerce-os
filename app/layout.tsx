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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-base text-ink-primary">{children}</body>
    </html>
  );
}
