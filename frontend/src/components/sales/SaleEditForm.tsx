"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { FormField, SearchableSelect } from "@/components/ui/FormField";
import { formatCurrency } from "@/lib/utils";

export interface SaleEditPayload {
  customer?: string;
  customerName?: string;
  customerPhone?: string;
  electrician?: string;
  items: Array<{
    product: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    discountType: string;
    vatRate: number;
    vatAmount: number;
    subtotal: number;
  }>;
  subtotal: number;
  vatAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  payments: Array<{ method: string; amount: number }>;
  notes?: string;
}

interface ProductOption {
  _id: string;
  name: string;
  sellingPrice: number;
}

interface CustomerOption {
  _id: string;
  name: string;
  phone?: string;
}

interface SaleItem {
  product: string | { _id: string };
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface SaleForEdit {
  _id: string;
  invoiceNumber: string;
  customer?: string | { _id: string; name?: string; phone?: string };
  customerName?: string;
  electrician?: string | { _id: string };
  notes?: string;
  amountPaid?: number;
  items?: SaleItem[];
}

interface Line {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

function productIdOf(item: SaleItem): string {
  return typeof item.product === "string" ? item.product : item.product?._id || "";
}

function customerIdOf(sale: SaleForEdit): string {
  if (!sale.customer) return "";
  return typeof sale.customer === "string" ? sale.customer : sale.customer._id;
}

function electricianIdOf(sale: SaleForEdit): string | undefined {
  if (!sale.electrician) return undefined;
  return typeof sale.electrician === "string" ? sale.electrician : sale.electrician._id;
}

export default function SaleEditForm({
  sale,
  products,
  customers,
  saving,
  onSubmit,
  onCancel,
}: {
  sale: SaleForEdit;
  products: ProductOption[];
  customers: CustomerOption[];
  saving?: boolean;
  onSubmit: (payload: SaleEditPayload) => void;
  onCancel: () => void;
}) {
  const [customerId, setCustomerId] = useState(customerIdOf(sale));
  const [notes, setNotes] = useState(sale.notes || "");
  const [amountPaid, setAmountPaid] = useState(Number(sale.amountPaid) || 0);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [items, setItems] = useState<Line[]>(
    (sale.items || []).map((item) => ({
      productId: productIdOf(item),
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }))
  );

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p._id, label: `${p.name} (${formatCurrency(p.sellingPrice)})` })),
    [products]
  );
  const customerOptions = useMemo(
    () => [
      { value: "", label: "Walk-in" },
      ...customers.map((c) => ({ value: c._id, label: c.phone ? `${c.name} · ${c.phone}` : c.name })),
    ],
    [customers]
  );

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = subtotal * (13 / 113);
  const total = subtotal;
  const paid = Math.min(Math.max(0, amountPaid), total);
  const amountDue = Math.max(0, total - paid);

  const addItem = () => {
    const product = products.find((p) => p._id === selectedProduct);
    if (!product) return;
    setItems((prev) => [
      ...prev,
      { productId: product._id, productName: product.name, quantity: 1, unitPrice: product.sellingPrice },
    ]);
    setSelectedProduct("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!items.length) return;
    const customer = customers.find((c) => c._id === customerId);
    const payments = [
      ...(paid > 0 ? [{ method: "cash", amount: paid }] : []),
      ...(amountDue > 0 ? [{ method: "credit", amount: amountDue }] : []),
    ];
    onSubmit({
      customer: customerId || undefined,
      customerName: customer?.name || (customerId ? undefined : "Walk-in"),
      customerPhone: customer?.phone,
      electrician: electricianIdOf(sale),
      items: items.map((i) => {
        const line = i.quantity * i.unitPrice;
        return {
          product: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: 0,
          discountType: "percent",
          vatRate: 13,
          vatAmount: line * (13 / 113),
          subtotal: line,
        };
      }),
      subtotal,
      vatAmount,
      total,
      amountPaid: paid,
      amountDue,
      payments,
      notes,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Edit {sale.invoiceNumber}</h2>
          <p className="text-sm text-gray-500">Stock and customer balance will be reversed, then posted again.</p>
        </div>
        <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-brand-100 text-gray-500">
          <X className="w-5 h-5" />
        </button>
      </div>

      <FormField label="Customer">
        <SearchableSelect
          value={customerId}
          onChange={setCustomerId}
          options={customerOptions}
          placeholder="Walk-in"
        />
      </FormField>

      <div className="flex gap-2 items-end">
        <FormField label="Add product" className="flex-1">
          <SearchableSelect
            value={selectedProduct}
            onChange={setSelectedProduct}
            options={productOptions}
            placeholder="Search product..."
          />
        </FormField>
        <button type="button" onClick={addItem} className="btn-secondary inline-flex items-center gap-1 mb-0.5">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="overflow-x-auto border border-brand-100 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Product</th>
              <th className="table-header w-24">Qty</th>
              <th className="table-header w-32">Price</th>
              <th className="table-header w-32">Amount</th>
              <th className="table-header w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-cell text-center text-gray-400 py-8">Add at least one item</td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={`${item.productId}-${index}`}>
                  <td className="table-cell">{item.productName}</td>
                  <td className="table-cell">
                    <input
                      type="number"
                      min={0.01}
                      step="any"
                      value={item.quantity}
                      onChange={(e) => {
                        const quantity = Number(e.target.value) || 0;
                        setItems((prev) => prev.map((row, i) => (i === index ? { ...row, quantity } : row)));
                      }}
                      className="input-field py-1"
                    />
                  </td>
                  <td className="table-cell">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const unitPrice = Number(e.target.value) || 0;
                        setItems((prev) => prev.map((row, i) => (i === index ? { ...row, unitPrice } : row)));
                      }}
                      className="input-field py-1"
                    />
                  </td>
                  <td className="table-cell font-medium">{formatCurrency(item.quantity * item.unitPrice)}</td>
                  <td className="table-cell">
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="Amount paid">
          <input
            type="number"
            min={0}
            step="any"
            value={amountPaid}
            onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
            className="input-field"
          />
        </FormField>
        <FormField label="Due">
          <div className="input-field bg-brand-50">{formatCurrency(amountDue)}</div>
        </FormField>
        <FormField label="Total">
          <div className="input-field bg-brand-50 font-semibold">{formatCurrency(total)}</div>
        </FormField>
      </div>

      <FormField label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input-field" />
      </FormField>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving || !items.length} className="btn-primary inline-flex items-center gap-2">
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
