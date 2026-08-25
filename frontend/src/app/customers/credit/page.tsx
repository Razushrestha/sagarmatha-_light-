"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { customerAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Wallet, Settings, ArrowDownCircle } from "lucide-react";
import toast from "react-hot-toast";

interface CreditCustomer {
  _id: string;
  name: string;
  phone: string;
  company?: string;
  customerType: string;
  outstanding: number;
  debtAmount: number;
  creditAmount: number;
  creditBalance: number;
  creditLimit: number;
  totalPurchases: number;
  totalPaid: number;
}

export default function CustomerCreditPage() {
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [selected, setSelected] = useState<CreditCustomer | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => customerAPI.getCreditCustomers()
    .then((r) => setCustomers(r.data.data || []))
    .catch((err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to load customer credit");
    });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const creditOf = (c: CreditCustomer) => c.creditAmount ?? c.creditBalance ?? 0;

  const openRefund = (c: CreditCustomer, full = false) => {
    setSelected(c);
    setAmount(full ? String(creditOf(c)) : "");
    setMethod("cash");
    setReference("");
    setShowRefund(true);
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await customerAPI.refundCredit(selected._id, { amount: Number(amount), method, reference });
      toast.success("Credit refunded!");
      setShowRefund(false);
      setAmount("");
      setSelected(null);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Refund failed");
    } finally { setSaving(false); }
  };

  const totalCredit = customers.reduce((s, c) => s + creditOf(c), 0);

  return (
    <DashboardLayout>
      <PageHeader
        title="Customer Credit"
        subtitle="Advance payments and credit balances in customers' favor"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase tracking-wide">Customers with Credit</p>
          <p className="text-2xl font-bold text-brand-900 mt-1">{customers.length}</p>
        </div>
        <div className="card p-4 sm:col-span-2">
          <p className="text-xs text-brand-500 uppercase tracking-wide">Total Credit Amount</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalCredit)}</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Customer</th>
              <th className="table-header">Phone</th>
              <th className="table-header">Type</th>
              <th className="table-header">Credit Amount</th>
              <th className="table-header">Debt Amount</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {customers.length === 0 ? (
              <tr><td colSpan={6} className="table-cell text-center py-12 text-gray-400">No customers with credit balance</td></tr>
            ) : customers.map((c) => (
              <tr key={c._id} className="hover:bg-brand-50/50">
                <td className="table-cell">
                  <p className="font-medium">{c.name}</p>
                  {c.company && <p className="text-xs text-brand-400">{c.company}</p>}
                </td>
                <td className="table-cell">{c.phone}</td>
                <td className="table-cell capitalize">{c.customerType}</td>
                <td className="table-cell">
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <Wallet className="w-4 h-4" />{formatCurrency(creditOf(c))}
                  </span>
                </td>
                <td className="table-cell text-gray-400">
                  {(c.debtAmount ?? c.outstanding ?? 0) > 0
                    ? formatCurrency(c.debtAmount ?? c.outstanding ?? 0)
                    : ""}
                </td>
                <td className="table-cell">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openRefund(c)}
                      className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1"
                    >
                      <ArrowDownCircle className="w-3.5 h-3.5" /> Refund
                    </button>
                    <Link
                      href={`/customers/debtors/${c._id}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900 border border-brand-200 rounded-lg px-3 py-1.5 hover:bg-brand-50"
                    >
                      <Settings className="w-3.5 h-3.5" /> Manage
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showRefund} onClose={() => setShowRefund(false)} title={`Refund Credit: ${selected?.name}`}>
        <form onSubmit={handleRefund} className="form-modal">
          <div className="bg-emerald-50 rounded-md px-4 py-3 text-center border border-emerald-100">
            <p className="text-xs text-emerald-600">Credit Amount</p>
            <p className="text-xl font-bold text-emerald-800">{formatCurrency(selected ? creditOf(selected) : 0)}</p>
          </div>
          <FormGrid cols={2}>
            <FormField label="Refund Amount (NPR)" required>
              <input type="number" className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} required min={1} max={selected ? creditOf(selected) : undefined} step="any" />
            </FormField>
            <FormField label="Payment Method">
              <SelectField value={method} onChange={setMethod} options={[
                { value: "cash", label: "Cash" }, { value: "bank", label: "Bank Transfer" },
                { value: "esewa", label: "eSewa" }, { value: "khalti", label: "Khalti" },
                { value: "fonepay", label: "Fonepay" }, { value: "cheque", label: "Cheque" },
              ]} />
            </FormField>
          </FormGrid>
          <FormField label="Reference / Notes">
            <input className="input-field" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID, cheque no." />
          </FormField>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => selected && openRefund(selected, true)}
              className="btn-secondary text-sm"
            >
              Refund Full Credit
            </button>
          </div>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Processing..." : "Record Refund"}</button>
            <button type="button" onClick={() => setShowRefund(false)} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
