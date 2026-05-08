export function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  action,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span className="w-4 text-sm text-slate-500" aria-hidden="true">
            {open ? "v" : ">"}
          </span>
          <h2 className="text-lg font-medium">{title}</h2>
          <span className="text-sm text-slate-500">({count})</span>
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}
