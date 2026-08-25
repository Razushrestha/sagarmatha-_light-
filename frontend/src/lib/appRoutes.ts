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
  "/accounting",
  "/expenses",
  "/reports",
  "/employees",
  "/settings",
] as const;

export function prefetchAppRoutes(prefetch: (href: string) => void) {
  APP_ROUTES.forEach((href) => prefetch(href));
}
