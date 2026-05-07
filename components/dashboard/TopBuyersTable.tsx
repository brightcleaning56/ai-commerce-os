import { Mail, Linkedin, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { TOP_BUYERS } from "@/lib/mockData";

export default function TopBuyersTable() {
  return (
    <Card>
      <CardHeader
        title="Top Buyer Leads"
        icon={<Users className="h-4 w-4 text-accent-blue" />}
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
              <th className="px-5 py-2.5 text-left font-medium">Company</th>
              <th className="px-3 py-2.5 text-left font-medium">Type</th>
              <th className="px-3 py-2.5 text-left font-medium">Location</th>
              <th className="px-3 py-2.5 text-left font-medium">Intent Score</th>
              <th className="px-5 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {TOP_BUYERS.map((b) => (
              <tr key={b.company} className="border-t border-bg-border hover:bg-bg-hover/30">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-md bg-bg-hover text-[10px] font-semibold">
                      {b.company.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                    </div>
                    <div className="font-medium">{b.company}</div>
                  </div>
                </td>
                <td className="px-3 py-3 text-ink-secondary">{b.type}</td>
                <td className="px-3 py-3 text-ink-secondary">{b.location}</td>
                <td className="px-3 py-3 font-semibold text-brand-200">
                  {b.score}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <button className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary">
                      <Mail className="h-3.5 w-3.5" />
                    </button>
                    <button className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary">
                      <Linkedin className="h-3.5 w-3.5" />
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
          Discover More Buyers →
        </button>
      </div>
    </Card>
  );
}
