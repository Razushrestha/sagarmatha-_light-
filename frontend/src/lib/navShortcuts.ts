"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function altKey(code: string) {
  return (e: KeyboardEvent) =>
    e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === code;
}

export const NAV_SHORTCUTS = [
  { href: "/dashboard", hint: "Alt+1", match: altKey("Digit1") },
  { href: "/pos", hint: "Alt+2", match: altKey("Digit2") },
  { href: "/sales", hint: "Alt+3", match: altKey("Digit3") },
  { href: "/quotations", hint: "Alt+4", match: altKey("Digit4") },
  { href: "/inventory/products", hint: "Alt+5", match: altKey("Digit5") },
  { href: "/suppliers", hint: "Alt+6", match: altKey("Digit6") },
  { href: "/customers", hint: "Alt+7", match: altKey("Digit7") },
  { href: "/accounting", hint: "Alt+8", match: altKey("Digit8") },
  { href: "/expenses", hint: "Alt+9", match: altKey("Digit9") },
  { href: "/reports", hint: "Alt+0", match: altKey("Digit0") },
  { href: "/analytics", hint: "Alt+A", match: altKey("KeyA") },
  { href: "/inventory/categories", hint: "Alt+K", match: altKey("KeyK") },
  { href: "/inventory/movements", hint: "Alt+V", match: altKey("KeyV") },
  { href: "/inventory/warehouses", hint: "Alt+H", match: altKey("KeyH") },
  { href: "/customers/debtors", hint: "Alt+T", match: altKey("KeyT") },
  { href: "/customers/credit", hint: "Alt+Y", match: altKey("KeyY") },
  { href: "/warranty", hint: "Alt+W", match: altKey("KeyW") },
  { href: "/electricians", hint: "Alt+Z", match: altKey("KeyZ") },
  { href: "/employees", hint: "Alt+M", match: altKey("KeyM") },
  { href: "/projects", hint: "Alt+J", match: altKey("KeyJ") },
  { href: "/notifications", hint: "Alt+B", match: altKey("KeyB") },
  { href: "/settings", hint: "Alt+G", match: altKey("KeyG") },
  { href: "/audit", hint: "Alt+L", match: altKey("KeyL") },
] as const;

export const NAV_SHORTCUT_HINT: Record<string, string> = Object.fromEntries(
  NAV_SHORTCUTS.map((item) => [item.href, item.hint])
);

export function useNavShortcuts(enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const hit = NAV_SHORTCUTS.find((item) => item.match(e));
      if (!hit) return;
      e.preventDefault();
      router.push(hit.href);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, router]);
}
