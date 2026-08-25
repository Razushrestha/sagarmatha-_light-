"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { saleAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { FileText, Printer, RotateCcw, RefreshCw, Search } from "lucide-react";
import toast from "react-hot-toast";

interface Sale {
  _id: string;
  invoiceNumber: string;
  type?: string;
  customer?: { name: string };
  customerName?: string;
  total: number;
  returnedTotal?: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  createdAt: string;
  createdBy?: { name: string };
}

type ListFilter = "all" | "invoice" | "estimate";

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const type = filter === "all" ? "invoice,estimate" : filter;
      const res = await saleAPI.getAll({
        type,
        limit: "50",
        search: debouncedSearch,
      });
      setSales(res.data.data || []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Sales"
        action={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => loadSales()} className="btn-secondary flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <Link href="/sales/returns" className="btn-secondary flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Returns
            </Link>
          </div>
        }
      />

      <div className="card mb-4 p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number or customer..."
            className="input-field pl-10"
          />
        </div>
        <div className="flex rounded-lg border border-brand-200 overflow-hidden shrink-0">
          {([
            { id: "all", label: "All" },
            { id: "invoice", label: "VAT Invoices" },
            { id: "estimate", label: "Estimates" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={
                filter === opt.id
                  ? "px-3 py-2 text-xs font-medium bg-brand-900 text-white"
                  : "px-3 py-2 text-xs font-medium bg-white text-brand-700 hover:bg-brand-50"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Invoice</th>
              <th className="table-header">Type</th>
              <th className="table-header">Customer</th>
              <th className="table-header">Total</th>
              <th className="table-header">Paid</th>
              <th className="table-header">Due</th>
              <th className="table-header">Status</th>
              <th className="table-header">Date</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={9} className="table-cell"><div className="h-10 bg-brand-50 rounded animate-pulse" /></td></tr>
              ))
            ) : sales.length === 0 ? (
              <tr>
                <td colSpan={9} className="table-cell text-center py-12 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />No sales found
                </td>
              </tr>
            ) : (
              sales.map((sale) => {
                const returned = sale.returnedTotal || 0;
                const net = Math.max(0, (sale.total || 0) - returned);
                return (
                <tr key={sale._id} className="hover:bg-brand-50/50 transition-colors">
                  <td className="table-cell font-medium text-brand-700">{sale.invoiceNumber}</td>
                  <td className="table-cell capitalize text-brand-500">{sale.type === "estimate" ? "Estimate" : "Invoice"}</td>
                  <td className="table-cell">{sale.customer?.name || sale.customerName || "Walk-in"}</td>
                  <td className="table-cell font-medium">
                    {formatCurrency(net)}
                    {returned > 0 && (
                      <p className="text-xs text-gray-400 font-normal">Returned {formatCurrency(returned)}</p>
                    )}
                  </td>
                  <td className="table-cell text-brand-900">{formatCurrency(sale.amountPaid)}</td>
                  <td className="table-cell">
                    <span className={sale.amountDue > 0 ? "text-brand-700 font-medium" : "text-gray-400"}>
                      {formatCurrency(sale.amountDue)}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className="badge capitalize">{(sale.status || "").replace("_", " ")}</span>
                  </td>
                  <td className="table-cell text-gray-500">{formatDateTime(sale.createdAt)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <Link href={`/sales/${sale._id}/print`} className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 text-sm">
                        <Printer className="w-4 h-4" /> Print
                      </Link>
                      {sale.status !== "returned" && sale.status !== "cancelled" && (
                        <Link href="/sales/returns" className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-800 text-sm">
                          <RotateCcw className="w-3.5 h-3.5" /> Return
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
