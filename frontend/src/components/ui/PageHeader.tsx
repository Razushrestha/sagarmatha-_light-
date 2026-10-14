interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold text-brand-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-brand-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && (
        <div className="shrink-0 flex flex-wrap items-center gap-2 sm:justify-end">
          {action}
        </div>
      )}
    </div>
  );
}
