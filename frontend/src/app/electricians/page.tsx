"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { electricianAPI } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Plus, Search, Zap, Pencil, Trash2, Phone, MapPin } from "lucide-react";
import toast from "react-hot-toast";

interface Electrician {
  _id: string;
  name: string;
  number1: string;
  number2?: string;
  address?: string;
}

const emptyForm = { name: "", number1: "", number2: "", address: "" };

export default function ElectriciansPage() {
  const [electricians, setElectricians] = useState<Electrician[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 250);

  const load = async (q?: string) => {
    setLoading(true);
    try {
      const res = await electricianAPI.getAll({ search: q ?? debouncedSearch, limit: "100" });
      setElectricians(res.data.data || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to load electricians");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (item: Electrician) => {
    setEditingId(item._id);
    setForm({
      name: item.name || "",
      number1: item.number1 || "",
      number2: item.number2 || "",
      address: item.address || "",
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.number1.trim()) {
      toast.error("Name and Number 1 are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        number1: form.number1.trim(),
        number2: form.number2.trim(),
        address: form.address.trim(),
      };
      if (editingId) {
        await electricianAPI.update(editingId, payload);
        toast.success("Electrician updated");
      } else {
        await electricianAPI.create(payload);
        toast.success("Electrician added");
      }
      setShowModal(false);
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not save electrician");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: Electrician) => {
    if (!window.confirm(`Remove ${item.name} from the electrician list?`)) return;
    try {
      await electricianAPI.remove(item._id);
      toast.success("Electrician removed");
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not remove electrician");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Electricians"
        action={
          <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Electrician
          </button>
        }
      />

      <div className="card">
        <div className="p-4 border-b border-brand-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, number, or address..."
              className="input-field pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Number 1</th>
                <th className="table-header">Number 2</th>
                <th className="table-header">Address</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="table-cell">
                      <div className="h-10 bg-brand-50 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : electricians.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-cell text-center py-12 text-gray-400">
                    <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    No electricians yet. Add your first contact.
                  </td>
                </tr>
              ) : (
                electricians.map((item) => (
                  <tr key={item._id} className="hover:bg-brand-50/50">
                    <td className="table-cell font-medium text-brand-900">
                      <Link
                        href={`/electricians/${item._id}`}
                        className="text-left text-brand-800 hover:text-brand-950 hover:underline"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="table-cell">
                      <a href={`tel:${item.number1}`} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
                        <Phone className="w-3.5 h-3.5" />
                        {item.number1}
                      </a>
                    </td>
                    <td className="table-cell">
                      {item.number2 ? (
                        <a href={`tel:${item.number2}`} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
                          <Phone className="w-3.5 h-3.5" />
                          {item.number2}
                        </a>
                      ) : (
                        <span className="text-brand-400">-</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {item.address ? (
                        <span className="inline-flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 text-brand-400 shrink-0" />
                          {item.address}
                        </span>
                      ) : (
                        <span className="text-brand-400">-</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openEdit(item)} className="p-2 rounded-lg hover:bg-brand-100 text-brand-600" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(item)} className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? "Edit electrician" : "Add electrician"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <FormGrid cols={2}>
            <FormField label="Name" required>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Number 1" required>
              <input
                className="input-field"
                value={form.number1}
                onChange={(e) => setForm({ ...form, number1: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Number 2">
              <input
                className="input-field"
                value={form.number2}
                onChange={(e) => setForm({ ...form, number2: e.target.value })}
              />
            </FormField>
            <FormField label="Address">
              <input
                className="input-field"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </FormField>
          </FormGrid>
          <FormActions>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Add electrician"}
            </button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
