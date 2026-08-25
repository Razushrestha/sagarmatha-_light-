"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { accountingAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Plus, Receipt } from "lucide-react";
import toast from "react-hot-toast";

const CATEGORIES = ["Rent", "Electricity", "Internet", "Salary", "Transport", "Fuel", "Repair", "Marketing", "Office", "Miscellaneous"];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Array<{ _id: string; category: string; amount: number; date: string; paymentMethod: string; description?: string; createdBy?: { name: string } }>>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ category: "Rent", amount: "", paymentMethod: "cash", description: "" });
  const [saving, setSaving] = useState(false);

  const load = () => accountingAPI.getExpenses().then((r) => setExpenses(r.data.data));

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await accountingAPI.createExpense({ ...form, amount: Number(form.amount) });
      toast.success("Expense recorded!");
      setShowModal(false);
      setForm({ category: "Rent", amount: "", paymentMethod: "cash", description: "" });
      load();
    } catch { toast.error("Failed to record expense"); }
    finally { setSaving(false); }
  };


  return (
    <DashboardLayout>
      <PageHeader title="Expenses"
        action={<button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Expense</button>} />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-header">Date</th>
            <th className="table-header">Category</th>
            <th className="table-header">Description</th>
            <th className="table-header">Method</th>
            <th className="table-header">Amount</th>
            <th className="table-header">By</th>
          </tr></thead>
          <tbody className="divide-y divide-brand-50">
            {expenses.length === 0 ? (
              <tr><td colSpan={6} className="table-cell text-center py-12 text-gray-400"><Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />No expenses recorded</td></tr>
            ) : expenses.map((e) => (
              <tr key={e._id} className="hover:bg-brand-50/50">
                <td className="table-cell text-sm">{formatDateTime(e.date)}</td>
                <td className="table-cell"><span className="badge bg-brand-100 text-brand-700">{e.category}</span></td>
                <td className="table-cell">{e.description || ""}</td>
                <td className="table-cell capitalize">{e.paymentMethod}</td>
                <td className="table-cell font-medium text-brand-700">{formatCurrency(e.amount)}</td>
                <td className="table-cell">{e.createdBy?.name || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Record Expense">
        <form onSubmit={handleCreate} className="form-modal">
          <FormGrid cols={2}>
            <FormField label="Category" required>
              <SelectField value={form.category} onChange={(v) => setForm({ ...form, category: v })}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
            </FormField>
            <FormField label="Amount (NPR)" required>
              <input type="number" className="input-field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required min={1} />
            </FormField>
            <FormField label="Payment Method">
              <SelectField value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })}
                options={[{ value: "cash", label: "Cash" }, { value: "bank", label: "Bank" }, { value: "card", label: "Card" }]} />
            </FormField>
          </FormGrid>
          <FormField label="Description">
            <textarea className="input-field min-h-[64px] resize-y" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Saving..." : "Record Expense"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
