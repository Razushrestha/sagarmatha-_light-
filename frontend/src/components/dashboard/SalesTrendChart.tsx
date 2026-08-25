"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const CHART_STROKE = "#111827";

function formatAxis(value: number) {
  const amount = Number(value) || 0;
  if (amount >= 100000) return `${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(amount));
}

export default function SalesTrendChart({
  data,
}: {
  data: Array<{ name: string; sales: number; orders: number }>;
}) {
  const hasSales = data.some((item) => item.sales > 0);

  if (!data.length || !hasSales) {
    return (
      <div className="h-[300px] flex items-center justify-center text-sm text-brand-400">
        No invoice sales in the last 12 months
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111827" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#111827" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickMargin={8} interval={0} />
        <YAxis stroke="#9ca3af" fontSize={12} width={44} tickFormatter={formatAxis} allowDecimals={false} />
        <Tooltip
          formatter={(value, name) => [
            name === "sales" ? formatCurrency(Number(value) || 0) : Number(value) || 0,
            name === "sales" ? "Sales" : "Invoices",
          ]}
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
        />
        <Area
          type="monotone"
          dataKey="sales"
          stroke={CHART_STROKE}
          fill="url(#salesTrendFill)"
          strokeWidth={2}
          dot={{ r: 3, fill: "#fff", stroke: CHART_STROKE, strokeWidth: 2 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
