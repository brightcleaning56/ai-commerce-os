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

  return (
    <div className="flex min-h-screen flex-col">
      {showHeader && <MarketingHeader />}
      <main className="flex-1">{children}</main>
    </div>
  );
}
