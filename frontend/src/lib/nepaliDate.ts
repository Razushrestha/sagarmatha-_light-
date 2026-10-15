import NepaliDate from "nepali-date-converter";

export type CalendarType = "bs" | "ad";

const STORAGE_KEY = "calendarType";
let calendarType: CalendarType = "bs";

export function getCalendarType(): CalendarType {
  return calendarType;
}

export function setCalendarPreference(next: CalendarType) {
  calendarType = next === "ad" ? "ad" : "bs";
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, calendarType);
  }
}

export function readStoredCalendarType(): CalendarType {
  if (typeof window === "undefined") return "bs";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "ad" || stored === "bs") {
    calendarType = stored;
    return stored;
  }
  return "bs";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toLocalISODate(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(): string {
  return toLocalISODate(new Date());
}

export function addDaysISO(days: number, from = todayISO()): string {
  const [y, m, d] = from.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, (d || 1) + days);
  return toLocalISODate(date);
}

export function isoFromParts(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function formatBsDate(value?: string | Date | null): string {
  if (!value) return "";
  try {
    const iso = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : toLocalISODate(value);
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new NepaliDate(new Date(y, m - 1, d)).format("YYYY/MM/DD");
  } catch {
    return "";
  }
}

export function formatBsDateTime(value?: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const bs = formatBsDate(date);
  const time = date.toLocaleTimeString("en-NP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return bs ? `${bs}, ${time}` : "";
}

export function formatAdDate(value?: string | Date | null): string {
  if (!value) return "";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatAdDateTime(value?: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-NP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function bsToIso(bsText: string): string {
  const cleaned = bsText.trim().replace(/[-.\s]/g, "/");
  if (!cleaned) return "";
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length !== 3) return "";
  const [year, month, day] = parts;
  const normalized = `${year}/${pad(Number(month))}/${pad(Number(day))}`;
  try {
    const nd = new NepaliDate(normalized);
    const ad = nd.getAD();
    return isoFromParts(ad.year, ad.month, ad.date);
  } catch {
    return "";
  }
}
