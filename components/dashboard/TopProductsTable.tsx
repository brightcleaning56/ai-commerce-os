import clsx from "clsx";
import { Eye, Bookmark, Flame } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import Sparkline from "@/components/ui/Sparkline";
import { TOP_PRODUCTS } from "@/lib/mockData";

const compTone: Record<string, string> = {
  Low: "text-accent-green bg-accent-green/10",
  Medium: "text-accent-amber bg-accent-amber/10",
  High: "text-accent-red bg-accent-red/10",
};
const potTone: Record<string, string> = {
  "Very High": "text-brand-200 bg-brand-500/15",
  High: "text-accent-blue bg-accent-blue/15",
  Medium: "text-ink-secondary bg-bg-hover",
};

const trend = (i: number) =>
  Array.from({ length: 14 }, (_, k) => 50 + Math.sin(k / 2 + i) * 8 + k * 1.2);

export default function TopProductsTable() {
  return (
    <Card>
      <CardHeader
        title="Top Product Opportunities"
        icon={<Flame className="h-4 w-4 text-accent-amber" />}
        right={
          <button className="text-xs text-brand-300 hover:text-brand-200">
            View All
          </button>
        }
      />
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">Product</th>
              <th className="px-3 py-2.5 text-left font-medium">Demand</th>
              <th className="px-3 py-2.5 text-left font-medium">Trend</th>
              <th className="px-3 py-2.5 text-left font-medium">Est. Profit</th>
              <th className="px-3 py-2.5 text-left font-medium">Competition</th>
              <th className="px-3 py-2.5 text-left font-medium">Potential</th>
              <th className="px-5 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {TOP_PRODUCTS.map((p, i) => (
              <tr
                key={p.name}
                className="border-t border-bg-border hover:bg-bg-hover/30"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-card text-[10px] font-semibold text-brand-200">
                      {p.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                    </div>
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[11px] text-ink-tertiary">
                        {p.category}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 font-semibold text-brand-200">
                  {p.score}
                </td>
                <td className="px-3 py-3 w-32">
                  <Sparkline data={trend(i)} color="#22c55e" />
                </td>
                <td className="px-3 py-3 font-medium">{p.profit}</td>
                <td className="px-3 py-3">
                  <span
                    className={clsx(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium",
                      compTone[p.competition]
                    )}
                  >
                    {p.competition}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={clsx(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium",
                      potTone[p.potential]
                    )}
                  >
                    {p.potential}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <button className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary">
                      <Bookmark className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <button className="text-xs text-brand-300 hover:text-brand-200">
          Explore All Opportunities →
        </button>
      </div>
    </Card>
  );
}
