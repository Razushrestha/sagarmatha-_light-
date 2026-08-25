"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { miscAPI, inventoryAPI } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Warehouse, MapPin, Phone } from "lucide-react";

interface WarehouseItem {
  _id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isDefault: boolean;
  isActive: boolean;
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "" });

  const load = () => {
    setLoading(true);
    miscAPI.getWarehouses()
      .then((res) => setWarehouses(res.data.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryAPI.createWarehouse(form);
      toast.success("Warehouse created!");
      setShowModal(false);
      setForm({ name: "", code: "", address: "", phone: "" });
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to create warehouse");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Warehouses"
        action={
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Warehouse
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => <div key={i} className="card p-6 h-40 animate-pulse bg-brand-50" />)}
        </div>
      ) : warehouses.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <Warehouse className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>No warehouses yet. Create your first warehouse.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {warehouses.map((wh) => (
            <div key={wh._id} className="card p-6 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center">
                  <Warehouse className="w-6 h-6 text-brand-600" />
                </div>
                {wh.isDefault && <span className="badge bg-brand-100 text-brand-700">Default</span>}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{wh.name}</h3>
              <p className="text-sm text-brand-600 font-mono mt-1">{wh.code}</p>
              {wh.address && (
                <p className="text-sm text-gray-500 mt-3 flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" />{wh.address}
                </p>
              )}
              {wh.phone && (
                <p className="text-sm text-gray-500 mt-2 flex items-center gap-2">
                  <Phone className="w-4 h-4" />{wh.phone}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Warehouse" size="md">
        <form onSubmit={handleCreate} className="form-modal">
          <FormGrid cols={2}>
            <FormField label="Warehouse Name" required>
              <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </FormField>
            <FormField label="Code" required>
              <input className="input-field" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WH-01" required />
            </FormField>
            <FormField label="Address">
              <input className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </FormField>
            <FormField label="Phone">
              <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </FormField>
          </FormGrid>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating..." : "Create"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
