"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { cafeAPI, productAPI, miscAPI } from "@/lib/api";
import { cafeBillTotals } from "@/lib/cafeBill";
import { cn, formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";

type TableRow = {
  _id: string;
  name: string;
  seats: number;
  status: string;
  openBill?: OpenBill | null;
};

type BillLine = {
  product?: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  subtotal: number;
};

type OpenBill = {
  _id: string;
  invoiceNumber?: string;
  items?: BillLine[];
  subtotal?: number;
  serviceChargeAmount?: number;
  serviceChargePercent?: number;
  vatAmount?: number;
  total?: number;
  isVatBill?: boolean;
};

type MenuProduct = {
  _id: string;
  name: string;
  sku?: string;
  sellingPrice: number;
  currentStock?: number;
};

function lineSubtotal(qty: number, price: number, discount = 0) {
  const gross = Math.max(0, qty) * Math.max(0, price);
  return Math.round(Math.max(0, gross - (gross * Math.max(0, discount)) / 100) * 100) / 100;
}

export default function CafeTablesPage() {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("4");
  const [active, setActive] = useState<TableRow | null>(null);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [serviceChargePercent, setServiceChargePercent] = useState(10);
  const [includeVat, setIncludeVat] = useState(true);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatRate, setVatRate] = useState(13);
  const [saving, setSaving] = useState(false);
  const [loadingBill, setLoadingBill] = useState(false);
  const [menu, setMenu] = useState<MenuProduct[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    cafeAPI.getTables()
      .then((r) => setRows(r.data.data || []))
      .catch(() => toast.error("Could not load tables"));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    miscAPI.getSettings().then((r) => {
      const data = r.data.data || {};
      const enabled = data.vatEnabled !== false;
      setVatEnabled(enabled);
      if (Number.isFinite(Number(data.vatRate))) setVatRate(Number(data.vatRate));
      if (Number.isFinite(Number(data.serviceChargePercent))) setServiceChargePercent(Number(data.serviceChargePercent));
      if (!enabled) setIncludeVat(false);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      cafeAPI.getMenu().catch(() => ({ data: { data: [] } })),
      productAPI.getAll({ limit: "200", pos: "1" }).catch(() => ({ data: { data: [] } })),
    ]).then(([menuRes, productRes]) => {
      const fromMenu = (menuRes.data.data || []) as MenuProduct[];
      const fromProducts = (productRes.data.data || []) as MenuProduct[];
      const byId = new Map<string, MenuProduct>();
      [...fromProducts, ...fromMenu].forEach((p) => {
        if (p?._id) byId.set(p._id, p);
      });
      setMenu([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, []);

  const food = useMemo(
    () => lines.reduce((sum, line) => sum + lineSubtotal(line.quantity, line.unitPrice, line.discount || 0), 0),
    [lines]
  );
  const totals = useMemo(
    () => cafeBillTotals({
      food,
      serviceChargePercent,
      vatRate,
      includeVat: vatEnabled && includeVat,
      serviceType: "dine_in",
    }),
    [food, serviceChargePercent, includeVat, vatEnabled, vatRate]
  );

  const filteredMenu = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const list = q
      ? menu.filter((p) => p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
      : menu;
    return list.slice(0, 40);
  }, [menu, productQuery]);

  const openTable = async (row: TableRow) => {
    setActive(row);
    setLoadingBill(true);
    setShowAdd(false);
    setProductQuery("");
    try {
      const res = await cafeAPI.getTableBill(row._id);
      const sale = res.data.data?.sale as OpenBill | null;
      const nextLines = (sale?.items || []).map((item) => ({
        product: item.product ? String(item.product) : undefined,
        productName: item.productName,
        sku: item.sku,
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        discount: Number(item.discount) || 0,
        subtotal: lineSubtotal(Number(item.quantity) || 1, Number(item.unitPrice) || 0, Number(item.discount) || 0),
      }));
      setLines(nextLines);
      setSaleId(sale?._id || null);
      setInvoiceNumber(sale?.invoiceNumber || "");
      setServiceChargePercent(Number(sale?.serviceChargePercent) || 10);
      setIncludeVat(sale?.isVatBill !== false);
    } catch {
      toast.error("Could not open table bill");
      setActive(null);
    } finally {
      setLoadingBill(false);
    }
  };

  const closeModal = () => {
    setActive(null);
    setLines([]);
    setSaleId(null);
    setInvoiceNumber("");
    setShowAdd(false);
  };

  const updateLine = (index: number, patch: Partial<BillLine>) => {
    setLines((prev) => prev.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...patch };
      next.subtotal = lineSubtotal(next.quantity, next.unitPrice, next.discount || 0);
      return next;
    }).filter((line) => line.quantity > 0));
  };

  const addProduct = (product: MenuProduct) => {
    setLines((prev) => {
      const existing = prev.findIndex((line) => line.product === product._id);
      if (existing >= 0) {
        return prev.map((line, i) => {
          if (i !== existing) return line;
          const quantity = line.quantity + 1;
          return { ...line, quantity, subtotal: lineSubtotal(quantity, line.unitPrice, line.discount || 0) };
        });
      }
      return [
        ...prev,
        {
          product: product._id,
          productName: product.name,
          sku: product.sku,
          quantity: 1,
          unitPrice: Number(product.sellingPrice) || 0,
          discount: 0,
          subtotal: Number(product.sellingPrice) || 0,
        },
      ];
    });
    setShowAdd(false);
    setProductQuery("");
  };

  const saveBill = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const payload = {
        isVatBill: includeVat,
        serviceType: "dine_in",
        items: lines.map((line) => ({
          product: line.product,
          productName: line.productName,
          sku: line.sku,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount || 0,
          discountType: "percent",
          subtotal: lineSubtotal(line.quantity, line.unitPrice, line.discount || 0),
        })),
      };
      const res = await cafeAPI.saveTableBill(active._id, payload);
      const sale = res.data.data?.sale as OpenBill | null;
      setSaleId(sale?._id || null);
      setInvoiceNumber(sale?.invoiceNumber || "");
      if (sale?.serviceChargePercent != null) setServiceChargePercent(Number(sale.serviceChargePercent) || 10);
      toast.success(sale ? "Table bill saved" : "Table cleared");
      load();
      if (!sale) closeModal();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not save table bill");
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    try {
      await cafeAPI.createTable({ name, seats: Number(seats) || 4 });
      setName("");
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not add table");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Tables" subtitle="Tap a table to view, edit, or add items" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 max-w-xl">
        <input className="input-field flex-1" placeholder="T1" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input-field w-24" type="number" value={seats} onChange={(e) => setSeats(e.target.value)} />
        <button type="button" className="btn-primary" onClick={add}>Add table</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {rows.map((row) => {
          const occupied = row.status === "occupied" || row.status === "booked" || Boolean(row.openBill);
          const billTotal = row.openBill?.total;
          const itemCount = row.openBill?.items?.length || 0;
          return (
            <button
              key={row._id}
              type="button"
              onClick={() => void openTable(row)}
              className={cn(
                "rounded-xl border p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-400",
                occupied
                  ? "border-red-200 bg-red-50"
                  : "border-emerald-200 bg-emerald-50"
              )}
            >
              <p className={cn("font-semibold", occupied ? "text-red-900" : "text-emerald-900")}>{row.name}</p>
              <p className={cn("text-sm", occupied ? "text-red-700" : "text-emerald-700")}>
                {row.seats} seats · {occupied ? "booked" : "free"}
              </p>
              {occupied && (
                <p className="text-xs mt-2 font-medium text-red-800">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                  {billTotal != null ? ` · ${formatCurrency(billTotal)}` : ""}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <Modal
        open={Boolean(active)}
        onClose={closeModal}
        title={active ? `${active.name} · ${active.seats} seats` : "Table"}
        size="lg"
      >
        {loadingBill ? (
          <p className="text-sm text-brand-400 py-10 text-center">Loading bill…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="text-brand-500">
                {invoiceNumber ? (
                  <span>Open bill <span className="font-medium text-brand-800">{invoiceNumber}</span></span>
                ) : (
                  <span>New table order</span>
                )}
              </div>
              <button type="button" className="btn-secondary text-sm" onClick={() => setShowAdd((v) => !v)}>
                {showAdd ? "Hide menu" : "+ Add item"}
              </button>
            </div>

            {showAdd && (
              <div className="rounded-xl border border-brand-100 p-3 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                  <input
                    className="input-field pl-10"
                    placeholder="Search menu…"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-brand-50 rounded-lg border border-brand-100">
                  {filteredMenu.length === 0 ? (
                    <p className="text-xs text-brand-400 text-center py-4">No products found</p>
                  ) : filteredMenu.map((product) => (
                    <button
                      key={product._id}
                      type="button"
                      onClick={() => addProduct(product)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-brand-50"
                    >
                      <span className="text-sm font-medium text-brand-900 truncate">{product.name}</span>
                      <span className="text-xs font-semibold text-brand-700 shrink-0">{formatCurrency(product.sellingPrice)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-brand-200 py-10 text-center text-sm text-brand-400">
                No items yet. Tap <span className="font-medium text-brand-700">+ Add item</span> to start the bill.
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={`${line.product || line.productName}-${index}`} className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-brand-900 truncate">{line.productName}</p>
                        <p className="text-xs text-brand-500">{formatCurrency(line.subtotal)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateLine(index, { quantity: 0 })}
                        className="p-1.5 rounded-md text-brand-400 hover:text-red-700 hover:bg-red-50"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="label">Qty</label>
                        <div className="flex items-center gap-1">
                          <button type="button" className="w-8 h-8 rounded-md border border-brand-200 bg-white" onClick={() => updateLine(index, { quantity: Math.max(0, line.quantity - 1) })}>
                            <Minus className="w-3.5 h-3.5 mx-auto" />
                          </button>
                          <input
                            type="number"
                            min={0.01}
                            step="any"
                            className="input-field text-center py-1.5"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, { quantity: Number(e.target.value) || 0 })}
                          />
                          <button type="button" className="w-8 h-8 rounded-md border border-brand-200 bg-white" onClick={() => updateLine(index, { quantity: line.quantity + 1 })}>
                            <Plus className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="label">Unit price</label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="input-field py-1.5"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label className="label">Disc %</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          className="input-field py-1.5"
                          value={line.discount || 0}
                          onChange={(e) => updateLine(index, { discount: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-brand-100 p-4 space-y-2 bg-white">
              <div className="flex justify-between text-sm">
                <span className="text-brand-500">Food</span>
                <span>{formatCurrency(totals.food)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-500">Service ({serviceChargePercent}%)</span>
                <span>{formatCurrency(totals.serviceCharge)}</span>
              </div>
              {vatEnabled && (
              <div className="flex justify-between text-sm items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-brand-500">VAT ({vatRate}%)</span>
                  <button
                    type="button"
                    onClick={() => setIncludeVat((v) => !v)}
                    className={cn(
                      "text-[11px] font-medium px-2 py-0.5 rounded border",
                      includeVat ? "bg-brand-900 text-white border-brand-900" : "bg-white text-brand-600 border-brand-200"
                    )}
                  >
                    {includeVat ? "On" : "Off"}
                  </button>
                </div>
                <span>{formatCurrency(totals.vatAmount)}</span>
              </div>
              )}
              <div className="flex justify-between text-lg font-bold text-brand-900 pt-2 border-t border-brand-100">
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={closeModal}>
                <X className="w-4 h-4 inline mr-1" /> Close
              </button>
              {saleId && (
                <Link
                  href={`/pos?table=${active?._id || ""}&held=${saleId}`}
                  className="btn-secondary"
                >
                  Open in POS
                </Link>
              )}
              <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveBill()}>
                {saving ? "Saving…" : lines.length ? "Save bill" : "Clear table"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
