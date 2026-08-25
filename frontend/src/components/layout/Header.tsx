"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, LogOut, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { miscAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    products: Array<{ _id: string; name: string; sku: string; sellingPrice: number }>;
    customers: Array<{ _id: string; name: string; phone: string }>;
    sales: Array<{ _id: string; invoiceNumber: string; total: number }>;
  } | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await miscAPI.search(q);
        setSearchResults(res.data.data);
        setShowResults(true);
      } catch {
        setSearchResults(null);
      }
    }, 250);
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-brand-200 px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search products, customers, invoices..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchResults && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            className="w-full pl-10 pr-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-900/10 focus:border-brand-400 transition-all"
          />

          {showResults && searchResults && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-card-hover border border-brand-200 max-h-80 overflow-y-auto">
              {searchResults.products.length > 0 && (
                <div className="p-2">
                  <p className="text-xs font-semibold text-brand-500 px-2 py-1 uppercase tracking-wide">Products</p>
                  {searchResults.products.map((p) => (
                    <button
                      key={p._id}
                      onClick={() => router.push(`/inventory/products`)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-50 text-sm"
                    >
                      <span className="font-medium text-brand-900">{p.name}</span>
                      <span className="text-brand-400 ml-2">{p.sku}</span>
                      <span className="float-right text-brand-700 font-medium">{formatCurrency(p.sellingPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.customers.length > 0 && (
                <div className="p-2 border-t border-brand-100">
                  <p className="text-xs font-semibold text-brand-500 px-2 py-1 uppercase tracking-wide">Customers</p>
                  {searchResults.customers.map((c) => (
                    <button
                      key={c._id}
                      onClick={() => router.push(`/customers`)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-50 text-sm"
                    >
                      <span className="font-medium text-brand-900">{c.name}</span>
                      <span className="text-brand-400 ml-2">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.sales.length > 0 && (
                <div className="p-2 border-t border-brand-100">
                  <p className="text-xs font-semibold text-brand-500 px-2 py-1 uppercase tracking-wide">Invoices</p>
                  {searchResults.sales.map((s) => (
                    <button
                      key={s._id}
                      onClick={() => router.push(`/sales`)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-50 text-sm"
                    >
                      <span className="font-medium text-brand-900">{s.invoiceNumber}</span>
                      <span className="float-right text-brand-700 font-medium">{formatCurrency(s.total)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/notifications")}
            className="relative p-2.5 rounded-lg hover:bg-brand-50 transition-colors border border-transparent hover:border-brand-200"
            title="Notifications"
          >
            <Bell className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-brand-900 rounded-full" />
          </button>

          <div className="flex items-center gap-3 pl-3 border-l border-brand-200">
            <div className="w-9 h-9 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center">
              <User className="w-4 h-4 text-brand-700" strokeWidth={1.75} />
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-brand-900">{user?.name}</p>
              <p className="text-xs text-brand-500 capitalize">{user?.role?.replace("_", " ")}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-brand-50 text-brand-500 hover:text-brand-900 transition-colors border border-transparent hover:border-brand-200"
              title="Logout"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
