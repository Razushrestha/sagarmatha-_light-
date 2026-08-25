"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { saleAPI, miscAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Printer, RotateCcw, Search } from "lucide-react";
import toast from "react-hot-toast";

interface SaleOption {
  _id: string;
  invoiceNumber: string;
  total: number;
  returnedTotal?: number;
  customerName?: string;
  customer?: { name?: string };
  warehouse?: string | { _id: string; name?: string };
}

interface ReturnLine {
  saleId: string;
  invoiceNumber: string;
  product: string;
  productName: string;
  quantity: number;
  maxQty: number;
  unitPrice: number;
  subtotal: number;
}

function productIdOf(product?: string | { _id: string }) {
  if (typeof product === "object" && product !== null) return product._id;
  return String(product || "");
}

function remainingQty(item: { quantity?: number; returnedQuantity?: number }) {
  return Math.max(0, (Number(item.quantity) || 0) - (Number(item.returnedQuantity) || 0));
}

export default function SalesReturnsPage() {
  const [returns, setReturns] = useState<Array<{
    _id: string; returnNumber: string; total: number;
    originalSale?: { invoiceNumber: string };
    originalSales?: Array<{ invoiceNumber: string }>;
    customer?: { name: string };
    refundMethod: string; createdAt: string;
  }>>([]);
  const [sales, setSales] = useState<SaleOption[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const debouncedSearch = useDebouncedValue(invoiceSearch, 250);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [returnItems, setReturnItems] = useState<ReturnLine[]>([]);
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const router = useRouter();

  const loadReturns = () => saleAPI.getReturns().then((r) => setReturns(r.data.data || []));

  const loadSales = useCallback(async (q = "") => {
    const res = await saleAPI.getAll({
      type: "invoice,estimate",
      status: "completed,partial_return",
      limit: "100",
      search: q,
    });
    setSales(res.data.data || []);
  }, []);

  useEffect(() => {
    loadReturns();
    loadSales();
    miscAPI.getWarehouses().then((r) => {
      const list = r.data.data || [];
      setWarehouses(list);
      if (list.length > 0) setWarehouseId((prev) => prev || list[0]._id);
    });
  }, [loadSales]);

  useEffect(() => {
    if (!showModal) return;
    loadSales(debouncedSearch).catch(() => toast.error("Failed to search invoices"));
  }, [debouncedSearch, showModal, loadSales]);

  const resolveWarehouseId = (warehouse?: string | { _id: string }) => {
    if (!warehouse) return "";
    return typeof warehouse === "object" ? warehouse._id : warehouse;
  };

  const linesFromSale = (sale: {
    _id: string;
    invoiceNumber: string;
    warehouse?: string | { _id: string };
    items?: Array<{
      product?: string | { _id: string };
      productName?: string;
      quantity?: number;
      returnedQuantity?: number;
      unitPrice?: number;
    }>;
  }): ReturnLine[] => {
    const warehouse = resolveWarehouseId(sale.warehouse);
    if (warehouse) setWarehouseId((prev) => prev || warehouse);
    return (sale.items || [])
      .map((item) => {
        const maxQty = remainingQty(item);
        return {
          saleId: sale._id,
          invoiceNumber: sale.invoiceNumber,
          product: productIdOf(item.product),
          productName: item.productName || "Item",
          quantity: 0,
          maxQty,
          unitPrice: item.unitPrice || 0,
          subtotal: 0,
        };
      })
      .filter((item) => item.maxQty > 0);
  };

  const toggleInvoice = async (saleId: string) => {
    if (selectedIds.includes(saleId)) {
      setSelectedIds(selectedIds.filter((id) => id !== saleId));
      setReturnItems((rows) => rows.filter((row) => row.saleId !== saleId));
      return;
    }

    setLoadingItems(true);
    try {
      const res = await saleAPI.getById(saleId);
      const sale = res.data.data;
      const lines = linesFromSale(sale);
      if (!lines.length) {
        toast.error(`${sale.invoiceNumber || "Invoice"} has nothing left to return`);
        return;
      }
      setSelectedIds((ids) => [...ids, saleId]);
      setReturnItems((rows) => [...rows, ...lines]);
    } catch {
      toast.error("Failed to load invoice items");
    } finally {
      setLoadingItems(false);
    }
  };

  const updateReturnQty = (idx: number, qty: number) => {
    setReturnItems(returnItems.map((item, i) => {
      if (i !== idx) return item;
      const quantity = Math.min(Math.max(0, qty), item.maxQty);
      return { ...item, quantity, subtotal: quantity * item.unitPrice };
    }));
  };

  const returnTotal = returnItems.reduce((s, i) => s + i.subtotal, 0);
  const selectedCount = selectedIds.length;

  const visibleSales = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    const matched = sales.filter((s) => {
      if (!q) return true;
      const customer = (s.customer?.name || s.customerName || "").toLowerCase();
      return s.invoiceNumber.toLowerCase().includes(q) || customer.includes(q);
    });
    const selected = sales.filter((s) => selectedIds.includes(s._id) && !matched.some((m) => m._id === s._id));
    return [...selected, ...matched];
  }, [sales, invoiceSearch, selectedIds]);

  const resetModal = () => {
    setSelectedIds([]);
    setReturnItems([]);
    setInvoiceSearch("");
    setReason("");
    setRefundMethod("cash");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = returnItems.filter((i) => i.quantity > 0);
    if (!items.length) return toast.error("Select items to return");
    if (!warehouseId) return toast.error("Select a warehouse");

    const bySale = new Map<string, ReturnLine[]>();
    for (const item of items) {
      const list = bySale.get(item.saleId) || [];
      list.push(item);
      bySale.set(item.saleId, list);
    }

    setSaving(true);
    try {
      const returnsPayload = [...bySale.entries()].map(([saleId, lines]) => ({
        sale: saleId,
        items: lines.map((i) => ({
          product: i.product,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
      }));
      const res = await saleAPI.createReturnsBatch({
        returns: returnsPayload,
        refundMethod,
        reason,
        warehouse: warehouseId,
      });
      const returnId = res.data?.data?._id;
      toast.success("Return saved");
      setShowModal(false);
      resetModal();
      if (returnId) {
        router.push(`/sales/returns/print?ids=${returnId}`);
        return;
      }
      loadReturns();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Return failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Sales Returns"
        action={<button onClick={() => { resetModal(); setShowModal(true); }} className="btn-primary flex items-center gap-2"><RotateCcw className="w-4 h-4" /> New Return</button>} />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-header">Return #</th>
            <th className="table-header">Original Invoice</th>
            <th className="table-header">Customer</th>
            <th className="table-header">Amount</th>
            <th className="table-header">Refund</th>
            <th className="table-header">Date</th>
            <th className="table-header"></th>
          </tr></thead>
          <tbody className="divide-y divide-brand-50">
            {returns.length === 0 ? (
              <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400">No returns yet</td></tr>
            ) : returns.map((r) => (
              <tr key={r._id} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium text-brand-700">{r.returnNumber}</td>
                <td className="table-cell">
                  {(r.originalSales?.length
                    ? r.originalSales.map((s) => s.invoiceNumber).filter(Boolean)
                    : [r.originalSale?.invoiceNumber]
                  ).filter(Boolean).join(", ") || "—"}
                </td>
                <td className="table-cell">{r.customer?.name || ""}</td>
                <td className="table-cell font-medium">{formatCurrency(r.total)}</td>
                <td className="table-cell capitalize">{r.refundMethod?.replace("_", " ")}</td>
                <td className="table-cell text-gray-500">{formatDateTime(r.createdAt)}</td>
                <td className="table-cell">
                  <Link href={`/sales/returns/print?ids=${r._id}`} className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 text-sm">
                    <Printer className="w-4 h-4" /> Print
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Process Sales Return" size="lg">
        <form onSubmit={handleSubmit} className="form-modal">
          <FormField label="Search invoices">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input-field pl-10"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Search by invoice / bill number or customer..."
              />
            </div>
          </FormField>

          <div className="border border-brand-100 rounded-lg max-h-48 overflow-y-auto">
            {visibleSales.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No matching invoices</p>
            ) : visibleSales.map((s) => {
              const checked = selectedIds.includes(s._id);
              const customer = s.customer?.name || s.customerName || "Walk-in";
              const net = Math.max(0, (s.total || 0) - (s.returnedTotal || 0));
              return (
                <label key={s._id} className={`flex items-center gap-3 px-3 py-2 border-b border-brand-50 last:border-0 cursor-pointer ${checked ? "bg-brand-50" : "hover:bg-brand-50/50"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={loadingItems}
                    onChange={() => toggleInvoice(s._id)}
                    className="rounded border-brand-300"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-brand-900">{s.invoiceNumber}</span>
                    <span className="block text-xs text-brand-500 truncate">{customer}</span>
                  </span>
                  <span className="text-sm tabular-nums text-brand-700">{formatCurrency(net)}</span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-brand-500">
            {selectedCount === 0 ? "Select one or more invoices." : `${selectedCount} invoice${selectedCount === 1 ? "" : "s"} selected`}
            {loadingItems ? " · Loading items..." : ""}
          </p>

          <FormField label="Warehouse" required>
            <SelectField value={warehouseId} onChange={setWarehouseId} placeholder="Select warehouse..."
              options={warehouses.map((w) => ({ value: w._id, label: w.name }))} />
          </FormField>
          {returnItems.length > 0 && (
            <div className="overflow-x-auto border border-brand-100 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-50">
                    <th className="px-2 py-1 text-left">Invoice</th>
                    <th className="px-2 py-1 text-left">Product</th>
                    <th className="px-2 py-1">Sold left</th>
                    <th className="px-2 py-1">Return Qty</th>
                    <th className="px-2 py-1">Price</th>
                    <th className="px-2 py-1">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item, idx) => (
                    <tr key={`${item.saleId}-${item.product}-${idx}`} className="border-t">
                      <td className="px-2 py-1 font-medium text-brand-700 whitespace-nowrap">{item.invoiceNumber}</td>
                      <td className="px-2 py-1">{item.productName}</td>
                      <td className="px-2 py-1 text-center text-brand-500">{item.maxQty}</td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={0}
                          max={item.maxQty}
                          step="0.01"
                          value={item.quantity || ""}
                          onChange={(e) => updateReturnQty(idx, Number(e.target.value))}
                          className="w-20 input-field py-1"
                        />
                      </td>
                      <td className="px-2 py-1">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-2 py-1">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-right font-semibold text-brand-800 text-sm">Return Total: {formatCurrency(returnTotal)}</div>
          <FormGrid cols={2}>
            <FormField label="Refund Method">
              <SelectField value={refundMethod} onChange={setRefundMethod} options={[
                { value: "cash", label: "Cash Refund" },
                { value: "credit_note", label: "Store Credit" },
                { value: "bank", label: "Bank Transfer" },
              ]} />
            </FormField>
            <FormField label="Reason">
              <input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Defective, wrong item..." />
            </FormField>
          </FormGrid>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" disabled={saving || !warehouseId || returnTotal <= 0} className="btn-primary flex-1">
              {saving ? "Processing..." : "Process Return"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
