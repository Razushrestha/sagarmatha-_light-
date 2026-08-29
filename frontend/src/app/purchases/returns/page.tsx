"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField, SelectField, SearchableSelect } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { supplierAPI, miscAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { RotateCcw, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

export default function PurchaseReturnsPage() {
  const [returns, setReturns] = useState<Array<{
    _id: string; returnNumber: string; total: number;
    supplier?: { name: string }; originalPurchase?: { _id?: string; invoiceNumber: string; items?: Array<{ product: string; productName: string; quantity: number; unitPrice: number }> };
    refundMethod: string; createdAt: string; reason?: string; warehouse?: string | { _id: string };
    items?: Array<{ product: string; productName: string; quantity: number; unitPrice: number; subtotal: number }>;
  }>>([]);
  const [purchases, setPurchases] = useState<Array<{
    _id: string; invoiceNumber: string; total: number;
    warehouse?: string | { _id: string; name?: string };
    supplier?: { name: string };
    items: Array<{ product: string; productName: string; quantity: number; unitPrice: number }>;
  }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState("");
  const [returnItems, setReturnItems] = useState<Array<{
    product: string; productName: string; maxQty: number;
    quantity: number; unitPrice: number; subtotal: number;
  }>>([]);
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("credit_note");
  const [saving, setSaving] = useState(false);
  const [editingReturn, setEditingReturn] = useState<(typeof returns)[number] | null>(null);

  const load = () => {
    supplierAPI.getReturns().then((r) => setReturns(r.data.data));
    supplierAPI.getPurchases({ limit: "50" }).then((r) => setPurchases(r.data.data));
  };

  useEffect(() => {
    load();
    miscAPI.getWarehouses().then((r) => {
      const list = r.data.data;
      setWarehouses(list);
      if (list.length > 0) setWarehouseId((prev) => prev || list[0]._id);
    });
  }, []);

  const resolveWarehouseId = (warehouse?: string | { _id: string }) => {
    if (!warehouse) return "";
    return typeof warehouse === "object" ? warehouse._id : warehouse;
  };

  const selectPurchase = (purchaseId: string) => {
    setSelectedPurchase(purchaseId);
    const purchase = purchases.find((p) => p._id === purchaseId);
    if (purchase) {
      const purchaseWarehouse = resolveWarehouseId(purchase.warehouse);
      if (purchaseWarehouse) setWarehouseId(purchaseWarehouse);
      setReturnItems(purchase.items.map((i) => ({
        product: typeof i.product === "object" ? (i.product as { _id: string })._id : String(i.product),
        productName: i.productName,
        maxQty: i.quantity,
        quantity: 0,
        unitPrice: i.unitPrice,
        subtotal: 0,
      })));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = returnItems.filter((i) => i.quantity > 0);
    if (!selectedPurchase || !items.length) return toast.error("Select purchase and return quantities");
    if (!warehouseId) return toast.error("Select a warehouse");
    setSaving(true);
    try {
      const payload = {
        items, subtotal: returnTotal, total: returnTotal,
        vatAmount: returnTotal * 0.13, refundMethod, reason, warehouse: warehouseId,
      };
      if (editingReturn) {
        await supplierAPI.updatePurchaseReturn(editingReturn._id, payload);
        toast.success("Return updated!");
      } else {
        await supplierAPI.createPurchaseReturn(selectedPurchase, payload);
        toast.success("Purchase return processed!");
      }
      setShowModal(false);
      setEditingReturn(null);
      setSelectedPurchase("");
      setReturnItems([]);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Return failed");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = async (returnId: string) => {
    try {
      const res = await supplierAPI.getReturn(returnId);
      const data = res.data.data;
      setEditingReturn(data);
      setRefundMethod(data.refundMethod || "credit_note");
      setReason(data.reason || "");
      const purchaseId = data.originalPurchase?._id || "";
      setSelectedPurchase(purchaseId);
      const purchase = purchases.find((p) => p._id === purchaseId);
      const sourceItems = purchase?.items || data.originalPurchase?.items || [];
      const qtyByProduct: Record<string, number> = {};
      for (const item of data.items || []) {
        const pid = typeof item.product === "object" ? item.product._id : String(item.product);
        qtyByProduct[pid] = item.quantity;
      }
      const purchaseWarehouse = resolveWarehouseId(data.warehouse || data.originalPurchase?.warehouse);
      if (purchaseWarehouse) setWarehouseId(purchaseWarehouse);
      setReturnItems(sourceItems.map((i: { product: string | { _id: string }; productName: string; quantity: number; unitPrice: number }) => {
        const product = typeof i.product === "object" ? i.product._id : String(i.product);
        const quantity = qtyByProduct[product] || 0;
        return {
          product,
          productName: i.productName,
          maxQty: i.quantity,
          quantity,
          unitPrice: i.unitPrice,
          subtotal: quantity * i.unitPrice,
        };
      }));
      setShowModal(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to load return");
    }
  };

  const handleDelete = async (r: { _id: string; returnNumber: string }) => {
    if (!window.confirm(`Delete ${r.returnNumber}? Stock and supplier balance will be restored.`)) return;
    try {
      await supplierAPI.deletePurchaseReturn(r._id);
      toast.success("Return deleted");
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to delete return");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Purchase Returns"
        action={
          <button onClick={() => { setEditingReturn(null); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> New Return
          </button>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Return #</th>
              <th className="table-header">Original PO</th>
              <th className="table-header">Supplier</th>
              <th className="table-header">Return Amount</th>
              <th className="table-header">Method</th>
              <th className="table-header">Date</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {returns.length === 0 ? (
              <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400">No purchase returns yet</td></tr>
            ) : returns.map((r) => (
              <tr key={r._id} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium text-brand-700">{r.returnNumber}</td>
                <td className="table-cell">{r.originalPurchase?.invoiceNumber}</td>
                <td className="table-cell">{r.supplier?.name || ""}</td>
                <td className="table-cell font-medium">{formatCurrency(r.total)}</td>
                <td className="table-cell capitalize">{r.refundMethod?.replace("_", " ")}</td>
                <td className="table-cell text-gray-500">{formatDateTime(r.createdAt)}</td>
                <td className="table-cell text-right">
                  <div className="inline-flex items-center justify-end gap-1">
                    <button type="button" onClick={() => openEdit(r._id)} className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(r)} className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1 text-red-700 border-red-200 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditingReturn(null); }} title={editingReturn ? `Edit ${editingReturn.returnNumber}` : "Process Purchase Return"} size="lg">
        <form onSubmit={handleSubmit} className="form-modal">
          <FormField label="Original Purchase" required>
            <SearchableSelect
              value={selectedPurchase}
              onChange={selectPurchase}
              placeholder="Select purchase..."
              searchPlaceholder="Search by PO number, supplier, or product name..."
              options={purchases.map((p) => ({
                value: p._id,
                label: `${p.invoiceNumber} ${p.supplier?.name || ""} ${formatCurrency(p.total)}${p.items?.length ? ` — ${p.items.map((i) => i.productName).join(", ")}` : ""}`,
              }))}
            />
          </FormField>
          <FormField label="Warehouse" required>
            <SelectField value={warehouseId} onChange={setWarehouseId} placeholder="Select warehouse..."
              options={warehouses.map((w) => ({ value: w._id, label: w.name }))} />
          </FormField>
          {returnItems.length > 0 && (
            <table className="w-full text-sm border border-brand-100 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-brand-50">
                  <th className="px-2 py-1 text-left">Product</th>
                  <th className="px-2 py-1 text-center">Purchased</th>
                  <th className="px-2 py-1 text-center">Return Qty</th>
                  <th className="px-2 py-1 text-right">Price</th>
                  <th className="px-2 py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((item, idx) => (
                  <tr key={idx} className="border-t border-brand-50">
                    <td className="px-2 py-1">{item.productName}</td>
                    <td className="px-2 py-1 text-center text-brand-500">{item.maxQty}</td>
                    <td className="px-2 py-1 text-center">
                      <input type="number" min={0} max={item.maxQty} value={item.quantity}
                        onChange={(e) => updateReturnQty(idx, Number(e.target.value))} className="w-20 input-field py-1" />
                    </td>
                    <td className="px-2 py-1 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-2 py-1 text-right">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="text-right font-semibold text-brand-800 text-sm">Return Total: {formatCurrency(returnTotal)}</div>
          <FormGrid cols={2}>
            <FormField label="Refund Method">
              <SelectField value={refundMethod} onChange={setRefundMethod} options={[
                { value: "credit_note", label: "Credit Note (Reduce Payable)" },
                { value: "cash", label: "Cash Refund" },
                { value: "bank", label: "Bank Transfer" },
              ]} />
            </FormField>
            <FormField label="Reason">
              <input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged, wrong item..." />
            </FormField>
          </FormGrid>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" disabled={saving || !warehouseId || returnTotal <= 0} className="btn-primary flex-1">
              {saving ? "Processing..." : editingReturn ? "Update Return" : "Process Return"}
            </button>
            <button type="button" onClick={() => { setShowModal(false); setEditingReturn(null); }} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
