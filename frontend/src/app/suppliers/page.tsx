"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import StatsCard from "@/components/ui/StatsCard";
import { Search, Plus, Pencil, Trash2, ChevronRight, Banknote, Receipt, Wallet, Building2, Printer } from "lucide-react";
import { supplierAPI, accountingAPI } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import SupplierPaymentForm, { SupplierPaymentPayload } from "@/components/purchases/SupplierPaymentForm";
import {
  compareSupplierLedgerLines,
  withPayableClosing,
  closingLabel,
} from "@/lib/supplierLedger";

interface Supplier {
  _id: string;
  name: string;
  company?: string;
  phone?: string;
  contactPerson?: string;
  paymentTerms?: string;
  totalPurchases?: number;
  totalPaid?: number;
  outstanding?: number;
}

interface SupplierPayment {
  _id: string;
  paymentNumber: string;
  supplier: { _id?: string; name: string } | string;
  voucherDate?: string;
  createdAt: string;
  amount?: number;
  total?: number;
  debit?: number;
  credit?: number;
  bankName?: string;
  paidFromAccount?: { name?: string };
}

interface PurchaseBill {
  _id: string;
  invoiceNumber: string;
  createdAt: string;
  total: number;
  debit?: number;
  credit?: number;
  supplier?: { _id?: string; name: string } | string;
}

interface Account {
  _id: string;
  name: string;
  type: string;
  code: string;
}

interface LedgerRow {
  key: string;
  kind: "purchase" | "payment";
  date: string;
  particulars: string;
  voucher: string;
  voucherNo: string;
  debit: number;
  credit: number;
  closing: number;
}

function nprFigure(n: number) {
  return Number(n || 0).toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function particularLabel(name: string) {
  const t = name.trim().toUpperCase();
  return t.endsWith("A/C") ? t : `${t} A/C`;
}

const emptyForm = { name: "", company: "", phone: "", email: "", address: "", pan: "", contactPerson: "", paymentTerms: "net30" };

export default function SuppliersPage() {
  const [tab, setTab] = useState<"list" | "payments">("list");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [purchases, setPurchases] = useState<PurchaseBill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sRes, pRes, bRes, aRes] = await Promise.all([
        supplierAPI.getAll({ limit: "200" }),
        supplierAPI.getPayments({ limit: "200" }),
        supplierAPI.getPurchases({ limit: "200" }),
        accountingAPI.getAccounts(),
      ]);
      setSuppliers(sRes.data.data || []);
      setPayments(pRes.data.data || []);
      setPurchases(bRes.data.data || []);
      setAccounts(aRes.data.data || []);
    } catch { toast.error("Failed to load suppliers"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const totals = useMemo(() => {
    const amount = suppliers.reduce((s, x) => s + (x.totalPurchases || 0), 0);
    const paid = suppliers.reduce((s, x) => s + (x.totalPaid || 0), 0);
    const payable = suppliers.reduce((s, x) => s + (x.outstanding || 0), 0);
    return { amount, paid, payable, count: suppliers.length };
  }, [suppliers]);

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.company || "").toLowerCase().includes(search.toLowerCase())
  );

  const ledgerRows: LedgerRow[] = useMemo(() => {
    const lines: Omit<LedgerRow, "closing">[] = [];
    purchases.forEach((bill) => {
      const sid = typeof bill.supplier === "object" ? bill.supplier?._id : bill.supplier;
      const name = typeof bill.supplier === "object" ? bill.supplier?.name : suppliers.find((s) => s._id === sid)?.name;
      lines.push({
        key: `pur-${bill._id}`,
        kind: "purchase",
        date: bill.createdAt || "",
        particulars: particularLabel(name || "Purchase"),
        voucher: "Purchase",
        voucherNo: bill.invoiceNumber,
        debit: bill.debit ?? 0,
        credit: bill.credit ?? bill.total ?? 0,
      });
    });
    payments.forEach((p) => {
      const name = typeof p.supplier === "object" ? p.supplier?.name : suppliers.find((s) => s._id === p.supplier)?.name;
      lines.push({
        key: `pay-${p._id}`,
        kind: "payment",
        date: p.voucherDate || p.createdAt,
        particulars: particularLabel(name || p.bankName || p.paidFromAccount?.name || "Cash"),
        voucher: "Payment",
        voucherNo: p.paymentNumber,
        debit: p.debit ?? p.total ?? p.amount ?? 0,
        credit: p.credit ?? 0,
      });
    });
    lines.sort(compareSupplierLedgerLines);
    return withPayableClosing(lines);
  }, [purchases, payments, suppliers]);

  const openAdd = () => { setEditId(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = async (s: Supplier) => {
    setEditId(s._id);
    setForm({ name: s.name, company: s.company || "", phone: s.phone || "", email: "", address: "", pan: "", contactPerson: s.contactPerson || "", paymentTerms: s.paymentTerms || "net30" });
    setShowModal(true);
    try {
      const res = await supplierAPI.getById(s._id);
      const full = res.data.data;
      setForm({
        name: full.name || s.name,
        company: full.company || "",
        phone: full.phone || "",
        email: full.email || "",
        address: full.address || "",
        pan: full.pan || "",
        contactPerson: full.contactPerson || "",
        paymentTerms: full.paymentTerms || "net30",
      });
    } catch {
      // keep list values
    }
  };

  const handleDelete = async (s: Supplier) => {
    if (!window.confirm(`Remove ${s.name} from the supplier list?`)) return;
    try {
      await supplierAPI.remove(s._id);
      toast.success("Supplier removed");
      fetchAll();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Could not remove supplier");
    }
  };

  const handleSave = async () => {
    if (!form.name) return toast.error("Name is required");
    setSaving(true);
    try {
      if (editId) { await supplierAPI.update(editId, form); toast.success("Supplier updated"); }
      else { await supplierAPI.create(form); toast.success("Supplier added"); }
      setShowModal(false);
      fetchAll();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed");
    } finally { setSaving(false); }
  };

  const loadUnpaidPurchases = useCallback(async (supplierId: string) => {
    const { data } = await supplierAPI.getPurchases({ supplier: supplierId, unpaid: "true", limit: "50" });
    return data.data || [];
  }, []);

  const handlePay = async (payload: SupplierPaymentPayload) => {
    setSaving(true);
    try {
      await supplierAPI.createPayment(payload);
      toast.success("Payment recorded");
      setShowPayModal(false);
      fetchAll();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to record payment");
    } finally { setSaving(false); }
  };

  const printLedger = () => window.print();

  return (
    <DashboardLayout>
      <PageHeader
        title="Suppliers"
        action={
          <div className="flex items-center gap-2">
            {tab === "payments" && (
              <button type="button" onClick={printLedger} className="btn-secondary flex items-center gap-2">
                <Printer className="w-4 h-4" /> Print
              </button>
            )}
            {tab === "payments" ? (
              <button onClick={() => setShowPayModal(true)} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> New Payment to Supplier
              </button>
            ) : (
              <button onClick={openAdd} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Supplier
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatsCard title="Suppliers" value={String(totals.count)} icon={Building2} />
        <StatsCard title="Total Amount" value={formatCurrency(totals.amount)} icon={Receipt} />
        <StatsCard title="Amount Paid" value={formatCurrency(totals.paid)} icon={Banknote} />
        <StatsCard title="Amount to be Paid" value={formatCurrency(totals.payable)} icon={Wallet} />
      </div>

      <div className="flex gap-1 mb-4 p-1 bg-brand-50 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab("list")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "list" ? "bg-white text-brand-800 shadow-sm" : "text-gray-600 hover:text-brand-700"}`}
        >
          Directory
        </button>
        <button
          type="button"
          onClick={() => setTab("payments")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "payments" ? "bg-white text-brand-800 shadow-sm" : "text-gray-600 hover:text-brand-700"}`}
        >
          Payment to Suppliers
        </button>
      </div>

      {tab === "list" ? (
        <div className="card">
          <div className="p-4 border-b border-brand-50">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Supplier</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header">Contact</th>
                  <th className="table-header">Terms</th>
                  <th className="table-header text-right">Total Amount</th>
                  <th className="table-header text-right">Total Paid</th>
                  <th className="table-header text-right">Payable</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {loading ? [...Array(3)].map((_, i) => (
                  <tr key={i}><td colSpan={8} className="table-cell"><div className="h-10 bg-brand-50 rounded animate-pulse" /></td></tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="table-cell text-center py-12 text-gray-400">No suppliers found</td></tr>
                ) : filtered.map((s) => (
                  <tr key={s._id} className="hover:bg-brand-50/50">
                    <td className="table-cell">
                      <Link href={`/suppliers/${s._id}`} className="font-medium text-brand-800 hover:underline">{s.name}</Link>
                      {s.company && <p className="text-xs text-gray-400">{s.company}</p>}
                    </td>
                    <td className="table-cell text-gray-500">{s.phone || "—"}</td>
                    <td className="table-cell text-gray-500">{s.contactPerson || "—"}</td>
                    <td className="table-cell"><span className="badge-neutral">{s.paymentTerms || "Cash"}</span></td>
                    <td className="table-cell text-right font-medium">{formatCurrency(s.totalPurchases || 0)}</td>
                    <td className="table-cell text-right text-emerald-700">{formatCurrency(s.totalPaid || 0)}</td>
                    <td className="table-cell text-right font-semibold text-amber-700">{formatCurrency(s.outstanding || 0)}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1 justify-end">
                        <Link href={`/suppliers/${s._id}`} className="p-1.5 hover:bg-brand-50 rounded-lg text-brand-600 text-xs font-medium flex items-center gap-0.5">
                          Manage <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                        <button type="button" onClick={() => openEdit(s)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-100 text-brand-700">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button type="button" onClick={() => handleDelete(s)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 text-red-600">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="table-header text-center">Date</th>
                <th className="table-header text-center">Particular&apos;s</th>
                <th className="table-header text-center">Voucher</th>
                <th className="table-header text-center">V. No.</th>
                <th className="table-header text-center">Debit (NPR)</th>
                <th className="table-header text-center">Credit (NPR)</th>
                <th className="table-header text-center">Closing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {loading ? [...Array(3)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="table-cell"><div className="h-10 bg-brand-50 rounded animate-pulse" /></td></tr>
              )) : ledgerRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-12 text-gray-400">
                    <Banknote className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    No supplier payments yet
                  </td>
                </tr>
              ) : ledgerRows.map((row) => (
                <tr key={row.key} className="hover:bg-brand-50/50">
                  <td className="table-cell text-center whitespace-nowrap">{formatDate(row.date)}</td>
                  <td className="table-cell">{row.particulars}</td>
                  <td className="table-cell text-center">{row.voucher}</td>
                  <td className="table-cell text-center font-medium text-brand-700">{row.voucherNo}</td>
                  <td className="table-cell text-right tabular-nums font-medium">{row.debit ? nprFigure(row.debit) : ""}</td>
                  <td className="table-cell text-right tabular-nums font-medium">{row.credit ? nprFigure(row.credit) : ""}</td>
                  <td className="table-cell text-right tabular-nums whitespace-nowrap">
                    {closingLabel(row.closing, nprFigure)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Supplier" : "Add Supplier"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Name *</label><input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Company</label><input className="input-field" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Phone</label><input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div><label className="label">Address</label><input className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">PAN</label><input className="input-field" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} /></div>
            <div><label className="label">Contact Person</label><input className="input-field" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
          </div>
          <div>
            <label className="label">Payment Terms</label>
            <select className="input-field" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="net7">Net 7</option>
              <option value="net15">Net 15</option>
              <option value="net30">Net 30</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? "Saving..." : editId ? "Update" : "Add Supplier"}</button>
          </div>
        </div>
      </Modal>

      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} size="3xl" hideHeader>
        <SupplierPaymentForm
          suppliers={suppliers}
          accounts={accounts}
          saving={saving}
          onSubmit={handlePay}
          onCancel={() => setShowPayModal(false)}
          loadUnpaidPurchases={loadUnpaidPurchases}
        />
      </Modal>
    </DashboardLayout>
  );
}
