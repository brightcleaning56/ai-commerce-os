"use client";
import { usePathname } from "next/navigation";
import MarketingHeader from "@/components/MarketingHeader";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // /welcome has its own scroll-aware Navbar — skip the shared header there
  const showHeader = pathname !== "/welcome";

  // Marketing surfaces always render dark — the AVYN brand aesthetic uses
  // a deep-violet hero that doesn't make sense on a white background.
  // Adding `dark` here forces CSS variables to dark values regardless of
  // the operator's app-theme preference.
  return (
    <div className="dark flex min-h-screen flex-col bg-bg-base text-ink-primary">
      {showHeader && <MarketingHeader />}
      <main className="flex-1">{children}</main>
    </div>
  );
}
