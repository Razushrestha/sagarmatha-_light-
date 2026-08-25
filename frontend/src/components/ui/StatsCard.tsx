import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
}

export default function StatsCard({ title, value, subtitle, icon: Icon, trend }: StatsCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-brand-500 font-medium">{title}</p>
          <p className="text-2xl font-semibold text-brand-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-brand-400 mt-1">{subtitle}</p>}
          {trend && (
            <p className={cn("text-xs font-medium mt-2 text-brand-600")}>
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        <div className="icon-box-lg">
          <Icon className="w-5 h-5 text-brand-700" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}
