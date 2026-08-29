"use client";

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { Search, Trash2, Package, Save, X } from "lucide-react";
import { FormField, SelectField } from "@/components/ui/FormField";
import { formatCurrency, cn } from "@/lib/utils";

export interface PurchaseVoucherItem {
  productId: string;
  productName: string;
  sku?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  description: string;
}

export interface PurchaseVoucherPayload {
  supplier: string;
  warehouse: string;
  voucherDate: string;
  dueDate: string;
  supplierInvoiceNo: string;
  notes: string;
  items: Array<{
    product: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
    vatRate: number;
    vatAmount: number;
  }>;
  subtotal: number;
  discount: number;
  discountType: string;
  vatAmount: number;
  freightCost: number;
  otherCosts: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  payments: Array<{ method: string; amount: number }>;
  status: string;
  type?: string;
  terms?: string;
}

interface ProductOption {
  _id: string;
  name: string;
  sku?: string;
  purchasePrice: number;
  currentStock?: number;
  unit?: { name?: string; symbol?: string } | string;
}

interface SupplierOption {
  _id: string;
  name: string;
  outstanding?: number;
  paymentTerms?: string;
}

interface WarehouseOption {
  _id: string;
  name: string;
}

interface PurchaseVoucherFormProps {
  suppliers: SupplierOption[];
  products: ProductOption[];
  warehouses: WarehouseOption[];
  defaultSupplierId?: string;
  saving?: boolean;
  variant?: "modal" | "embedded";
  mode?: "purchase" | "order";
  initialPurchase?: {
    _id: string;
    invoiceNumber?: string;
    supplier?: string | { _id?: string; name?: string; company?: string };
    warehouse?: string | { _id: string };
    notes?: string;
    terms?: string;
    amountPaid?: number;
    discount?: number;
    vatAmount?: number;
    otherCosts?: number;
    createdAt?: string;
    items?: Array<{
      product: string | { _id: string };
      productName: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
      vatRate?: number;
    }>;
  } | null;
  onSubmit: (payload: PurchaseVoucherPayload) => void;
  onCancel: () => void;
}

function safeNum(value: number | undefined | null, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function getProductUnit(product: ProductOption): string {
  if (!product.unit) return "Pcs";
  if (typeof product.unit === "string") return product.unit;
  return product.unit.symbol || product.unit.name || "Pcs";
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const cellInput = "w-full h-8 px-2 text-sm border border-brand-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-900/10 focus:border-brand-400";

export default function PurchaseVoucherForm({
  suppliers,
  products,
  warehouses,
  defaultSupplierId = "",
  saving = false,
  variant = "modal",
  mode = "purchase",
  initialPurchase = null,
  onSubmit,
  onCancel,
}: PurchaseVoucherFormProps) {
  const isOrder = mode === "order";
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [warehouseId, setWarehouseId] = useState("");
  const [voucherDate, setVoucherDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(30));
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [narration, setNarration] = useState("");
  const [termsConditions, setTermsConditions] = useState("");

  const [itemSearch, setItemSearch] = useState("");
  const [items, setItems] = useState<PurchaseVoucherItem[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const [includeDiscount, setIncludeDiscount] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [includeVat, setIncludeVat] = useState(true);
  const [includeOtherCharges, setIncludeOtherCharges] = useState(false);
  const [otherCharges, setOtherCharges] = useState(0);
  const [roundOff, setRoundOff] = useState(0);

  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  useEffect(() => {
    if (defaultSupplierId) setSupplierId(defaultSupplierId);
  }, [defaultSupplierId]);

  useEffect(() => {
    if (!initialPurchase) return;
    const sid = typeof initialPurchase.supplier === "object"
      ? initialPurchase.supplier._id
      : initialPurchase.supplier;
    const resolvedSupplier = sid || defaultSupplierId;
    if (resolvedSupplier) setSupplierId(resolvedSupplier);
    const wid = typeof initialPurchase.warehouse === "object"
      ? initialPurchase.warehouse._id
      : initialPurchase.warehouse || "";
    if (wid) setWarehouseId(wid);
    if (initialPurchase.createdAt) {
      setVoucherDate(new Date(initialPurchase.createdAt).toISOString().split("T")[0]);
    }
    setNarration(initialPurchase.notes || "");
    setTermsConditions(initialPurchase.terms || "");
    setAmountPaid(safeNum(initialPurchase.amountPaid));
    setIncludeDiscount(safeNum(initialPurchase.discount) > 0);
    setDiscountPercent(safeNum(initialPurchase.discount));
    setIncludeVat((initialPurchase.vatAmount || 0) > 0 || (initialPurchase.items || []).some((i) => (i.vatRate || 0) > 0));
    setIncludeOtherCharges(safeNum(initialPurchase.otherCosts) > 0);
    setOtherCharges(safeNum(initialPurchase.otherCosts));
    setItems((initialPurchase.items || []).map((item) => {
      const productId = typeof item.product === "object" ? item.product._id : String(item.product);
      const product = products.find((p) => p._id === productId);
      return {
        productId,
        productName: item.productName,
        sku: product?.sku,
        unit: product ? getProductUnit(product) : "Pcs",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        description: "",
      };
    }));
  }, [initialPurchase, defaultSupplierId, products]);

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      setWarehouseId(warehouses[0]._id);
    }
  }, [warehouses, warehouseId]);

  const filteredProducts = products.filter((p) => {
    if (!itemSearch.trim()) return false;
    const q = itemSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
  });

  const addProduct = (product: ProductOption) => {
    const existing = items.find((i) => i.productId === product._id);
    if (existing) {
      setItems(items.map((i) =>
        i.productId === product._id ? { ...i, quantity: safeNum(i.quantity) + 1 } : i
      ));
    } else {
      setItems([...items, {
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        unit: getProductUnit(product),
        quantity: 1,
        unitPrice: safeNum(product.purchasePrice),
        discount: 0,
        description: "",
      }]);
    }
    setItemSearch("");
    searchRef.current?.focus();
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filteredProducts.length > 0) {
      e.preventDefault();
      addProduct(filteredProducts[0]);
    }
  };

  const updateItem = (idx: number, field: keyof PurchaseVoucherItem, raw: string | number) => {
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      if (field === "description") return { ...item, description: String(raw) };
      if (field === "discount") {
        const discount = Math.min(100, Math.max(0, safeNum(Number(raw))));
        return { ...item, discount };
      }
      if (field === "quantity") {
        const quantity = Math.max(0, safeNum(Number(raw)));
        return { ...item, quantity };
      }
      if (field === "unitPrice") {
        const unitPrice = Math.max(0, safeNum(Number(raw)));
        return { ...item, unitPrice };
      }
      return { ...item, [field]: raw };
    }));
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const lineGross = (item: PurchaseVoucherItem) => {
    const qty = safeNum(item.quantity);
    const rate = safeNum(item.unitPrice);
    return qty * rate;
  };

  const lineTotal = (item: PurchaseVoucherItem) => {
    const disc = Math.min(100, Math.max(0, safeNum(item.discount)));
    return lineGross(item) * (1 - disc / 100);
  };

  const grossSubtotal = items.reduce((s, i) => s + lineGross(i), 0);
  const subtotal = items.reduce((s, i) => s + lineTotal(i), 0);
  const lineDiscountTotal = grossSubtotal - subtotal;
  const invoiceDiscount = includeDiscount ? subtotal * (safeNum(discountPercent) / 100) : 0;
  const taxableAmount = subtotal - invoiceDiscount;
  const vatAmount = includeVat ? taxableAmount * 0.13 : 0;
  const otherCost = includeOtherCharges ? safeNum(otherCharges) : 0;
  const total = taxableAmount + vatAmount + otherCost + safeNum(roundOff);
  const amountDue = Math.max(0, total - safeNum(amountPaid));

  const selectedSupplier = suppliers.find((s) => s._id === supplierId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !warehouseId || !items.length) return;

    onSubmit({
      supplier: supplierId,
      warehouse: warehouseId,
      voucherDate,
      dueDate,
      supplierInvoiceNo: isOrder ? "" : supplierInvoiceNo,
      notes: isOrder
        ? narration
        : [supplierInvoiceNo ? `Supplier Inv: ${supplierInvoiceNo}` : "", narration].filter(Boolean).join("\n"),
      terms: termsConditions,
      items: items.map((item) => {
        const lineSub = lineTotal(item);
        const lineShare = includeDiscount && subtotal > 0 ? (lineSub / subtotal) * invoiceDiscount : 0;
        const lineTaxable = lineSub - lineShare;
        return {
          product: item.productId,
          productName: item.productName,
          quantity: safeNum(item.quantity) || 1,
          unitPrice: safeNum(item.unitPrice),
          discount: safeNum(item.discount),
          subtotal: lineSub,
          vatRate: includeVat ? 13 : 0,
          vatAmount: includeVat ? lineTaxable * 0.13 : 0,
        };
      }),
      subtotal: taxableAmount,
      discount: includeDiscount ? safeNum(discountPercent) : 0,
      discountType: "percent",
      vatAmount,
      freightCost: 0,
      otherCosts: otherCost,
      total,
      amountPaid: isOrder ? 0 : safeNum(amountPaid),
      amountDue: isOrder ? total : amountDue,
      payments: isOrder ? [] : (safeNum(amountPaid) > 0 ? [{ method: paymentMethod, amount: safeNum(amountPaid) }] : []),
      status: isOrder ? "ordered" : "completed",
      type: isOrder ? "order" : "invoice",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
      {/* Header */}
      <div className="relative px-6 py-5 bg-brand-900 text-white shrink-0">
        {variant === "modal" && (
          <button
            type="button"
            onClick={onCancel}
            className="absolute top-4 right-4 z-10 p-2 rounded-lg text-brand-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-start justify-between gap-8 pr-10">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-brand-300 font-medium">
              {isOrder ? "Purchase Order" : "Purchase Voucher"}
            </p>
            <h3 className="text-xl font-semibold mt-1 leading-tight">
              {isOrder ? "Purchase Order" : initialPurchase ? "Edit Purchase" : "New Purchase Entry"}
            </h3>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] uppercase tracking-wide text-brand-300 font-medium">
              {isOrder ? "Order No." : "Purchase No."}
            </p>
            <p className="text-sm font-mono font-medium mt-1 text-white/95">
              {initialPurchase?.invoiceNumber || "Auto Generated"}
            </p>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="px-6 py-4 bg-brand-50/80 border-b border-brand-200 shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3">
          <FormField label={isOrder ? "Record Date" : "Voucher Date"}>
            <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} className={cn(cellInput, "text-sm")} />
          </FormField>
          {!isOrder && (
            <FormField label="Due Date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={cn(cellInput, "text-sm")} />
            </FormField>
          )}
          <FormField label={isOrder ? "Supplier / Creditor" : "Supplier"} required className="sm:col-span-2 lg:col-span-1">
            <SelectField value={supplierId} onChange={setSupplierId} placeholder="Select supplier..."
              options={suppliers.map((s) => ({
                value: s._id,
                label: s.outstanding ? `${s.name} (Due: ${formatCurrency(s.outstanding)})` : s.name,
              }))} />
          </FormField>
          <FormField label="Warehouse" required>
            <SelectField value={warehouseId} onChange={setWarehouseId} placeholder="Select warehouse..."
              options={warehouses.map((w) => ({ value: w._id, label: w.name }))} />
          </FormField>
          {!isOrder && (
            <FormField label="Supplier Invoice No." className="sm:col-span-2 lg:col-span-1">
              <input type="text" value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                className={cn(cellInput, "text-sm")} placeholder="Bill / invoice ref" />
            </FormField>
          )}
          {isOrder && (
            <FormField label="Expected Delivery" className="sm:col-span-2 lg:col-span-1">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={cn(cellInput, "text-sm")} />
            </FormField>
          )}
        </div>
        {selectedSupplier && safeNum(selectedSupplier.outstanding) > 0 && (
          <p className="text-xs text-brand-600 mt-3 pt-3 border-t border-brand-200/80">
            Payable to supplier: <span className="font-semibold">{formatCurrency(selectedSupplier.outstanding!)}</span>
          </p>
        )}
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-brand-100 bg-white shrink-0">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search item by name or SKU. Press Enter to add"
            className="input-field pl-10 h-9 text-sm"
          />
        </div>
        {itemSearch.trim() && filteredProducts.length > 0 && (
          <div className="mt-2 max-w-2xl border border-brand-200 rounded-lg overflow-hidden max-h-32 overflow-y-auto shadow-sm bg-white">
            {filteredProducts.slice(0, 8).map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => addProduct(p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 flex justify-between items-center gap-3 border-b border-brand-50 last:border-0"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-brand-900">{p.name}</span>
                  {p.sku && <span className="text-brand-400 ml-2 text-xs">{p.sku}</span>}
                </span>
                <span className="text-xs text-brand-500 shrink-0">
                  {formatCurrency(p.purchasePrice)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Items table */}
      <div className="px-6 py-4 flex-1 min-h-[180px]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-brand-400 border border-dashed border-brand-200 rounded-xl bg-brand-50/30">
            <Package className="w-9 h-9 mb-2 opacity-40" />
            <p className="text-sm font-medium">No items added</p>
            <p className="text-xs mt-1">Search products above to begin</p>
          </div>
        ) : (
          <div className="border border-brand-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm table-fixed">
              <colgroup>
                <col className="w-10" />
                <col className="w-[min(28%,200px)]" />
                <col className="w-20" />
                <col className="w-16" />
                <col className="w-24" />
                <col className="w-20" />
                <col className="w-28" />
                <col />
                <col className="w-10" />
              </colgroup>
              <thead>
                <tr className="bg-brand-800 text-white text-[11px] uppercase tracking-wider">
                  <th className="px-2 py-2.5 text-center font-semibold">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Item</th>
                  <th className="px-2 py-2.5 text-center font-semibold">Qty</th>
                  <th className="px-2 py-2.5 text-center font-semibold">Unit</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Rate</th>
                  <th className="px-2 py-2.5 text-center font-semibold">Disc%</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Value</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                  <th className="px-1 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100 bg-white">
                {items.map((item, idx) => {
                  const gross = lineGross(item);
                  const net = lineTotal(item);
                  const hasDisc = safeNum(item.discount) > 0;
                  return (
                    <tr key={item.productId} className="hover:bg-brand-50/40 align-middle">
                      <td className="px-2 py-2.5 text-center text-brand-400 text-xs">{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-brand-900 text-sm leading-snug truncate" title={item.productName}>{item.productName}</p>
                        {item.sku && <p className="text-[10px] text-brand-400 mt-0.5">{item.sku}</p>}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={item.quantity || ""}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          className={cn(cellInput, "text-center")}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-center text-xs text-brand-500">{item.unit}</td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.unitPrice || ""}
                          onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                          className={cn(cellInput, "text-right")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.discount || ""}
                          onChange={(e) => updateItem(idx, "discount", e.target.value)}
                          className={cn(cellInput, "text-center")}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <p className="font-semibold text-brand-900 text-sm tabular-nums">{formatCurrency(net)}</p>
                        {hasDisc && gross > net && (
                          <p className="text-[10px] text-brand-400 line-through tabular-nums">{formatCurrency(gross)}</p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          className={cn(cellInput, "text-xs")}
                          placeholder="Optional"
                        />
                      </td>
                      <td className="px-1 py-2 text-center">
                        <button type="button" onClick={() => removeItem(idx)} className="p-1.5 rounded-md text-brand-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-brand-50 border-t border-brand-200 grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start shrink-0">
        <div className="bg-white border border-brand-200 rounded-xl p-4 space-y-3 h-full">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Options & Notes</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {[
              { id: "inv-disc", checked: includeDiscount, set: setIncludeDiscount, label: "Invoice Discount" },
              { id: "vat", checked: includeVat, set: setIncludeVat, label: "VAT (13%)" },
              { id: "other", checked: includeOtherCharges, set: setIncludeOtherCharges, label: "Other Charges" },
            ].map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer text-brand-700">
                <input type="checkbox" checked={opt.checked} onChange={(e) => opt.set(e.target.checked)} className="rounded border-brand-300 text-brand-900" />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {includeDiscount && (
              <FormField label="Invoice Discount (%)">
                <input type="number" min={0} max={100} value={discountPercent || ""}
                  onChange={(e) => setDiscountPercent(safeNum(Number(e.target.value)))} className={cellInput} />
              </FormField>
            )}
            {includeOtherCharges && (
              <FormField label="Other Charges">
                <input type="number" min={0} value={otherCharges || ""}
                  onChange={(e) => setOtherCharges(safeNum(Number(e.target.value)))} className={cellInput} />
              </FormField>
            )}
          </div>
          <div className={cn("grid gap-3", isOrder ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
            <FormField label={isOrder ? "Narration" : "Narration / Notes"}>
              <textarea
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                className="input-field min-h-[88px] resize-y text-sm"
                placeholder="Additional notes..."
              />
            </FormField>
            {isOrder && (
              <FormField label="Terms & Conditions">
                <textarea
                  value={termsConditions}
                  onChange={(e) => setTermsConditions(e.target.value)}
                  className="input-field min-h-[88px] resize-y text-sm"
                  placeholder="Payment terms, delivery conditions..."
                />
              </FormField>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-white border border-brand-200 rounded-xl p-4 space-y-0 divide-y divide-brand-100 text-sm">
            {[
              { label: "Amount", value: formatCurrency(grossSubtotal) },
              ...(lineDiscountTotal > 0 ? [{ label: "Line Discounts", value: `−${formatCurrency(lineDiscountTotal)}`, accent: true }] : []),
              ...(includeDiscount && invoiceDiscount > 0 ? [{ label: `Invoice Discount (${discountPercent}%)`, value: `−${formatCurrency(invoiceDiscount)}`, accent: true }] : []),
              ...(includeVat ? [{ label: "VAT (13%)", value: formatCurrency(vatAmount) }] : []),
              ...(includeOtherCharges && otherCost > 0 ? [{ label: "Other Charges", value: formatCurrency(otherCost) }] : []),
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-2 first:pt-0">
                <span className="text-brand-600">{row.label}</span>
                <span className={cn("font-medium tabular-nums", row.accent ? "text-red-600" : "text-brand-900")}>{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center py-2">
              <span className="text-brand-600">Round Off</span>
              <input
                type="number"
                step="any"
                value={roundOff || ""}
                onChange={(e) => setRoundOff(safeNum(Number(e.target.value)))}
                className={cn(cellInput, "w-28 text-right")}
              />
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="font-semibold text-brand-900">Total Amount</span>
              <span className="text-lg font-bold text-brand-900 tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>

          {!isOrder && (
          <div className="bg-white border border-brand-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Payment</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Amount Paid">
                <input type="number" min={0} value={amountPaid || ""}
                  onChange={(e) => setAmountPaid(safeNum(Number(e.target.value)))} className={cellInput} />
              </FormField>
              <FormField label="Payment Method">
                <SelectField value={paymentMethod} onChange={setPaymentMethod} options={[
                  { value: "cash", label: "Cash" },
                  { value: "bank", label: "Bank" },
                  { value: "cheque", label: "Cheque" },
                  { value: "credit", label: "Credit" },
                ]} />
              </FormField>
            </div>
            <div className="flex justify-between items-center text-sm font-semibold bg-brand-900 text-white rounded-lg px-4 py-2.5">
              <span>Total Payable (Due)</span>
              <span className="tabular-nums">{formatCurrency(amountDue)}</span>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-3.5 border-t border-brand-200 bg-white flex items-center justify-between gap-3 shrink-0">
        <button type="button" onClick={onCancel} className="btn-secondary flex items-center gap-2 h-10 px-4">
          <X className="w-4 h-4" /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !supplierId || !warehouseId || items.length === 0}
          className={cn("btn-primary flex items-center gap-2 h-10 px-8", saving && "opacity-70")}
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : isOrder ? "Save Purchase Order" : initialPurchase ? "Update Purchase" : "Save Purchase"}
        </button>
      </div>
    </form>
  );
}
