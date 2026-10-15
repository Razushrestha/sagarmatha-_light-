"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { saleAPI, productAPI, customerAPI, ALL_RECORDS } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { FileText, Printer, RotateCcw, RefreshCw, Search, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import SaleEditForm, { SaleEditPayload, SaleForEdit } from "@/components/sales/SaleEditForm";

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
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingSale, setEditingSale] = useState<SaleForEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Array<{ _id: string; name: string; sellingPrice: number }>>([]);
  const [customers, setCustomers] = useState<Array<{ _id: string; name: string; phone?: string }>>([]);
  const debouncedSearch = useDebouncedValue(search, 250);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const type = filter === "all" ? "invoice,estimate" : filter;
      const res = await saleAPI.getAll({
        type,
        limit: "50",
        page: String(page),
        search: debouncedSearch,
      });
      setSales(res.data.data || []);
      setPages(res.data.pagination?.pages || 1);
      setTotal(res.data.pagination?.total || 0);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, page]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    productAPI.getAll().then((r) => setProducts(r.data.data || []));
    customerAPI.getAll({ limit: ALL_RECORDS }).then((r) => setCustomers(r.data.data || []));
  }, []);

  const canMutate = (sale: Sale) => sale.status !== "cancelled";

  const openEdit = async (saleId: string) => {
    try {
      const res = await saleAPI.getById(saleId);
      setEditingSale(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to load sale");
    }
  };

  const handleUpdate = async (payload: SaleEditPayload) => {
    if (!editingSale) return;
    setSaving(true);
    try {
      await saleAPI.update(editingSale._id, payload);
      toast.success("Sale updated");
      setEditingSale(null);
      loadSales();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to update sale");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sale: Sale) => {
    if (!window.confirm(`Delete ${sale.invoiceNumber}? Stock and customer balance will be reversed.`)) return;
    try {
      await saleAPI.remove(sale._id);
      toast.success("Sale deleted");
      loadSales();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to delete sale");
    }
  };

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
                  <td className="table-cell text-right">
                    <div className="inline-flex items-center justify-end gap-1 flex-wrap">
                      <Link
                        href={`/sales/${sale._id}/print`}
                        className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print
                      </Link>
                      {canMutate(sale) && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(sale._id)}
                            className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(sale)}
                            className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1 text-red-700 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                          <Link href="/sales/returns" className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1">
                            <RotateCcw className="w-3.5 h-3.5" /> Return
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-brand-100 text-sm text-gray-600">
            <span>{total} invoices</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary py-1 px-3" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span className="py-1">Page {page} of {pages}</span>
              <button type="button" className="btn-secondary py-1 px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!editingSale} onClose={() => setEditingSale(null)} size="3xl" hideHeader>
        {editingSale && (
          <SaleEditForm
            key={editingSale._id}
            sale={editingSale}
            products={products}
            customers={customers}
            saving={saving}
            onSubmit={handleUpdate}
            onCancel={() => setEditingSale(null)}
          />
        )}
      </Modal>
    </DashboardLayout>
  );
}
