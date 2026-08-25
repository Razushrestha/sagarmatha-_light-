"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  hideHeader?: boolean;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
}

const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl", "2xl": "max-w-5xl", "3xl": "max-w-6xl" };

export default function Modal({ open, onClose, title, hideHeader = false, children, size = "md" }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative bg-white rounded-2xl shadow-2xl w-full max-h-[94vh] overflow-hidden flex flex-col", sizes[size])}>
        {!hideHeader && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100 bg-brand-50 shrink-0">
            {title ? <h2 className="text-lg font-semibold text-brand-900">{title}</h2> : <span />}
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-brand-100 text-gray-500 transition-colors ml-auto">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className={cn("overflow-y-auto flex-1 min-h-0", !hideHeader && title ? "p-6" : "p-0")}>{children}</div>
      </div>
    </div>
  );
}
