import { Card } from "@/components/ui/Card";

export default function ModuleShell({
  title,
  subtitle,
  Icon,
  features,
}: {
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ className?: string }>;
  features: string[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-brand shadow-glow">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-ink-secondary">{subtitle}</p>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-200">
            Coming next slice
          </span>
          <span>Planned features</span>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 rounded-lg border border-bg-border bg-bg-hover/30 px-3 py-2 text-sm text-ink-secondary"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
