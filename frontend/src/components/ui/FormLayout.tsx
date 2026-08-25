"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function FormBackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-900 mb-3">
      <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
      {label}
    </Link>
  );
}

export function FormCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("card p-4 sm:p-5 w-full", className)}>{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("form-section", className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-brand-900">{title}</h3>
        {description && <p className="text-xs text-brand-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function FormGrid({
  children,
  cols = 3,
  className,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  const colClass = {
    2: "form-grid-2",
    3: "form-grid-3",
    4: "form-grid-4",
  }[cols];

  return <div className={cn(colClass, className)}>{children}</div>;
}

export function FormActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("form-actions", className)}>
      {children}
    </div>
  );
}

export function FormCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-brand-600 cursor-pointer select-none">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-brand-300 text-brand-900 focus:ring-brand-900/20"
      />
      {label}
    </label>
  );
}
