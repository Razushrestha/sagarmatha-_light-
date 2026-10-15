import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatAdDate, formatAdDateTime, formatBsDate, formatBsDateTime, getCalendarType } from "./nepaliDate";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `NPR ${value.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date?: string | Date | null): string {
  if (!date) return "";
  return getCalendarType() === "ad" ? formatAdDate(date) : formatBsDate(date) || formatAdDate(date);
}

export function formatDateTime(date?: string | Date | null): string {
  if (!date) return "";
  return getCalendarType() === "ad" ? formatAdDateTime(date) : formatBsDateTime(date) || formatAdDateTime(date);
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/api$/, "");

export function getImageUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

export function thumbPath(path: string): string {
  if (!path) return "";
  if (path.includes("-thumb.")) return path;
  if (/\.webp$/i.test(path)) return path.replace(/\.webp$/i, "-thumb.webp");
  return path;
}

export function getThumbUrl(path: string): string {
  return getImageUrl(thumbPath(path));
}
