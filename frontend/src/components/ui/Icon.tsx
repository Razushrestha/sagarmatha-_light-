import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const sizes = {
  xs: "w-3.5 h-3.5",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
} as const;

interface IconProps {
  icon: LucideIcon;
  size?: keyof typeof sizes;
  className?: string;
  strokeWidth?: number;
}

export default function Icon({ icon: IconComp, size = "md", className, strokeWidth = 1.75 }: IconProps) {
  return (
    <IconComp
      className={cn(sizes[size], "text-brand-700", className)}
      strokeWidth={strokeWidth}
    />
  );
}
