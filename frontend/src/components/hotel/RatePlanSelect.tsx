"use client";

import { formatCurrency } from "@/lib/utils";

export type RatePlan = {
  _id: string;
  name: string;
  kind: string;
  mode: string;
  nightlyRate: number;
  percentOff: number;
  roomType?: string;
};

export function quoteNightly(rack: number, plan?: RatePlan | null) {
  if (!plan) return Number(rack) || 0;
  if (plan.mode === "percent_off") {
    return Math.round((Number(rack) || 0) * (1 - (Number(plan.percentOff) || 0) / 100) * 100) / 100;
  }
  const fixed = Number(plan.nightlyRate);
  return Number.isFinite(fixed) ? fixed : Number(rack) || 0;
}

export default function RatePlanSelect({
  plans,
  room,
  value,
  onChange,
}: {
  plans: RatePlan[];
  room?: { type: string; rate: number } | null;
  value: string;
  onChange: (id: string) => void;
}) {
  const visible = plans.filter((plan) => !plan.roomType || !room || plan.roomType.toLowerCase() === room.type.toLowerCase());
  const plan = plans.find((p) => p._id === value) || null;
  const quoted = quoteNightly(room?.rate || 0, plan);
  return (
    <div>
      <label className="label">Rate</label>
      <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Rack (room rate)</option>
        {visible.map((row) => (
          <option key={row._id} value={row._id}>
            {row.name} · {row.kind.replace("_", " ")}
          </option>
        ))}
      </select>
      {room ? (
        <p className="text-xs text-brand-500 mt-1">
          {formatCurrency(quoted)} / night{plan ? ` · ${plan.name}` : " · rack"}
          {plan && plan.mode !== "percent_off" && room.rate !== quoted ? ` (rack ${formatCurrency(room.rate)})` : ""}
        </p>
      ) : null}
    </div>
  );
}
