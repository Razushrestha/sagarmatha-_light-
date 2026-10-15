"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { PRODUCT } from "@/lib/company";
import { Activity, LogOut, Settings, Store, Users } from "lucide-react";

const NAV = [
  { href: "/platform", label: "Shops", icon: Store, match: (path: string) => path === "/platform" || path.startsWith("/platform/tenants") },
  { href: "/platform/ops", label: "Ops", icon: Activity, match: (path: string) => path.startsWith("/platform/ops") },
  { href: "/platform/admins", label: "Admins", icon: Users, match: (path: string) => path.startsWith("/platform/admins") },
  { href: "/platform/settings", label: "Settings", icon: Settings, match: (path: string) => path.startsWith("/platform/settings") },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    if (user && user.mustChangePassword && pathname !== "/change-password") {
      router.replace("/change-password");
      return;
    }
    if (user && user.role !== "platform_admin") {
      router.replace(user.landingPage || "/dashboard");
    }
  }, [user, loading, router, pathname]);

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb]">
        <p className="text-slate-500 text-sm">Loading {PRODUCT.name}...</p>
      </div>
    );
  }

  if (!user || user.role !== "platform_admin") return null;

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-slate-800">
      <header className="bg-white border-b border-slate-200/80 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link href="/platform" className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 font-bold text-sm shadow-sm">
            {PRODUCT.monogram}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-slate-900 truncate">{PRODUCT.name}</p>
            <p className="text-[11px] text-slate-400">Platform admin</p>
          </div>
        </Link>
        <nav className="flex items-center gap-1 order-last sm:order-none w-full sm:w-auto overflow-x-auto">
          {NAV.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden md:inline text-slate-500 truncate">{user.email}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900"
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>
      <main className="p-4 sm:p-8 max-w-[1400px] mx-auto">{children}</main>
    </div>
  );
}
