import clsx from "clsx";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-bg-border bg-bg-card",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  icon,
  right,
}: {
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        <span>{title}</span>
      </div>
      {right}
    </div>
  );
}
