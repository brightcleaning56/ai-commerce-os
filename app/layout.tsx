import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Commerce OS",
  description: "Autonomous AI Commerce Agent Network",
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
