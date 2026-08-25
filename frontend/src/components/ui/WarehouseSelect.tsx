"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface WarehouseOption {
  _id: string;
  name: string;
  isDefault?: boolean;
}

interface WarehouseSelectProps {
  value: string;
  onChange: (value: string) => void;
  warehouses: WarehouseOption[];
  className?: string;
  compact?: boolean;
  required?: boolean;
}

export default function WarehouseSelect({
  value,
  onChange,
  warehouses,
  className,
  compact = false,
  required = false,
}: WarehouseSelectProps) {
  useEffect(() => {
    if (!value && warehouses.length > 0) {
      onChange(pickDefaultWarehouseId(warehouses));
    }
  }, [value, warehouses, onChange]);

  if (!warehouses.length) {
    return (
      <p className={cn("text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2", className)}>
        No warehouse found. Add one under Inventory → Warehouses.
      </p>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className={cn(
        compact
          ? "h-9 px-2.5 text-xs border border-brand-200 rounded-lg bg-white text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-900/10 shrink-0 max-w-[160px]"
          : "input-field",
        className
      )}
      aria-label="Warehouse"
    >
      <option value="">Select warehouse...</option>
      {warehouses.map((w) => (
        <option key={w._id} value={w._id}>
          {w.name}{w.isDefault ? " (Default)" : ""}
        </option>
      ))}
    </select>
  );
}

export function pickDefaultWarehouseId(warehouses: WarehouseOption[]): string {
  if (!warehouses.length) return "";
  const def = warehouses.find((w) => w.isDefault);
  return def?._id || warehouses[0]._id;
}
