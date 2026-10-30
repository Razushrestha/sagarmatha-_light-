import { isPathAllowed, type ShopModules } from "@/lib/industry";

export const APP_ROUTES = [
  "/dashboard",
  "/pos",
  "/sales",
  "/sales/returns",
  "/quotations",
  "/quotations/new",
  "/inventory/products",
  "/inventory/products/new",
  "/inventory/categories",
  "/inventory/movements",
  "/inventory/warehouses",
  "/purchases",
  "/purchases/orders",
  "/purchases/returns",
  "/purchases/payments",
  "/suppliers",
  "/customers",
  "/customers/debtors",
  "/customers/credit",
  "/electricians",
  "/paint/shades",
  "/cafe/recipes",
  "/cafe/tables",
  "/cafe/hours",
  "/shifts",
  "/hotel",
  "/hotel/housekeeping",
  "/hotel/report",
  "/hotel/audit",
  "/warranty",
  "/projects",
  "/accounting",
  "/expenses",
  "/reports",
  "/employees",
  "/settings",
] as const;

/** Prefetch only high-traffic routes to avoid loading every app chunk on login. */
const PRIORITY_PREFETCH = new Set([
  "/dashboard",
  "/pos",
  "/sales",
  "/hotel",
  "/inventory/products",
  "/customers",
  "/reports",
  "/settings",
]);

export function prefetchAppRoutes(
  prefetch: (href: string) => void,
  modules?: Partial<ShopModules> | null,
  industry?: string | null
) {
  APP_ROUTES.forEach((href) => {
    if (!PRIORITY_PREFETCH.has(href)) return;
    if (!isPathAllowed(href, modules, industry)) return;
    prefetch(href);
  });
}
