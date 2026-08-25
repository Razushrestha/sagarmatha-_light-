"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users,
  Calculator, BarChart3, TrendingUp, Shield, UserCog, FolderKanban,
  Bell, Settings, FileSearch, FileText, Receipt, ChevronLeft, ChevronRight, Zap,
} from "lucide-react";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "reports:view" },
  { name: "POS / Sales", href: "/pos", icon: ShoppingCart, permission: "pos:access" },
  { name: "Sales List", href: "/sales", icon: FileSearch, permission: "invoice:read" },
  { name: "Quotations", href: "/quotations", icon: FileText, permission: "invoice:read" },
  {
    name: "Inventory", icon: Package, permission: "product:read",
    children: [
      { name: "Products", href: "/inventory/products" },
      { name: "Categories", href: "/inventory/categories" },
      { name: "Stock Movements", href: "/inventory/movements" },
      { name: "Warehouses", href: "/inventory/warehouses" },
    ],
  },
  {
    name: "Purchases", icon: Truck, permission: "purchase:read",
    children: [
      { name: "Purchase List", href: "/purchases" },
      { name: "Purchase Orders", href: "/purchases/orders" },
      { name: "Suppliers", href: "/suppliers" },
      { name: "Purchase Returns", href: "/purchases/returns" },
      { name: "Payment to Suppliers", href: "/purchases/payments" },
    ],
  },
  {
    name: "Customers", icon: Users, permission: "customer:read",
    children: [
      { name: "Customer List", href: "/customers" },
      { name: "Debtors", href: "/customers/debtors" },
      { name: "Customer Credit", href: "/customers/credit" },
    ],
  },
  { name: "Accounting", href: "/accounting", icon: Calculator, permission: "accounting:read" },
  { name: "Expenses", href: "/expenses", icon: Receipt, permission: "accounting:read" },
  { name: "Reports", href: "/reports", icon: BarChart3, permission: "reports:view" },
  { name: "Analytics", href: "/analytics", icon: TrendingUp, permission: "reports:view" },
  { name: "Warranty", href: "/warranty", icon: Shield, permission: "product:read" },
  { name: "Electricians", href: "/electricians", icon: Zap, permission: "customer:read" },
  { name: "Employees", href: "/employees", icon: UserCog, permission: "users:manage" },
  { name: "Projects", href: "/projects", icon: FolderKanban, permission: "reports:view" },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Settings", href: "/settings", icon: Settings, permission: "settings:manage" },
  { name: "Audit Logs", href: "/audit", icon: FileSearch, permission: "audit:view" },
];

const iconClass = "w-5 h-5 flex-shrink-0 text-gray-400";

function isActiveHref(pathname: string, href: string, siblings: Array<{ href: string }> = []) {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  return !siblings.some(
    (sibling) =>
      sibling.href !== href &&
      sibling.href.startsWith(`${href}/`) &&
      (pathname === sibling.href || pathname.startsWith(`${sibling.href}/`))
  );
}

function groupForPath(pathname: string) {
  return navigation.find((item) =>
    item.children?.some((child) => isActiveHref(pathname, child.href, item.children))
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  useEffect(() => {
    const match = groupForPath(pathname);
    setExpandedGroups(match ? [match.name] : []);
  }, [pathname]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => (prev.includes(name) ? [] : [name]));
  };

  const filteredNav = navigation.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar text-white flex flex-col transition-all duration-300 z-40 border-r border-brand-800",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
          <span className="text-brand-900 font-bold text-sm">{COMPANY.monogram}</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="font-semibold text-sm leading-tight">{COMPANY.shortName}</h1>
            <p className="text-[10px] text-gray-400">{COMPANY.tagline}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {filteredNav.map((item) => {
          if (item.children) {
            const isExpanded = expandedGroups.includes(item.name);
            const isChildActive = item.children.some((c) => isActiveHref(pathname, c.href, item.children));

            return (
              <div key={item.name}>
                <button
                  onClick={() => !collapsed && toggleGroup(item.name)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isChildActive
                      ? "text-white"
                      : "text-gray-400 hover:bg-sidebar-hover hover:text-white"
                  )}
                >
                  <item.icon className={iconClass} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.name}</span>
                      <ChevronRight className={cn("w-4 h-4 text-gray-500 transition-transform", isExpanded && "rotate-90")} />
                    </>
                  )}
                </button>
                {!collapsed && isExpanded && (
                  <div className="ml-4 mt-1 space-y-0.5 border-l border-gray-700 pl-3">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block px-3 py-2 rounded-lg text-sm transition-colors",
                          isActiveHref(pathname, child.href, item.children)
                            ? "bg-sidebar-active text-white font-medium"
                            : "text-gray-400 hover:text-white hover:bg-sidebar-hover"
                        )}
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          const isActive = isActiveHref(pathname, item.href!);
          return (
            <Link
              key={item.href}
              href={item.href!}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-sidebar-active text-white font-medium"
                  : "text-gray-400 hover:bg-sidebar-hover hover:text-white"
              )}
            >
              <item.icon className={cn(iconClass, isActive && "text-white")} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        {!collapsed && user && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-gray-400 capitalize">{user.role.replace("_", " ")}</p>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:bg-sidebar-hover hover:text-white transition-colors text-sm"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" strokeWidth={1.75} /> : <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
