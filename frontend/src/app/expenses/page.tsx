"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { accountingAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Plus, Receipt, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

const CATEGORIES = ["Rent", "Electricity", "Internet", "Salary", "Transport", "Fuel", "Repair", "Marketing", "Office", "Miscellaneous"];

const emptyForm = { category: "Rent", amount: "", paymentMethod: "cash", description: "" };

type ExpenseRow = {
  _id: string;
  category: string;
  amount: number;
  date: string;
  paymentMethod: string;
  description?: string;
  createdBy?: { name: string };
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => accountingAPI.getExpenses().then((r) => setExpenses(r.data.data));

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (expense: ExpenseRow) => {
    setEditId(expense._id);
    setForm({
      category: expense.category || "Rent",
      amount: String(expense.amount ?? ""),
      paymentMethod: expense.paymentMethod || "cash",
      description: expense.description || "",
    });
    setShowModal(true);
  };

  const handleDelete = async (expense: ExpenseRow) => {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await accountingAPI.removeExpense(expense._id);
      toast.success("Expense deleted");
      load();
    } catch {
      toast.error("Failed to delete expense");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (editId) {
        await accountingAPI.updateExpense(editId, payload);
        toast.success("Expense updated");
      } else {
        await accountingAPI.createExpense(payload);
        toast.success("Expense recorded!");
      }
      setShowModal(false);
      setEditId(null);
      setForm(emptyForm);
      load();
    } catch {
      toast.error(editId ? "Failed to update expense" : "Failed to record expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Expenses"
        action={<button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Expense</button>} />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="table-header">Date</th>
            <th className="table-header">Category</th>
            <th className="table-header">Description</th>
            <th className="table-header">Method</th>
            <th className="table-header">Amount</th>
            <th className="table-header">By</th>
            <th className="table-header"></th>
          </tr></thead>
          <tbody className="divide-y divide-brand-50">
            {expenses.length === 0 ? (
              <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400"><Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />No expenses recorded</td></tr>
            ) : expenses.map((e) => (
              <tr key={e._id} className="hover:bg-brand-50/50">
                <td className="table-cell text-sm">{formatDateTime(e.date)}</td>
                <td className="table-cell"><span className="badge bg-brand-100 text-brand-700">{e.category}</span></td>
                <td className="table-cell">{e.description || ""}</td>
                <td className="table-cell capitalize">{e.paymentMethod}</td>
                <td className="table-cell font-medium text-brand-700">{formatCurrency(e.amount)}</td>
                <td className="table-cell">{e.createdBy?.name || ""}</td>
                <td className="table-cell">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => openEdit(e)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-100 text-brand-700">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(e)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 text-red-600">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditId(null); setForm(emptyForm); }}
        title={editId ? "Edit Expense" : "Record Expense"}
      >
        <form onSubmit={handleSave} className="form-modal">
          <FormGrid cols={2}>
            <FormField label="Category" required>
              <SelectField value={form.category} onChange={(v) => setForm({ ...form, category: v })}
                options={[form.category, ...CATEGORIES.filter((c) => c !== form.category)].map((c) => ({ value: c, label: c }))} />
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
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? "Saving..." : editId ? "Save Changes" : "Record Expense"}
            </button>
            <button type="button" onClick={() => { setShowModal(false); setEditId(null); setForm(emptyForm); }} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
