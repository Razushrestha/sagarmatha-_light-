"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";
import { prefetchAppRoutes } from "@/lib/appRoutes";
import { useNavShortcuts } from "@/lib/navShortcuts";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useNavShortcuts(Boolean(user));

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  useEffect(() => {
    if (!user) return;
    const run = () => prefetchAppRoutes((href) => router.prefetch(href));
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(run, 200);
    return () => clearTimeout(timer);
  }, [user, router]);

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-brand-200 border-t-brand-900 rounded-full animate-spin" />
          <p className="text-brand-600 font-medium text-sm">Loading {COMPANY.name}...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="page-shell min-h-screen min-h-[100dvh] overflow-x-hidden">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/45 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div
        className={cn(
          "min-h-screen min-h-[100dvh] transition-all duration-300 min-w-0",
          sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[260px]"
        )}
      >
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="content-main w-full max-w-full overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
