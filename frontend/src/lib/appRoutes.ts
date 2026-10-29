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

export function prefetchAppRoutes(
  prefetch: (href: string) => void,
  modules?: Partial<ShopModules> | null,
  industry?: string | null
) {
  APP_ROUTES.forEach((href) => {
    if (!isPathAllowed(href, modules, industry)) return;
    prefetch(href);
  });
}
