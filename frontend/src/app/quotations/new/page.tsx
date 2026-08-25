"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormCard, FormSection, FormGrid, FormActions } from "@/components/ui/FormLayout";
import { productAPI, customerAPI, saleAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface LineItem { productId: string; productName: string; quantity: number; unitPrice: number; }

export default function NewQuotationPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Array<{ _id: string; name: string; sellingPrice: number }>>([]);
  const [customers, setCustomers] = useState<Array<{ _id: string; name: string }>>([]);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [validityDays, setValidityDays] = useState(15);
  const [terms, setTerms] = useState("Valid for 15 days. Prices subject to change.");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    productAPI.getAll({ limit: "100" }).then((r) => setProducts(r.data.data));
    customerAPI.getAll({ limit: "100" }).then((r) => setCustomers(r.data.data));
  }, []);

  const addItem = () => {
    const p = products.find((p) => p._id === selectedProduct);
    if (!p) return;
    setItems([...items, { productId: p._id, productName: p.name, quantity: 1, unitPrice: p.sellingPrice }]);
    setSelectedProduct("");
  };

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = total * (13 / 113);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!items.length) return toast.error("Add at least one item");
    setSaving(true);
    try {
      const validityDate = new Date();
      validityDate.setDate(validityDate.getDate() + validityDays);
      const customer = customers.find((c) => c._id === customerId);
      await saleAPI.create({
        type: "quotation",
        status: "pending",
        customer: customerId || undefined,
        customerName: customer?.name,
        items: items.map((i) => ({
          product: i.productId, productName: i.productName,
          quantity: i.quantity, unitPrice: i.unitPrice,
          vatRate: 13, vatAmount: (i.quantity * i.unitPrice) * (13 / 113),
          subtotal: i.quantity * i.unitPrice,
        })),
        subtotal: total, vatAmount, total,
        amountPaid: 0, amountDue: total,
        validityDate, terms, isVatBill: true,
      });
      toast.success("Quotation created!");
      router.push("/quotations");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <DashboardLayout>
      <PageHeader title="New Quotation" />

      <form onSubmit={handleSubmit}>
        <FormCard>
          <FormSection title="Quotation Details">
            <FormGrid cols={2}>
              <FormField label="Customer">
                <SelectField value={customerId} onChange={setCustomerId} placeholder="Select customer (optional)"
                  options={customers.map((c) => ({ value: c._id, label: c.name }))} />
              </FormField>
              <FormField label="Valid For (days)">
                <input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} className="input-field" min={1} />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Line Items">
            <div className="flex gap-2 mb-3">
              <SelectField value={selectedProduct} onChange={setSelectedProduct} placeholder="Select product..."
                className="flex-1"
                options={products.map((p) => ({ value: p._id, label: `${p.name}: ${formatCurrency(p.sellingPrice)}` }))} />
              <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-1 shrink-0">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {items.length > 0 && (
              <div className="border border-brand-100 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-brand-50">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-brand-600">Product</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-brand-600 w-24">Qty</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-brand-600 w-32">Price</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-brand-600">Subtotal</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-t border-brand-50">
                        <td className="px-3 py-2">{item.productName}</td>
                        <td className="px-3 py-2">
                          <input type="number" value={item.quantity} min={1}
                            onChange={(e) => setItems(items.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) } : it))}
                            className="w-full input-field py-1" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={item.unitPrice}
                            onChange={(e) => setItems(items.map((it, i) => i === idx ? { ...it, unitPrice: Number(e.target.value) } : it))}
                            className="w-full input-field py-1" />
                        </td>
                        <td className="px-3 py-2 font-medium">{formatCurrency(item.quantity * item.unitPrice)}</td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-brand-600 hover:text-brand-900">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2.5 bg-brand-50 border-t border-brand-100 text-right space-y-0.5">
                  <p className="text-xs text-brand-500">VAT (13% incl.): {formatCurrency(vatAmount)}</p>
                  <p className="text-base font-bold text-brand-800">Total: {formatCurrency(total)}</p>
                </div>
              </div>
            )}
          </FormSection>

          <FormSection title="Terms & Conditions">
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)} className="input-field min-h-[64px] resize-y" />
          </FormSection>

          <FormActions>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating..." : "Create Quotation"}</button>
            <button type="button" onClick={() => router.push("/quotations")} className="btn-secondary">Cancel</button>
          </FormActions>
        </FormCard>
      </form>
    </DashboardLayout>
  );
}
