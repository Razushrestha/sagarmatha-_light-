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
import { CreditCard, AlertCircle, Settings } from "lucide-react";
import toast from "react-hot-toast";

interface Debtor {
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

export default function DebtorsPage() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [selected, setSelected] = useState<Debtor | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => customerAPI.getDebtors()
    .then((r) => setDebtors(r.data.data || []))
    .catch((err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to load debtors");
    });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const debtOf = (d: Debtor) => d.debtAmount ?? d.outstanding ?? 0;

  const openCollect = (d: Debtor, full = false) => {
    setSelected(d);
    setAmount(full ? String(debtOf(d)) : "");
    setMethod("cash");
    setReference("");
    setShowPay(true);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await customerAPI.receivePayment(selected._id, { amount: Number(amount), method, reference });
      toast.success("Payment recorded!");
      setShowPay(false);
      setAmount("");
      setSelected(null);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Payment failed");
    } finally { setSaving(false); }
  };

  const totalDebt = debtors.reduce((s, d) => s + debtOf(d), 0);

  return (
    <DashboardLayout>
      <PageHeader
        title="Debtors"
        subtitle="Customers who owe money to the business"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase tracking-wide">Debtors</p>
          <p className="text-2xl font-bold text-brand-900 mt-1">{debtors.length}</p>
        </div>
        <div className="card p-4 sm:col-span-2">
          <p className="text-xs text-brand-500 uppercase tracking-wide">Total Debt Amount</p>
          <p className="text-2xl font-bold text-brand-800 mt-1">{formatCurrency(totalDebt)}</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Customer</th>
              <th className="table-header">Phone</th>
              <th className="table-header">Type</th>
              <th className="table-header">Debt Amount</th>
              <th className="table-header">Credit Amount</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {debtors.length === 0 ? (
              <tr><td colSpan={6} className="table-cell text-center py-12 text-gray-400">No customers with outstanding debt</td></tr>
            ) : debtors.map((d) => (
              <tr key={d._id} className="hover:bg-brand-50/50">
                <td className="table-cell">
                  <p className="font-medium">{d.name}</p>
                  {d.company && <p className="text-xs text-brand-400">{d.company}</p>}
                </td>
                <td className="table-cell">{d.phone}</td>
                <td className="table-cell capitalize">{d.customerType}</td>
                <td className="table-cell">
                  <span className="flex items-center gap-1 text-brand-700 font-semibold">
                    <AlertCircle className="w-4 h-4" />{formatCurrency(debtOf(d))}
                  </span>
                </td>
                <td className="table-cell text-gray-400">
                  {(d.creditAmount ?? d.creditBalance ?? 0) > 0
                    ? formatCurrency(d.creditAmount ?? d.creditBalance ?? 0)
                    : ""}
                </td>
                <td className="table-cell">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openCollect(d)}
                      className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Collect
                    </button>
                    <Link
                      href={`/customers/debtors/${d._id}`}
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

      <Modal open={showPay} onClose={() => setShowPay(false)} title={`Collect Payment: ${selected?.name}`}>
        <form onSubmit={handlePayment} className="form-modal">
          <div className="bg-brand-50 rounded-md px-4 py-3 text-center border border-brand-100">
            <p className="text-xs text-brand-500">Debt Amount</p>
            <p className="text-xl font-bold text-brand-800">{formatCurrency(selected ? debtOf(selected) : 0)}</p>
          </div>
          <FormGrid cols={2}>
            <FormField label="Amount (NPR)" required>
              <input type="number" className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} required min={1} max={selected ? debtOf(selected) : undefined} step="any" />
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
          <p className="text-xs text-brand-500">Any amount paid above the debt will be stored as customer credit.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => selected && openCollect(selected, true)}
              className="btn-secondary text-sm"
            >
              Pay Full Debt
            </button>
          </div>
          <FormActions className="mt-0 pt-3 border-0">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Processing..." : "Record Payment"}</button>
            <button type="button" onClick={() => setShowPay(false)} className="btn-secondary">Cancel</button>
          </FormActions>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
