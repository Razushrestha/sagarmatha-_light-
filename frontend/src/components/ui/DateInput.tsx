"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/context/CalendarContext";
import { bsToIso, formatBsDate } from "@/lib/nepaliDate";

interface DateInputProps {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  required?: boolean;
}

export default function DateInput({ value, onChange, className, required }: DateInputProps) {
  const { calendarType } = useCalendar();
  const [bsText, setBsText] = useState(value ? formatBsDate(value) : "");

  useEffect(() => {
    setBsText(value ? formatBsDate(value) : "");
  }, [value, calendarType]);

  if (calendarType === "ad") {
    return (
      <input
        type="date"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    );
  }

  return (
    <input
      type="text"
      required={required}
      inputMode="numeric"
      placeholder="YYYY/MM/DD B.S."
      value={bsText}
      onChange={(e) => {
        const next = e.target.value;
        setBsText(next);
        const iso = bsToIso(next);
        if (iso) onChange(iso);
      }}
      onBlur={() => {
        if (value) setBsText(formatBsDate(value));
      }}
      className={cn(className)}
    />
  );
}
