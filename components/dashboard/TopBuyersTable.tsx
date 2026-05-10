"use client";
import { Linkedin, Mail, Users, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";

type Buyer = {
  id: string;
  company: string;
  type: string;
  location: string;
  decisionMaker: string;
  decisionMakerTitle?: string;
  industry?: string;
  intentScore?: number;
  fit?: number;
};

export default function TopBuyersTable() {
  const [buyers, setBuyers] = useState<Buyer[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discovered-buyers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.buyers) return;
        // Top 5 by intentScore (or fit if intent missing)
        const sorted = [...d.buyers].sort(
          (a: Buyer, b: Buyer) => (b.intentScore ?? b.fit ?? 0) - (a.intentScore ?? a.fit ?? 0),
        );
        setBuyers(sorted.slice(0, 5));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader
        title="Top Buyer Leads"
        icon={<Users className="h-4 w-4 text-accent-blue" />}
        right={
          <Link href="/buyers" className="text-xs text-brand-300 hover:text-brand-200">
            View All
          </Link>
        }
      />
      {buyers && buyers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent-blue/15">
            <Users className="h-5 w-5 text-accent-blue" />
          </div>
          <div className="text-sm font-medium">No buyers matched yet</div>
          <div className="text-[11px] text-ink-tertiary max-w-sm">
            Buyer Discovery runs after Trend Hunter surfaces products. Run a pipeline to populate the lead list.
          </div>
          <Link
            href="/pipeline"
            className="mt-1 flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
          >
            <Sparkles className="h-3 w-3" /> Run pipeline
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Company</th>
                <th className="px-3 py-2.5 text-left font-medium">Type</th>
                <th className="px-3 py-2.5 text-left font-medium">Location</th>
                <th className="px-3 py-2.5 text-left font-medium">Intent</th>
                <th className="px-5 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {(buyers ?? []).map((b) => {
                const score = b.intentScore ?? b.fit ?? 0;
                const initials = b.company
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? "")
                  .join("");
                return (
                  <tr key={b.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-md bg-bg-hover text-[10px] font-semibold">
                          {initials || "??"}
                        </div>
                        <div>
                          <div className="font-medium">{b.company}</div>
                          {b.decisionMaker && (
                            <div className="text-[11px] text-ink-tertiary">
                              {b.decisionMaker}{b.decisionMakerTitle ? ` · ${b.decisionMakerTitle}` : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-secondary">{b.type}</td>
                    <td className="px-3 py-3 text-ink-secondary">{b.location}</td>
                    <td className="px-3 py-3 font-semibold text-brand-200">{score}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/buyers?focus=${b.id}`}
                          className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary"
                          title="View buyer"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary"
                          title="LinkedIn (coming soon)"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {buyers === null &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="border-t border-bg-border">
                    <td className="px-5 py-3" colSpan={5}>
                      <div className="h-9 animate-pulse rounded-md bg-bg-hover/40" />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <Link href="/buyers" className="text-xs text-brand-300 hover:text-brand-200">
          Discover More Buyers →
        </Link>
      </div>
    </Card>
  );
}
