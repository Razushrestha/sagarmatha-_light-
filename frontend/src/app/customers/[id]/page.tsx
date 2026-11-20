"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { customerAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ArrowLeft, User, CreditCard, CheckCircle2, Printer, ArrowDownCircle } from "lucide-react";
import toast from "react-hot-toast";
import {
  StatementLine,
  buildAccountLedgerHtml,
  printAccountLedger,
} from "@/lib/ledgerStatement";
import AccountLedgerTable from "@/components/ledger/AccountLedgerTable";
import { formatAdSlash, formatBsDash } from "@/lib/nepaliDate";

interface Customer {
  _id: string;
  name: string;
  phone: string;
  company?: string;
  address?: string;
  customerType: string;
  outstanding: number;
  debtAmount?: number;
  creditBalance: number;
  creditAmount?: number;
  creditLimit: number;
  totalPurchases: number;
  totalPaid: number;
}

interface SaleRow {
  _id: string;
  invoiceNumber: string;
  type?: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  createdAt: string;
}

interface PaymentRow {
  _id: string;
  amount: number;
  method: string;
  type?: string;
  reference?: string;
  createdAt: string;
  createdBy?: { name: string };
}

function buildLedger(sales: SaleRow[], payments: PaymentRow[]): StatementLine[] {
  const saleLines: StatementLine[] = sales.map((s) => ({
    key: `sale-${s._id}`,
    date: s.createdAt,
    particulars: "Sales",
    voucherNo: s.invoiceNumber || "",
    vchType: s.type === "estimate" ? "Estimate" : "Sales",
    debit: s.total,
    credit: 0,
  }));
  const payLines: StatementLine[] = payments.map((p) => ({
    key: `pay-${p._id}`,
    date: p.createdAt,
    particulars: (p.method || "Cash").replace(/^./, (c) => c.toUpperCase()),
    voucherNo: p.reference || "",
    refNo: p.reference || "",
    vchType: p.type === "refund" ? "Refund" : "Receipt",
    debit: p.type === "refund" ? p.amount : 0,
    credit: p.type === "refund" ? 0 : p.amount,
  }));
  return [...saleLines, ...payLines].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [from, setFrom] = useState("list");
  const backHref = from === "debtors" ? "/customers/debtors" : from === "credit" ? "/customers/credit" : "/customers";
  const backLabel = from === "debtors" ? "Debtors" : from === "credit" ? "Customer Credit" : "Customers";

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await customerAPI.getLedger(id);
      setCustomer(res.data.data.customer);
      setSales(res.data.data.sales);
      setPayments(res.data.data.payments);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("from");
    if (q === "debtors" || q === "credit" || q === "list") setFrom(q);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePayment = async (e: React.FormEvent, payFull = false) => {
    e.preventDefault();
    if (!customer) return;
    const debt = customer.debtAmount ?? customer.outstanding ?? 0;
    const payAmount = payFull ? debt : Number(amount);
    if (!payAmount || payAmount <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      const res = await customerAPI.receivePayment(customer._id, { amount: payAmount, method, reference });
      const nextDebt = res.data?.customer?.debtAmount ?? res.data?.customer?.outstanding;
      if (payFull || nextDebt === 0) {
        toast.success("Debtor marked as fully paid!");
      } else if (typeof nextDebt === "number") {
        toast.success(`Payment recorded. Debt now ${formatCurrency(nextDebt)}`);
      } else {
        toast.success("Payment recorded!");
      }
      setAmount("");
      setReference("");
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRefund = async (e: React.FormEvent, refundFull = false) => {
    e.preventDefault();
    if (!customer) return;
    const credit = customer.creditAmount ?? customer.creditBalance ?? 0;
    const payAmount = refundFull ? credit : Number(refundAmount);
    if (!payAmount || payAmount <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      await customerAPI.refundCredit(customer._id, {
        amount: payAmount,
        method: refundMethod,
        reference: refundReference,
      });
      toast.success(refundFull ? "Credit fully refunded!" : "Credit refund recorded!");
      setRefundAmount("");
      setRefundReference("");
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Refund failed");
    } finally {
      setSaving(false);
    }
  };

  const handlePrintPayments = () => {
    if (!customer) return;
    const ledger = buildLedger(sales, payments);
    if (!ledger.length) return toast.error("No transactions to print");
    const debt = customer.debtAmount ?? customer.outstanding ?? 0;
    const credit = customer.creditAmount ?? customer.creditBalance ?? 0;
    const closing = debt > 0 ? debt : -credit;
    const opening = closing - ledger.reduce((sum, line) => sum + line.debit - line.credit, 0);
    printAccountLedger(
      `${customer.name} Ledger`,
      buildAccountLedgerHtml({
        partyName: customer.name,
        accountGroup: "Sundry Debtors",
        book: "receivable",
        periodFrom: ledger[0].date,
        periodTo: ledger[ledger.length - 1].date,
        lines: ledger,
        opening,
        closing,
      })
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="h-64 bg-brand-50 rounded-xl animate-pulse" />
      </DashboardLayout>
    );
  }

  if (!customer) {
    return (
      <DashboardLayout>
        <p className="text-brand-500">Customer not found.</p>
      </DashboardLayout>
    );
  }

  const unpaidSales = sales.filter((s) => s.amountDue > 0);

  const debtAmount = customer.debtAmount ?? customer.outstanding ?? 0;
  const creditAmount = customer.creditAmount ?? customer.creditBalance ?? 0;
  const ledgerLines = buildLedger(sales, payments);
  const closingBalance = debtAmount > 0 ? debtAmount : -creditAmount;
  const openingBalance = closingBalance - ledgerLines.reduce((sum, line) => sum + line.debit - line.credit, 0);

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-wrap gap-3">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-900">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>
      </div>

      <PageHeader
        title={customer.name}
        subtitle="Customer details, ledger and statement"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-brand-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-brand-900">{customer.name}</h2>
              <p className="text-sm text-brand-500">{customer.phone}{customer.company ? ` · ${customer.company}` : ""}</p>
              {customer.address && <p className="text-sm text-brand-400 mt-1">{customer.address}</p>}
              <p className="text-xs capitalize text-brand-500 mt-2">Type: {customer.customerType}</p>
            </div>
          </div>
        </div>
        <div className="card p-5 bg-brand-900 text-white">
          <p className="text-xs uppercase tracking-wide text-brand-300">Debt Amount</p>
          <p className="text-3xl font-bold mt-1 tabular-nums">{formatCurrency(debtAmount)}</p>
          <p className="text-xs uppercase tracking-wide text-brand-300 mt-4">Credit Amount</p>
          <p className="text-xl font-semibold mt-1 tabular-nums text-emerald-300">{formatCurrency(creditAmount)}</p>
          <p className="text-xs text-brand-300 mt-3">Total purchases: {formatCurrency(customer.totalPurchases)}</p>
          <p className="text-xs text-brand-300">Total paid: {formatCurrency(customer.totalPaid)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-brand-900 mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Collect Payment
            </h3>
            <form onSubmit={(e) => handlePayment(e, false)} className="space-y-4">
              <FormGrid cols={2}>
                <FormField label="Amount (NPR)" required>
                  <input
                    type="number"
                    className="input-field"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min={1}
                    max={debtAmount || undefined}
                    step="any"
                    placeholder="Partial or full"
                  />
                </FormField>
                <FormField label="Method">
                  <SelectField value={method} onChange={setMethod} options={[
                    { value: "cash", label: "Cash" },
                    { value: "bank", label: "Bank" },
                    { value: "esewa", label: "eSewa" },
                    { value: "khalti", label: "Khalti" },
                    { value: "fonepay", label: "Fonepay" },
                    { value: "cheque", label: "Cheque" },
                  ]} />
                </FormField>
              </FormGrid>
              <FormField label="Reference / Notes">
                <input className="input-field" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
              </FormField>
              <FormActions className="mt-0 pt-0 border-0">
                <button type="submit" disabled={saving || debtAmount <= 0} className="btn-primary flex-1">
                  {saving ? "Processing..." : "Record Payment"}
                </button>
                <button
                  type="button"
                  disabled={saving || debtAmount <= 0}
                  onClick={(e) => handlePayment(e, true)}
                  className="btn-secondary flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Mark Fully Paid
                </button>
              </FormActions>
            </form>
          </div>

          {creditAmount > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-brand-900 mb-4 flex items-center gap-2">
                <ArrowDownCircle className="w-4 h-4" /> Refund Credit
              </h3>
              <form onSubmit={(e) => handleRefund(e, false)} className="space-y-4">
                <FormGrid cols={2}>
                  <FormField label="Amount (NPR)" required>
                    <input
                      type="number"
                      className="input-field"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      min={1}
                      max={creditAmount}
                      step="any"
                      placeholder="Partial or full"
                    />
                  </FormField>
                  <FormField label="Method">
                    <SelectField value={refundMethod} onChange={setRefundMethod} options={[
                      { value: "cash", label: "Cash" },
                      { value: "bank", label: "Bank" },
                      { value: "esewa", label: "eSewa" },
                      { value: "khalti", label: "Khalti" },
                      { value: "fonepay", label: "Fonepay" },
                      { value: "cheque", label: "Cheque" },
                    ]} />
                  </FormField>
                </FormGrid>
                <FormField label="Reference / Notes">
                  <input className="input-field" value={refundReference} onChange={(e) => setRefundReference(e.target.value)} placeholder="Optional" />
                </FormField>
                <FormActions className="mt-0 pt-0 border-0">
                  <button type="submit" disabled={saving} className="btn-primary flex-1">
                    {saving ? "Processing..." : "Record Refund"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={(e) => handleRefund(e, true)}
                    className="btn-secondary"
                  >
                    Refund Full Credit
                  </button>
                </FormActions>
              </form>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-brand-100">
            <h3 className="text-sm font-semibold text-brand-900">Unpaid Invoices</h3>
          </div>
          {unpaidSales.length === 0 ? (
            <p className="text-sm text-brand-400 text-center py-8">No unpaid invoices</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-50">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-brand-600">Invoice</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-brand-600">Due</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-brand-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {unpaidSales.map((s) => (
                  <tr key={s._id}>
                    <td className="px-4 py-2.5 font-medium text-brand-800">{s.invoiceNumber}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-brand-700">{formatCurrency(s.amountDue)}</td>
                    <td className="px-4 py-2.5 text-right text-brand-400">{formatDateTime(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-brand-100 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-brand-900">{customer.name} A/C</p>
            <p className="text-xs text-brand-500">Sundry Debtors</p>
            {ledgerLines.length > 0 && (
              <p className="text-xs text-brand-400 mt-1">
                {formatAdSlash(ledgerLines[0].date)} to {formatAdSlash(ledgerLines[ledgerLines.length - 1].date)}
                {" · "}
                {formatBsDash(ledgerLines[0].date)} to {formatBsDash(ledgerLines[ledgerLines.length - 1].date)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrintPayments}
            disabled={ledgerLines.length === 0}
            className="btn-secondary text-sm py-1.5 px-3 inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print statement
          </button>
        </div>
        <AccountLedgerTable
          book="receivable"
          lines={ledgerLines}
          opening={openingBalance}
          closing={closingBalance}
        />
      </div>
    </DashboardLayout>
  );
}
