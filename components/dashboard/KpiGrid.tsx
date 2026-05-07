import {
  Boxes,
  Flame,
  Users,
  MessageCircle,
  Briefcase,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import Sparkline from "@/components/ui/Sparkline";
import { KPIS } from "@/lib/mockData";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "Total Opportunities": Boxes,
  "High Demand Products": Flame,
  "Buyers Contacted": Users,
  "Responses Received": MessageCircle,
  "Deals in Pipeline": Briefcase,
  "Est. Revenue": DollarSign,
};

const toneMap: Record<string, { bg: string; text: string; line: string }> = {
  brand: { bg: "bg-brand-500/10", text: "text-brand-300", line: "#a87dff" },
  amber: { bg: "bg-accent-amber/10", text: "text-accent-amber", line: "#f59e0b" },
  blue: { bg: "bg-accent-blue/10", text: "text-accent-blue", line: "#3b82f6" },
  cyan: { bg: "bg-accent-cyan/10", text: "text-accent-cyan", line: "#06b6d4" },
  green: { bg: "bg-accent-green/10", text: "text-accent-green", line: "#22c55e" },
};

const sparkData = (seed: number) =>
  Array.from({ length: 16 }, (_, i) =>
    Math.round(40 + Math.sin(i / 2 + seed) * 12 + i * (1 + (seed % 3)))
  );

export default function KpiGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {KPIS.map((k, idx) => {
        const Icon = iconMap[k.label] ?? Boxes;
        const tone = toneMap[k.tone] ?? toneMap.brand;
        return (
          <div
            key={k.label}
            className="rounded-xl border border-bg-border bg-bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <div className={`grid h-9 w-9 place-items-center rounded-lg ${tone.bg}`}>
                <Icon className={`h-4 w-4 ${tone.text}`} />
              </div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-accent-green">
                <TrendingUp className="h-3 w-3" />
                {k.delta}
              </div>
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-wider text-ink-tertiary">
              {k.label}
            </div>
            <div className="mt-1 text-2xl font-bold">{k.value}</div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">{k.sub}</div>
            <div className="mt-2">
              <Sparkline data={sparkData(idx)} color={tone.line} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
