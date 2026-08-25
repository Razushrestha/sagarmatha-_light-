"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { customerAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Plus, Search, Users } from "lucide-react";
import toast from "react-hot-toast";

interface Customer {
  _id: string;
  name: string;
  phone: string;
  company?: string;
  customerType: string;
  totalPurchases: number;
  outstanding: number;
  creditBalance?: number;
  debtAmount?: number;
  creditAmount?: number;
  creditLimit: number;
}

const emptyForm = {
  name: "", phone: "", company: "", email: "", address: "",
  pan: "", vatNumber: "", customerType: "retail", creditLimit: "0", paymentTerms: "cash",
  openingDebt: "", openingCredit: "", openingBalanceDate: new Date().toISOString().slice(0, 10),
};

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const debouncedSearch = useDebouncedValue(search, 250);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadCustomers = async (q?: string) => {
    setLoading(true);
    try {
      const res = await customerAPI.getAll({ search: q ?? debouncedSearch, limit: "50" });
      setCustomers(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const debt = Number(form.openingDebt) || 0;
    const credit = Number(form.openingCredit) || 0;
    if (debt > 0 && credit > 0) {
      toast.error("Enter either previous debt or previous credit, not both.");
      return;
    }
    setSaving(true);
    try {
      await customerAPI.create({
        name: form.name,
        phone: form.phone,
        company: form.company,
        email: form.email,
        address: form.address,
        pan: form.pan,
        vatNumber: form.vatNumber || form.pan,
        customerType: form.customerType,
        creditLimit: Number(form.creditLimit) || 0,
        paymentTerms: form.paymentTerms,
        openingDebt: debt,
        openingCredit: credit,
        openingBalanceDate: form.openingBalanceDate || todayInputDate(),
      });
      toast.success("Customer created!");
      setShowModal(false);
      setForm({ ...emptyForm, openingBalanceDate: todayInputDate() });
      loadCustomers();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to create customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Customers"
        action={
          <button onClick={() => { setForm({ ...emptyForm, openingBalanceDate: todayInputDate() }); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Customer
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
              placeholder="Search customers..."
              className="input-field pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Customer</th>
                <th className="table-header">Phone</th>
                <th className="table-header">Type</th>
                <th className="table-header">Total Purchases</th>
                <th className="table-header">Debt Amount</th>
                <th className="table-header">Credit Amount</th>
                <th className="table-header">Credit Limit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}><td colSpan={7} className="table-cell"><div className="h-10 bg-brand-50 rounded animate-pulse" /></td></tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-12 text-gray-400">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />No customers found
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c._id} className="hover:bg-brand-50/50 transition-colors">
                    <td className="table-cell">
                      <div>
                        <p className="font-medium text-gray-800">{c.name}</p>
                        {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
                      </div>
                    </td>
                    <td className="table-cell">{c.phone}</td>
                    <td className="table-cell">
                      <span className="badge bg-brand-100 text-brand-700 capitalize">{c.customerType}</span>
                    </td>
                    <td className="table-cell">{formatCurrency(c.totalPurchases)}</td>
                    <td className="table-cell">
                      <span className={(c.debtAmount ?? c.outstanding) > 0 ? "text-brand-700 font-medium" : "text-gray-500"}>
                        {formatCurrency(c.debtAmount ?? c.outstanding ?? 0)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={(c.creditAmount ?? c.creditBalance ?? 0) > 0 ? "text-emerald-700 font-medium" : "text-gray-500"}>
                        {formatCurrency(c.creditAmount ?? c.creditBalance ?? 0)}
                      </span>
                    </td>
                    <td className="table-cell">{formatCurrency(c.creditLimit)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New Customer" size="lg">
        <form onSubmit={handleCreate} className="form-modal">
          <FormGrid cols={2}>
            <FormField label="Name" required>
              <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </FormField>
            <FormField label="Phone" required>
              <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </FormField>
            <FormField label="Company">
              <input className="input-field" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </FormField>
            <FormField label="Email">
              <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormField>
            <FormField label="PAN">
              <input className="input-field" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} placeholder="PAN number" />
            </FormField>
            <FormField label="VAT Number">
              <input className="input-field" value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} placeholder="VAT / bill registration no." />
            </FormField>
            <FormField label="Customer Type">
              <SelectField value={form.customerType} onChange={(v) => setForm({ ...form, customerType: v })}
                options={[
                  { value: "retail", label: "Retail" },
                  { value: "wholesale", label: "Wholesale" },
                  { value: "dealer", label: "Dealer" },
                  { value: "project", label: "Project" },
                ]} />
            </FormField>
            <FormField label="Credit Limit">
              <input type="number" className="input-field" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
            </FormField>
            <FormField label="Payment Terms">
              <SelectField value={form.paymentTerms} onChange={(v) => setForm({ ...form, paymentTerms: v })}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "net7", label: "Net 7" },
                  { value: "net15", label: "Net 15" },
                  { value: "net30", label: "Net 30" },
                ]} />
            </FormField>
          </FormGrid>

          <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Previous Balance (Optional)</p>
            <p className="text-xs text-brand-500">If this customer already owed you money or had advance credit before joining the system.</p>
            <FormGrid cols={2}>
              <FormField label="Previous Debt (NPR)">
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="input-field"
                  value={form.openingDebt}
                  onChange={(e) => setForm({ ...form, openingDebt: e.target.value, openingCredit: e.target.value ? "" : form.openingCredit })}
                  placeholder="Amount customer owes"
                />
              </FormField>
              <FormField label="Previous Credit (NPR)">
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="input-field"
                  value={form.openingCredit}
                  onChange={(e) => setForm({ ...form, openingCredit: e.target.value, openingDebt: e.target.value ? "" : form.openingDebt })}
                  placeholder="Advance / overpayment balance"
                />
              </FormField>
              <FormField label="Balance As Of Date" className="sm:col-span-2">
                <input
                  type="date"
                  className="input-field"
                  value={form.openingBalanceDate}
                  onChange={(e) => setForm({ ...form, openingBalanceDate: e.target.value })}
                />
              </FormField>
            </FormGrid>
          </div>

          <FormField label="Address">
            <textarea className="input-field min-h-[64px] resize-y" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FormField>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Create Customer"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
