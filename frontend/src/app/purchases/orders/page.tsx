"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import PurchaseVoucherForm, { PurchaseVoucherPayload } from "@/components/purchases/PurchaseVoucherForm";
import { supplierAPI, productAPI, miscAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Plus, ClipboardList, PackageCheck } from "lucide-react";
import toast from "react-hot-toast";

interface PurchaseOrder {
  _id: string;
  invoiceNumber: string;
  supplier: { name: string; company?: string };
  total: number;
  status: string;
  createdAt: string;
  items?: Array<{ productName: string; quantity: number }>;
}

interface SupplierRow {
  _id: string;
  name: string;
  outstanding: number;
}

interface ProductRow {
  _id: string;
  name: string;
  sku?: string;
  purchasePrice: number;
  unit?: { name?: string; symbol?: string };
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
    supplierAPI.getAll({ limit: "100" }).then((r) => setSuppliers(r.data.data));
    productAPI.getAll({ limit: "200" }).then((r) => setProducts(r.data.data));
    miscAPI.getWarehouses().then((r) => setWarehouses(r.data.data));
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await supplierAPI.getPurchases({ limit: "50", type: "order" });
      setOrders(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (payload: PurchaseVoucherPayload) => {
    setSaving(true);
    try {
      await supplierAPI.createPurchase(payload);
      toast.success("Purchase order saved!");
      setShowModal(false);
      loadOrders();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async (orderId: string) => {
    if (!confirm("Receive this purchase order? Stock and supplier balance will be updated.")) return;
    setReceivingId(orderId);
    try {
      await supplierAPI.receivePurchaseOrder(orderId, {});
      toast.success("Purchase order received as invoice!");
      loadOrders();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to receive order");
    } finally {
      setReceivingId(null);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "ordered" || status === "draft") return "badge";
    if (status === "completed" || status === "received") return "badge-dark";
    return "badge";
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Purchase Orders"
        action={
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Purchase Order
          </button>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Order No.</th>
              <th className="table-header">Supplier</th>
              <th className="table-header">Items</th>
              <th className="table-header">Total Amount</th>
              <th className="table-header">Status</th>
              <th className="table-header">Date</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="table-cell">
                    <div className="h-10 bg-brand-50 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-cell text-center py-12 text-gray-400">
                  <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  No purchase orders yet
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o._id} className="hover:bg-brand-50/50">
                  <td className="table-cell font-medium text-brand-700">{o.invoiceNumber}</td>
                  <td className="table-cell">{o.supplier?.name}</td>
                  <td className="table-cell text-gray-500 text-sm">
                    {o.items?.length ?? 0} item{(o.items?.length ?? 0) !== 1 ? "s" : ""}
                  </td>
                  <td className="table-cell font-medium">{formatCurrency(o.total)}</td>
                  <td className="table-cell">
                    <span className={`${statusBadge(o.status)} capitalize`}>{o.status}</span>
                  </td>
                  <td className="table-cell text-gray-500">{formatDateTime(o.createdAt)}</td>
                  <td className="table-cell text-right">
                    {o.status === "ordered" && (
                      <button
                        type="button"
                        onClick={() => handleReceive(o._id)}
                        disabled={receivingId === o._id}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50"
                      >
                        <PackageCheck className="w-4 h-4" />
                        {receivingId === o._id ? "Receiving..." : "Receive"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} size="3xl" hideHeader>
        <PurchaseVoucherForm
          mode="order"
          suppliers={suppliers}
          products={products}
          warehouses={warehouses}
          saving={saving}
          onSubmit={handleCreate}
          onCancel={() => setShowModal(false)}
        />
      </Modal>
    </DashboardLayout>
  );
}
