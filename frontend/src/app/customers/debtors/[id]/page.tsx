"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { customerAPI } from "@/lib/api";
import { COMPANY } from "@/lib/company";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { ArrowLeft, User, CreditCard, CheckCircle2, Printer } from "lucide-react";
import toast from "react-hot-toast";

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

function nprFigure(amount: number) {
  return formatCurrency(amount).replace(/^NPR\s*/, "");
}

function formatLedgerDate(date: string | Date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

type LedgerLine = {
  key: string;
  date: string;
  particulars: string;
  voucher: string;
  voucherNo: string;
  debit: number;
  credit: number;
  by: string;
  reference: string;
};

function buildLedger(sales: SaleRow[], payments: PaymentRow[]): LedgerLine[] {
  const saleLines: LedgerLine[] = sales.map((s) => ({
    key: `sale-${s._id}`,
    date: s.createdAt,
    particulars: "SALES A/C",
    voucher: s.type === "estimate" ? "Estimate" : "SalesInvoice",
    voucherNo: s.invoiceNumber || "",
    debit: s.total,
    credit: 0,
    by: "",
    reference: "",
  }));
  const payLines: LedgerLine[] = payments.map((p, idx) => ({
    key: `pay-${p._id}`,
    date: p.createdAt,
    particulars: `${(p.method || "cash").toUpperCase()} A/C`,
    voucher: p.type === "refund" ? "Refund" : "Receipt",
    voucherNo: String(idx + 1),
    debit: p.type === "refund" ? p.amount : 0,
    credit: p.type === "refund" ? 0 : p.amount,
    by: p.createdBy?.name || "",
    reference: p.reference || "",
  }));
  return [...saleLines, ...payLines].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

export default function DebtorManagePage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
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

  useEffect(() => { load(); }, [load]);

  const handlePayment = async (e: React.FormEvent, payFull = false) => {
    e.preventDefault();
    if (!customer) return;
    const debt = customer.debtAmount ?? customer.outstanding ?? 0;
    const payAmount = payFull ? debt : Number(amount);
    if (!payAmount || payAmount <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      await customerAPI.receivePayment(customer._id, { amount: payAmount, method, reference });
      toast.success(payFull ? "Debtor marked as fully paid!" : "Payment recorded!");
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

  const handlePrintPayments = () => {
    if (!customer) return;
    const ledger = buildLedger(sales, payments);
    if (!ledger.length) return toast.error("No transactions to print");

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const nprCell = (amount: number) => (amount ? escapeHtml(nprFigure(amount)) : "");
    const nprAlways = (amount: number) => escapeHtml(nprFigure(amount));
    const money = (amount: number) => nprFigure(Math.abs(amount));

    const totalDebit = ledger.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = ledger.reduce((sum, line) => sum + line.credit, 0);
    const debt = customer.debtAmount ?? customer.outstanding ?? 0;
    const credit = customer.creditAmount ?? customer.creditBalance ?? 0;
    const closing = debt > 0 ? debt : -credit;
    const opening = closing - totalDebit + totalCredit;

    let running = opening;
    let receiptNo = 0;
    const rows = ledger
      .map((line) => {
        running += line.debit - line.credit;
        const closeLabel = `${money(running)} ${running >= 0 ? "Dr" : "Cr"}`;
        const vNo =
          line.voucher === "Receipt" || line.voucher === "Refund"
            ? String(++receiptNo)
            : line.voucherNo;
        return `
          <tr>
            <td class="ctr">${escapeHtml(formatLedgerDate(line.date))}</td>
            <td class="part">${escapeHtml(line.particulars)}</td>
            <td class="ctr">${escapeHtml(line.voucher)}</td>
            <td class="ctr">${escapeHtml(vNo)}</td>
            <td class="num">${nprCell(line.debit)}</td>
            <td class="num">${nprCell(line.credit)}</td>
            <td class="num">${escapeHtml(closeLabel)}</td>
          </tr>`;
      })
      .join("");

    const firstDate = formatLedgerDate(ledger[0].date);
    const lastDate = formatLedgerDate(ledger[ledger.length - 1].date);
    const printDate = formatLedgerDate(new Date());
    const openingDr = opening >= 0 ? nprAlways(opening) : "";
    const openingCr = opening < 0 ? nprAlways(Math.abs(opening)) : "";
    const closingDr = closing >= 0 ? nprAlways(closing) : "";
    const closingCr = closing < 0 ? nprAlways(Math.abs(closing)) : "";

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ledger Voucher</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: "Times New Roman", Times, serif;
      font-size: 10pt;
    }
    .head { text-align: center; margin-bottom: 6px; }
    .head h1 { font-size: 20pt; margin: 0; letter-spacing: 0.3px; }
    .head .place { font-size: 11pt; margin: 1px 0 4px; }
    .head h2 { font-size: 12.5pt; margin: 0; font-weight: 700; }
    .meta {
      display: flex;
      justify-content: space-between;
      margin: 8px 0 4px;
      font-size: 10pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1.5px solid #000;
    }
    col.c1 { width: 12%; }
    col.c2 { width: 24%; }
    col.c3 { width: 14%; }
    col.c4 { width: 12%; }
    col.c5 { width: 12%; }
    col.c6 { width: 12%; }
    col.c7 { width: 14%; }
    th, td {
      border: 1px solid #000;
      padding: 3px 5px;
      vertical-align: middle;
    }
    th {
      font-weight: 700;
      text-align: center;
    }
    td.ctr { text-align: center; white-space: nowrap; }
    td.part { text-align: left; }
    td.num, th.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum" 1;
      white-space: nowrap;
    }
    td.label { text-align: right; font-weight: 700; }
    tr.sum td { font-weight: 700; }
    .sign {
      margin-top: 28px;
      text-align: right;
      font-size: 10pt;
    }
    .sign .line { display: inline-block; min-width: 160px; text-align: center; }
    .sign .name { margin-top: 2px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="head">
    <h1>${escapeHtml(COMPANY.name)}</h1>
    <div class="place">${escapeHtml(COMPANY.address)}</div>
    <h2>Ledger Voucher of ${escapeHtml(customer.name.toUpperCase())}</h2>
  </div>
  <div class="meta">
    <span>Period:- ${firstDate} TO ${lastDate}</span>
    <span>Print Date : ${printDate}</span>
  </div>
  <table>
    <colgroup>
      <col class="c1" /><col class="c2" /><col class="c3" /><col class="c4" />
      <col class="c5" /><col class="c6" /><col class="c7" />
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Particular's</th>
        <th>Voucher</th>
        <th>V. No.</th>
        <th class="num">Debit (NPR)</th>
        <th class="num">Credit (NPR)</th>
        <th class="num">Closing</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="sum">
        <td></td>
        <td class="label">Opening Balance</td>
        <td></td><td></td>
        <td class="num">${openingDr}</td>
        <td class="num">${openingCr}</td>
        <td></td>
      </tr>
      <tr class="sum">
        <td></td>
        <td class="label">Current Total</td>
        <td></td><td></td>
        <td class="num">${nprAlways(totalDebit)}</td>
        <td class="num">${nprAlways(totalCredit)}</td>
        <td></td>
      </tr>
      <tr class="sum">
        <td></td>
        <td class="label">Closing Balance</td>
        <td></td><td></td>
        <td class="num">${closingDr}</td>
        <td class="num">${closingCr}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <div class="sign">
    <div class="line">Received by</div>
    <div class="name">admin</div>
  </div>
</body>
</html>`;

    const frame = document.createElement("iframe");
    frame.setAttribute(
      "style",
      "position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;"
    );
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 800);
    }, 300);
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
  const paymentTotal = payments.reduce((sum, p) => sum + (p.type === "refund" ? -p.amount : p.amount), 0);

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-wrap gap-3">
        <Link href="/customers/debtors" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-900">
          <ArrowLeft className="w-4 h-4" /> Debtors
        </Link>
        {creditAmount > 0 && (
          <Link href="/customers/credit" className="inline-flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-900">
            Customer Credit
          </Link>
        )}
      </div>

      <PageHeader title={`Manage Account: ${customer.name}`} />

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
                  max={debtAmount}
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
          <h3 className="text-sm font-semibold text-brand-900">Payment History</h3>
          <button
            type="button"
            onClick={handlePrintPayments}
            disabled={payments.length === 0 && sales.length === 0}
            className="btn-secondary text-sm py-1.5 px-3 inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
        {payments.length === 0 && sales.length === 0 ? (
          <p className="text-sm text-brand-400 text-center py-8">No payments recorded yet</p>
        ) : (
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{ width: "26%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr className="bg-brand-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-brand-600">Date</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-brand-600">Particulars</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-brand-600">Debit (NPR)</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-brand-600">Credit (NPR)</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-brand-600">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {buildLedger(sales, payments).slice().reverse().map((line) => (
                <tr key={line.key}>
                  <td className="px-4 py-2.5 text-brand-500 whitespace-nowrap">{formatDate(line.date)}</td>
                  <td className="px-4 py-2.5 truncate">{line.voucherNo || line.particulars}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums font-medium">
                    {line.debit ? nprFigure(line.debit) : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums font-medium">
                    {line.credit ? nprFigure(line.credit) : ""}
                  </td>
                  <td className="px-4 py-2.5 text-brand-400 truncate">{line.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}
