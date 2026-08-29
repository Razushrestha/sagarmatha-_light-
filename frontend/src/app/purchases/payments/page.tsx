"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import SupplierPaymentForm, { SupplierPaymentPayload } from "@/components/purchases/SupplierPaymentForm";
import { supplierAPI, accountingAPI } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { COMPANY } from "@/lib/company";
import {
  compareSupplierLedgerLines,
  payableNet,
  withPayableClosing,
  closingLabel,
} from "@/lib/supplierLedger";
import { Plus, Banknote, Printer, Receipt, Wallet, Building2, Pencil, Trash2 } from "lucide-react";
import StatsCard from "@/components/ui/StatsCard";
import toast from "react-hot-toast";

function nprFigure(amount: number) {
  const value = Number.isFinite(amount) ? amount : 0;
  return value.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLedgerDate(date: string | Date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printHtml(title: string, html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute(
    "style",
    "position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;"
  );
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>${html}`);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 800);
  }, 300);
}

const voucherCss = `
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #fff; color: #000;
  font-family: "Times New Roman", Times, serif; font-size: 10pt;
}
.head { text-align: center; margin-bottom: 4px; }
.head h1 { font-size: 20pt; margin: 0; }
.head .place { font-size: 11pt; margin: 1px 0 4px; }
.head h2 { font-size: 12.5pt; margin: 0; font-weight: 700; }
.meta { display: flex; justify-content: space-between; margin: 8px 0 4px; font-size: 10pt; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1.5px solid #000; }
th, td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
th { font-weight: 700; text-align: center; }
td.ctr { text-align: center; white-space: nowrap; }
td.part { text-align: left; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.label { text-align: right; font-weight: 700; }
tr.sum td { font-weight: 700; }
.sign { margin-top: 28px; text-align: right; font-size: 10pt; }
.sign .name { font-weight: 700; margin-top: 2px; }
`;

type LedgerPrintLine = {
  date: string;
  particulars: string;
  voucher: string;
  voucherNo: string;
  debit: number;
  credit: number;
};

function nprCell(amount: number) {
  return amount ? escapeHtml(nprFigure(amount)) : "";
}

function nprAlways(amount: number) {
  return escapeHtml(nprFigure(amount));
}

function buildLedgerVoucherHtml(opts: {
  partyName: string;
  periodFrom: string;
  periodTo: string;
  lines: LedgerPrintLine[];
  opening: number;
  closing: number;
}) {
  let running = opts.opening;
  const rows = opts.lines
    .map((line) => {
      running += line.credit - line.debit;
      const close = closingLabel(running, nprFigure);
      return `<tr>
        <td class="ctr">${escapeHtml(formatLedgerDate(line.date))}</td>
        <td class="part">${escapeHtml(line.particulars)}</td>
        <td class="ctr">${escapeHtml(line.voucher)}</td>
        <td class="ctr">${escapeHtml(line.voucherNo)}</td>
        <td class="num">${nprCell(line.debit)}</td>
        <td class="num">${nprCell(line.credit)}</td>
        <td class="num">${escapeHtml(close)}</td>
      </tr>`;
    })
    .join("");

  const totalDebit = opts.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = opts.lines.reduce((s, l) => s + l.credit, 0);
  const openingDr = opts.opening < 0 ? nprAlways(Math.abs(opts.opening)) : opts.opening === 0 ? nprAlways(0) : "";
  const openingCr = opts.opening > 0 ? nprAlways(opts.opening) : "";
  const closingDr = opts.closing < 0 ? nprAlways(Math.abs(opts.closing)) : "";
  const closingCr = opts.closing > 0 ? nprAlways(opts.closing) : opts.closing === 0 ? nprAlways(0) : "";

  return `<style>${voucherCss}</style></head><body>
    <div class="head">
      <h1>${escapeHtml(COMPANY.name)}</h1>
      <div class="place">${escapeHtml(COMPANY.address)}</div>
      <h2>Ledger Voucher of ${escapeHtml(opts.partyName.toUpperCase())}</h2>
    </div>
    <div class="meta">
      <span>Period:- ${escapeHtml(formatLedgerDate(opts.periodFrom))} TO ${escapeHtml(formatLedgerDate(opts.periodTo))}</span>
      <span>Print Date : ${escapeHtml(formatLedgerDate(new Date()))}</span>
    </div>
    <table>
      <colgroup>
        <col style="width:12%" /><col style="width:24%" /><col style="width:14%" /><col style="width:12%" />
        <col style="width:12%" /><col style="width:12%" /><col style="width:14%" />
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
          <td colspan="4" class="label">Opening Balance:</td>
          <td class="num">${openingDr}</td>
          <td class="num">${openingCr}</td>
          <td></td>
        </tr>
        <tr class="sum">
          <td colspan="4" class="label">Current Total:</td>
          <td class="num">${nprAlways(totalDebit)}</td>
          <td class="num">${nprAlways(totalCredit)}</td>
          <td></td>
        </tr>
        <tr class="sum">
          <td colspan="4" class="label">Closing Balance:</td>
          <td class="num">${closingDr}</td>
          <td class="num">${closingCr}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="sign">
      <div>Received by</div>
      <div class="name">admin</div>
    </div>
  </body></html>`;
}

interface SupplierPayment {
  _id: string;
  paymentNumber: string;
  supplier: { _id?: string; name: string; outstanding?: number };
  bankName?: string;
  paidFromAccount?: { _id?: string; name: string; code: string };
  amount: number;
  discount: number;
  taxDeducted: number;
  total: number;
  debit?: number;
  credit?: number;
  narration?: string;
  voucherDate?: string;
  createdAt: string;
  createdBy?: { name: string };
  purchaseAllocations?: Array<{
    amount: number;
    purchase?: string | { _id?: string; invoiceNumber?: string; total?: number; amountDue?: number; createdAt?: string };
  }>;
}

interface PurchaseRow {
  _id: string;
  invoiceNumber: string;
  supplier: { _id?: string; name: string };
  total: number;
  debit?: number;
  credit?: number;
  createdAt: string;
}

interface SupplierRow {
  _id: string;
  name: string;
  outstanding: number;
  totalPurchases?: number;
  totalPaid?: number;
}

interface AccountRow {
  _id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
}

export default function SupplierPaymentsPage() {
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const [payRes, purRes] = await Promise.all([
        supplierAPI.getPayments({ limit: "200" }),
        supplierAPI.getPurchases({ limit: "200" }),
      ]);
      setPayments(payRes.data.data || []);
      setPurchases(purRes.data.data || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to load supplier ledger");
      setPayments([]);
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
    supplierAPI.getAll({ limit: "100" }).then((r) => setSuppliers(r.data.data));
    accountingAPI.getAccounts().then((r) => setAccounts(r.data.data));
  }, []);

  const loadUnpaidPurchases = useCallback(async (supplierId: string) => {
    const res = await supplierAPI.getPurchases({ supplier: supplierId, unpaid: "true", limit: "50" });
    return res.data.data;
  }, []);

  const handleCreate = async (payload: SupplierPaymentPayload) => {
    setSaving(true);
    try {
      if (editingPayment) {
        await supplierAPI.updatePayment(editingPayment._id, payload);
        toast.success("Supplier payment updated!");
      } else {
        await supplierAPI.createPayment(payload);
        toast.success("Supplier payment saved!");
      }
      setShowModal(false);
      setEditingPayment(null);
      loadPayments();
      supplierAPI.getAll({ limit: "100" }).then((r) => setSuppliers(r.data.data));
      accountingAPI.getAccounts().then((r) => setAccounts(r.data.data));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  const openEditPayment = async (paymentId: string) => {
    try {
      const res = await supplierAPI.getPayment(paymentId);
      setEditingPayment(res.data.data);
      setShowModal(true);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to load payment");
    }
  };

  const handleDeletePayment = async (p: SupplierPayment) => {
    if (!window.confirm(`Delete ${p.paymentNumber}? Supplier balance will be restored.`)) return;
    try {
      await supplierAPI.deletePayment(p._id);
      toast.success("Payment deleted");
      loadPayments();
      supplierAPI.getAll({ limit: "100" }).then((r) => setSuppliers(r.data.data));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to delete payment");
    }
  };

  type LedgerEntry = LedgerPrintLine & {
    key: string;
    kind: "purchase" | "payment";
    payment?: SupplierPayment;
    supplier?: { _id?: string; name: string; outstanding?: number };
  };

  const buildSupplierLedger = (supplierId?: string, supplierName?: string): LedgerEntry[] => {
    const match = (rowSupplier?: { _id?: string; name: string }) => {
      if (!supplierId && !supplierName) return true;
      if (supplierId && rowSupplier?._id) return rowSupplier._id === supplierId;
      if (supplierName) return rowSupplier?.name === supplierName;
      return true;
    };

    const purchaseLines: LedgerEntry[] = purchases
      .filter((pur) => match(pur.supplier))
      .map((pur) => ({
        key: `pur-${pur._id}`,
        kind: "purchase" as const,
        supplier: pur.supplier,
        date: pur.createdAt,
        particulars: "PURCHASE A/C",
        voucher: "Purchase",
        voucherNo: pur.invoiceNumber,
        debit: pur.debit ?? 0,
        credit: pur.credit ?? pur.total ?? 0,
      }));

    const paymentLines: LedgerEntry[] = payments
      .filter((pay) => match(pay.supplier))
      .map((pay) => ({
        key: `pay-${pay._id}`,
        kind: "payment" as const,
        payment: pay,
        supplier: pay.supplier,
        date: pay.voucherDate || pay.createdAt,
        particulars: `${(pay.bankName || pay.paidFromAccount?.name || "Cash").toUpperCase()} A/C`,
        voucher: "Purchase",
        voucherNo: pay.paymentNumber,
        debit: pay.debit ?? pay.total ?? 0,
        credit: pay.credit ?? 0,
      }));

    return [...purchaseLines, ...paymentLines].sort(compareSupplierLedgerLines);
  };

  const printLedger = (supplier?: { _id?: string; name: string; outstanding?: number }) => {
    const lines = buildSupplierLedger(supplier?._id, supplier?.name);
    if (!lines.length) return toast.error("No ledger entries to print");
    const listedOutstanding =
      supplier?.outstanding ??
      suppliers.find((s) => s._id === supplier?._id || s.name === supplier?.name)?.outstanding ??
      0;
    const closing = listedOutstanding;
    const opening = closing - payableNet(lines);
    printHtml(
      "Ledger Voucher",
      buildLedgerVoucherHtml({
        partyName: supplier?.name || "SUPPLIERS",
        periodFrom: lines[0].date,
        periodTo: lines[lines.length - 1].date,
        lines,
        opening,
        closing,
      })
    );
  };

  const printVoucher = (p: SupplierPayment) => printLedger(p.supplier);

  const printRegister = () => {
    const lines = buildSupplierLedger();
    if (!lines.length) return toast.error("No ledger entries to print");
    const net = payableNet(lines);
    printHtml(
      "Ledger Voucher",
      buildLedgerVoucherHtml({
        partyName: "SUPPLIERS",
        periodFrom: lines[0].date,
        periodTo: lines[lines.length - 1].date,
        lines,
        opening: 0,
        closing: net,
      })
    );
  };

  const ledgerRows = withPayableClosing(buildSupplierLedger());

  return (
    <DashboardLayout>
      <PageHeader
        title="Payment to Suppliers"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={printRegister}
              disabled={ledgerRows.length === 0}
              className="btn-secondary flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={() => { setEditingPayment(null); setShowModal(true); }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Payment to Supplier
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatsCard title="Suppliers" value={String(suppliers.length)} icon={Building2} />
        <StatsCard
          title="Total Amount"
          value={formatCurrency(suppliers.reduce((s, x) => s + (x.totalPurchases || 0), 0))}
          icon={Receipt}
        />
        <StatsCard
          title="Amount Paid"
          value={formatCurrency(suppliers.reduce((s, x) => s + (x.totalPaid || 0), 0))}
          icon={Banknote}
        />
        <StatsCard
          title="Amount to be Paid"
          value={formatCurrency(suppliers.reduce((s, x) => s + (x.outstanding || 0), 0))}
          icon={Wallet}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "12%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "8%" }} />
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
              <th className="table-header text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="table-cell">
                    <div className="h-10 bg-brand-50 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : ledgerRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-cell text-center py-12 text-gray-400">
                  <Banknote className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  No supplier payments yet
                </td>
              </tr>
            ) : (
              ledgerRows.map((row) => (
                <tr key={row.key} className="hover:bg-brand-50/50">
                  <td className="table-cell text-center whitespace-nowrap">{formatDate(row.date)}</td>
                  <td className="table-cell">{row.particulars}</td>
                  <td className="table-cell text-center">{row.voucher}</td>
                  <td className="table-cell text-center font-medium text-brand-700">{row.voucherNo}</td>
                  <td className="table-cell text-right tabular-nums font-medium">
                    {row.debit ? nprFigure(row.debit) : ""}
                  </td>
                  <td className="table-cell text-right tabular-nums font-medium">
                    {row.credit ? nprFigure(row.credit) : ""}
                  </td>
                  <td className="table-cell text-right tabular-nums whitespace-nowrap">
                    {closingLabel(row.closing, nprFigure)}
                  </td>
                  <td className="table-cell text-center">
                    <div className="inline-flex items-center justify-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => (row.payment ? printVoucher(row.payment) : printLedger(row.supplier))}
                        className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print
                      </button>
                      {row.payment && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditPayment(row.payment!._id)}
                            className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(row.payment!)}
                            className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1 text-red-700 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditingPayment(null); }} size="3xl" hideHeader>
        <SupplierPaymentForm
          key={editingPayment?._id || "new-pay"}
          suppliers={suppliers}
          accounts={accounts}
          saving={saving}
          initialPayment={editingPayment}
          onSubmit={handleCreate}
          onCancel={() => { setShowModal(false); setEditingPayment(null); }}
          loadUnpaidPurchases={loadUnpaidPurchases}
        />
      </Modal>
    </DashboardLayout>
  );
}
