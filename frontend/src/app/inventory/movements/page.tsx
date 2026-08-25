"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { miscAPI, productAPI, inventoryAPI } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { ArrowUpCircle, ArrowDownCircle, Plus } from "lucide-react";
import toast from "react-hot-toast";

interface Movement {
  _id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  reference?: string;
  notes?: string;
  product: { name: string; sku: string };
  warehouse: { name: string };
  createdBy?: { name: string };
  createdAt: string;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  opening: { label: "Opening", color: "badge" },
  purchase: { label: "Purchase", color: "badge" },
  sale: { label: "Sale", color: "badge" },
  adjustment_plus: { label: "Adjustment +", color: "badge" },
  adjustment_minus: { label: "Adjustment -", color: "badge" },
  damage: { label: "Damage", color: "badge" },
};

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [products, setProducts] = useState<Array<{ _id: string; name: string; currentStock: number }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [adjustForm, setAdjustForm] = useState({ productId: "", warehouseId: "", quantity: "", type: "add", reason: "" });

  const load = () => {
    setLoading(true);
    miscAPI.getStockMovements({ limit: "100" })
      .then((r) => setMovements(r.data.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    productAPI.getAll({ limit: "100" }).then((r) => setProducts(r.data.data));
    miscAPI.getWarehouses().then((r) => setWarehouses(r.data.data));
  }, []);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await inventoryAPI.adjustStock({
        productId: adjustForm.productId,
        warehouseId: adjustForm.warehouseId,
        quantity: Number(adjustForm.quantity),
        type: adjustForm.type,
        reason: adjustForm.reason,
      });
      toast.success("Stock adjusted!");
      setShowAdjust(false);
      setAdjustForm({ productId: "", warehouseId: "", quantity: "", type: "add", reason: "" });
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Adjustment failed");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Stock Movements"
        action={
          <button onClick={() => setShowAdjust(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Stock Adjustment
          </button>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Product</th>
              <th className="table-header">Type</th>
              <th className="table-header">Qty</th>
              <th className="table-header">Balance</th>
              <th className="table-header">Reference</th>
              <th className="table-header">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="table-cell"><div className="h-10 bg-brand-50 rounded animate-pulse" /></td></tr>
              ))
            ) : movements.length === 0 ? (
              <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400">No stock movements yet</td></tr>
            ) : movements.map((m) => (
              <tr key={m._id} className="hover:bg-brand-50/50">
                <td className="table-cell text-gray-500 text-sm">{formatDateTime(m.createdAt)}</td>
                <td className="table-cell">
                  <p className="font-medium">{m.product?.name}</p>
                  <p className="text-xs text-gray-400">{m.product?.sku}</p>
                </td>
                <td className="table-cell">
                  <span className={`badge ${typeLabels[m.type]?.color || "bg-gray-100"}`}>
                    {typeLabels[m.type]?.label || m.type}
                  </span>
                </td>
                <td className="table-cell">
                  <span className={`flex items-center gap-1 font-medium ${m.quantity > 0 ? "text-brand-900" : "text-brand-700"}`}>
                    {m.quantity > 0 ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                    {m.quantity > 0 ? "+" : ""}{m.quantity}
                  </span>
                </td>
                <td className="table-cell font-medium">{m.balanceAfter}</td>
                <td className="table-cell text-gray-500">{m.reference || ""}</td>
                <td className="table-cell">{m.createdBy?.name || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showAdjust} onClose={() => setShowAdjust(false)} title="Stock Adjustment">
        <form onSubmit={handleAdjust} className="form-modal">
          <FormGrid cols={2}>
            <FormField label="Product" required>
              <SelectField value={adjustForm.productId} onChange={(v) => setAdjustForm({ ...adjustForm, productId: v })}
                placeholder="Select product"
                options={products.map((p) => ({ value: p._id, label: `${p.name} (Stock: ${p.currentStock})` }))} />
            </FormField>
            <FormField label="Warehouse" required>
              <SelectField value={adjustForm.warehouseId} onChange={(v) => setAdjustForm({ ...adjustForm, warehouseId: v })}
                placeholder="Select warehouse"
                options={warehouses.map((w) => ({ value: w._id, label: w.name }))} />
            </FormField>
            <FormField label="Adjustment Type">
              <SelectField value={adjustForm.type} onChange={(v) => setAdjustForm({ ...adjustForm, type: v })}
                options={[{ value: "add", label: "Add Stock (+)" }, { value: "remove", label: "Remove Stock (-)" }]} />
            </FormField>
            <FormField label="Quantity" required>
              <input type="number" className="input-field" value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} min={1} required />
            </FormField>
          </FormGrid>
          <FormField label="Reason">
            <input className="input-field" value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="Count correction, shrinkage, etc." />
          </FormField>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" className="btn-primary">Apply Adjustment</button>
            <button type="button" onClick={() => setShowAdjust(false)} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
