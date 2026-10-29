"use client";

import { formatCurrency } from "@/lib/utils";

export const MEAL_PLANS = [
  { key: "room_only", label: "Room only", extra: 0 },
  { key: "bb", label: "Bed & breakfast", extra: 500 },
  { key: "map", label: "Half board (MAP)", extra: 1200 },
  { key: "ap", label: "Full board (AP)", extra: 1800 },
] as const;

export function mealExtra(plan: string) {
  return MEAL_PLANS.find((row) => row.key === plan)?.extra || 0;
}

export default function MealPlanSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const extra = mealExtra(value);
  return (
    <div>
      <label className="label">Meal plan</label>
      <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {MEAL_PLANS.map((row) => (
          <option key={row.key} value={row.key}>
            {row.label}{row.extra ? ` · +${row.extra}/night` : ""}
          </option>
        ))}
      </select>
      {extra > 0 ? (
        <p className="text-xs text-brand-500 mt-1">Meals {formatCurrency(extra)} / night, VAT as for room rent. Posted at check-in.</p>
      ) : null}
    </div>
  );
}
