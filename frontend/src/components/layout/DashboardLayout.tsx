"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCalendar } from "@/context/CalendarContext";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { PRODUCT } from "@/lib/company";
import { platformAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { prefetchAppRoutes } from "@/lib/appRoutes";
import { useNavShortcuts } from "@/lib/navShortcuts";

function remainingLabel(until?: number | null) {
  if (!until) return "";
  const ms = until - Date.now();
  if (ms <= 0) return "expired";
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")} left`;
}

function ImpersonateBanner({
  shopName,
  until,
  onExit,
}: {
  shopName?: string | null;
  until?: number | null;
  onExit: () => Promise<void>;
}) {
  const [label, setLabel] = useState(() => remainingLabel(until));
  const exitRef = useRef(onExit);
  const expiredRef = useRef(false);
  exitRef.current = onExit;

  useEffect(() => {
    expiredRef.current = false;
    const tick = () => {
      const next = remainingLabel(until);
      setLabel(next);
      if (next === "expired" && !expiredRef.current) {
        expiredRef.current = true;
        exitRef.current().catch(() => {});
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);

  return (
    <div className="bg-amber-400 text-amber-950 text-sm px-4 py-2.5 flex items-center justify-between gap-3">
      <span className="font-medium">
        Support view{shopName ? ` · ${shopName}` : ""} · session auto-expires
        {label ? ` · ${label}` : ""}
      </span>
      <button type="button" className="underline font-semibold shrink-0" onClick={() => onExit()}>
        Exit shop
      </button>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const { calendarType } = useCalendar();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useNavShortcuts(Boolean(user));

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    if (!user) return;
    if (user.mustChangePassword && pathname !== "/change-password") {
      router.replace("/change-password");
      return;
    }
    if (user.role === "platform_admin" && !user.impersonating && !pathname.startsWith("/platform") && pathname !== "/change-password") {
      router.replace("/platform");
    }
    if (user.role !== "platform_admin" && pathname.startsWith("/platform")) {
      router.replace(user.landingPage || "/dashboard");
    }
  }, [user, loading, router, pathname]);

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
          <p className="text-brand-600 font-medium text-sm">Loading {PRODUCT.name}...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="page-shell min-h-screen min-h-[100dvh] overflow-x-hidden" data-calendar={calendarType}>
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
        {user.subscription && (user.subscription.status === "trial" || user.subscription.trialExpired) && (
          <div className="bg-sky-50 text-sky-950 text-sm px-4 py-2">
            {user.subscription.trialExpired
              ? "Trial has ended. Ask Nepatronix to activate this shop."
              : `3-month free trial · ends ${user.subscription.trialEndsAt ? new Date(user.subscription.trialEndsAt).toLocaleDateString() : "soon"}.`}
          </div>
        )}
        {user.subscription?.limits.storageGb != null &&
          user.subscription.usage.storageBytes >= user.subscription.limits.storageGb * 1024 * 1024 * 1024 * 0.8 && (
          <div className="bg-amber-50 text-amber-950 text-sm px-4 py-2">
            Storage: {(user.subscription.usage.storageBytes / (1024 * 1024 * 1024)).toFixed(2)} GB / {user.subscription.limits.storageGb} GB
            {user.subscription.usage.storageBytes >= user.subscription.limits.storageGb * 1024 * 1024 * 1024
              ? " — limit reached. Ask Nepatronix to increase storage."
              : "."}
          </div>
        )}
        {user.impersonating && (
          <ImpersonateBanner
            shopName={user.tenantName}
            until={user.impersonatingUntil}
            onExit={async () => {
              await platformAPI.stopImpersonate();
              await refreshUser();
              router.push("/platform");
            }}
          />
        )}
        <main className="content-main w-full max-w-full overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
