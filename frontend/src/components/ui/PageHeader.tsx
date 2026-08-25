interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h1 className="text-xl font-semibold text-brand-900">{title}</h1>
        {subtitle && <p className="text-sm text-brand-500 mt-0.5">{subtitle}</p>}
      </div>
        {action && <div className="shrink-0 flex flex-wrap items-center justify-end gap-2">{action}</div>}
    </div>
  );
}
