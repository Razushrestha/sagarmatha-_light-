"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import PurchaseVoucherForm, { PurchaseVoucherPayload } from "@/components/purchases/PurchaseVoucherForm";
import SupplierPaymentForm, { SupplierPaymentPayload } from "@/components/purchases/SupplierPaymentForm";
import { FormField, SelectField } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { supplierAPI, productAPI, miscAPI, accountingAPI } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { COMPANY } from "@/lib/company";
import { ArrowLeft, ShoppingCart, RotateCcw, Building2, Printer, Banknote, Plus, Truck } from "lucide-react";
import toast from "react-hot-toast";
import {
  compareSupplierLedgerLines,
  payableNet,
  withPayableClosing,
  closingLabel,
} from "@/lib/supplierLedger";

interface Supplier {
  _id: string;
  name: string;
  company?: string;
  phone: string;
  contactPerson?: string;
  totalPurchases: number;
  totalPaid: number;
  outstanding: number;
  paymentTerms: string;
}

interface Purchase {
  _id: string;
  invoiceNumber: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  debit?: number;
  credit?: number;
  status: string;
  createdAt: string;
  items: Array<{ product: string; productName: string; quantity: number; unitPrice: number; subtotal: number }>;
}

interface SupplierPayment {
  _id: string;
  paymentNumber: string;
  voucherDate?: string;
  createdAt: string;
  total?: number;
  debit?: number;
  credit?: number;
  bankName?: string;
  paidFromAccount?: { name?: string };
}

interface PurchaseReturn {
  _id: string;
  returnNumber: string;
  total: number;
  refundMethod: string;
  createdAt: string;
  originalPurchase?: { invoiceNumber: string };
}

type Tab = "purchase" | "history" | "payments" | "return" | "returns";

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
html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: "Times New Roman", Times, serif; font-size: 10pt; }
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

function nprCell(amount: number) {
  return amount ? escapeHtml(nprFigure(amount)) : "";
}

function nprAlways(amount: number) {
  return escapeHtml(nprFigure(amount));
}

type LedgerLine = {
  date: string;
  particulars: string;
  voucher: string;
  voucherNo: string;
  debit: number;
  credit: number;
};

function buildLedgerVoucherHtml(opts: {
  partyName: string;
  periodFrom: string;
  periodTo: string;
  lines: LedgerLine[];
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

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [accounts, setAccounts] = useState<Array<{ _id: string; code: string; name: string; type: string; balance?: number }>>([]);
  const [tab, setTab] = useState<Tab>("history");
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);

  const [products, setProducts] = useState<Array<{ _id: string; name: string; sku?: string; purchasePrice: number; currentStock?: number; unit?: { name?: string; symbol?: string } }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  const [selectedPurchase, setSelectedPurchase] = useState("");
  const [returnItems, setReturnItems] = useState<Array<{
    product: string; productName: string; maxQty: number;
    quantity: number; unitPrice: number; subtotal: number;
  }>>([]);
  const [returnReason, setReturnReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("credit_note");

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [supRes, purRes, payRes, retRes] = await Promise.all([
        supplierAPI.getById(id),
        supplierAPI.getPurchases({ supplier: id, limit: "200" }),
        supplierAPI.getPayments({ supplier: id, limit: "200" }),
        supplierAPI.getReturns({ supplier: id }),
      ]);
      setSupplier(supRes.data.data);
      setPurchases(purRes.data.data);
      setPayments(payRes.data.data || []);
      setReturns(retRes.data.data);
    } catch {
      toast.error("Failed to load supplier");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
    productAPI.getAll({ limit: "200" }).then((r) => setProducts(r.data.data));
    miscAPI.getWarehouses().then((r) => setWarehouses(r.data.data));
    accountingAPI.getAccounts().then((r) => setAccounts(r.data.data || []));
  }, [loadData]);

  const handlePurchase = async (payload: PurchaseVoucherPayload) => {
    setSaving(true);
    try {
      await supplierAPI.createPurchase({ ...payload, supplier: id });
      toast.success("Purchase voucher saved!");
      loadData();
      setTab("history");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to record purchase");
    } finally {
      setSaving(false);
    }
  };

  const selectPurchaseForReturn = (purchaseId: string) => {
    setSelectedPurchase(purchaseId);
    const purchase = purchases.find((p) => p._id === purchaseId);
    if (purchase) {
      setReturnItems(purchase.items.map((i) => ({
        product: typeof i.product === "object" ? (i.product as { _id: string })._id : String(i.product),
        productName: i.productName,
        maxQty: i.quantity,
        quantity: 0,
        unitPrice: i.unitPrice,
        subtotal: 0,
      })));
    }
  };

  const updateReturnQty = (idx: number, qty: number) => {
    setReturnItems(returnItems.map((item, i) => {
      if (i !== idx) return item;
      const quantity = Math.min(Math.max(0, qty), item.maxQty);
      return { ...item, quantity, subtotal: quantity * item.unitPrice };
    }));
  };

  const returnTotal = returnItems.reduce((s, i) => s + i.subtotal, 0);

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const toReturn = returnItems.filter((i) => i.quantity > 0);
    if (!selectedPurchase || !toReturn.length) return toast.error("Select purchase and return quantities");
    setSaving(true);
    try {
      await supplierAPI.createPurchaseReturn(selectedPurchase, {
        items: toReturn.map((i) => ({
          product: i.product,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
        subtotal: returnTotal,
        total: returnTotal,
        vatAmount: returnTotal * 0.13,
        refundMethod,
        reason: returnReason,
      });
      toast.success("Goods return processed!");
      setSelectedPurchase("");
      setReturnItems([]);
      setReturnReason("");
      loadData();
      setTab("returns");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Return failed");
    } finally {
      setSaving(false);
    }
  };

  const loadUnpaidPurchases = useCallback(async (supplierId: string) => {
    const res = await supplierAPI.getPurchases({ supplier: supplierId, unpaid: "true", limit: "50" });
    return res.data.data || [];
  }, []);

  const handlePay = async (payload: SupplierPaymentPayload) => {
    setSaving(true);
    try {
      await supplierAPI.createPayment(payload);
      toast.success("Payment recorded");
      setShowPayModal(false);
      loadData();
      setTab("payments");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const paymentLedgerRows = withPayableClosing((() => {
    const purchaseLines: Array<LedgerLine & { key: string; kind: "purchase" | "payment" }> = purchases.map((pur) => ({
      key: `pur-${pur._id}`,
      kind: "purchase" as const,
      date: pur.createdAt,
      particulars: "PURCHASE A/C",
      voucher: "Purchase",
      voucherNo: pur.invoiceNumber,
      debit: pur.debit ?? 0,
      credit: pur.credit ?? pur.total ?? 0,
    }));
    const paymentLines: Array<LedgerLine & { key: string; kind: "purchase" | "payment" }> = payments.map((pay) => ({
      key: `pay-${pay._id}`,
      kind: "payment" as const,
      date: pay.voucherDate || pay.createdAt,
      particulars: `${(pay.bankName || pay.paidFromAccount?.name || "Cash").toUpperCase()} A/C`,
      voucher: "Payment",
      voucherNo: pay.paymentNumber,
      debit: pay.debit ?? pay.total ?? 0,
      credit: pay.credit ?? 0,
    }));
    return [...purchaseLines, ...paymentLines].sort(compareSupplierLedgerLines);
  })());

  const printPaymentLedger = () => {
    const lines = paymentLedgerRows;
    if (!lines.length) return toast.error("No ledger entries to print");
    const closing = supplier?.outstanding || payableNet(lines);
    const opening = closing - payableNet(lines);
    printHtml(
      "Ledger Voucher",
      buildLedgerVoucherHtml({
        partyName: supplier?.name || "Supplier",
        periodFrom: lines[0].date,
        periodTo: lines[lines.length - 1].date,
        lines,
        opening,
        closing,
      })
    );
  };

  const purchaseLines = (p: Purchase): LedgerLine[] => {
    const vNo = p.invoiceNumber.replace(/^PUR-0*/, "") || p.invoiceNumber;
    const lines: LedgerLine[] = [
      {
        date: p.createdAt,
        particulars: "PURCHASE A/C",
        voucher: "PurchaseInvoice",
        voucherNo: vNo,
        debit: 0,
        credit: p.total,
      },
    ];
    if (p.amountPaid > 0) {
      lines.push({
        date: p.createdAt,
        particulars: "CASH A/C",
        voucher: "Payment",
        voucherNo: vNo,
        debit: p.amountPaid,
        credit: 0,
      });
    }
    return lines;
  };

  const printPurchase = (p: Purchase) => {
    const lines = purchaseLines(p);
    const closing = p.amountDue;
    const opening = closing - payableNet(lines);
    printHtml(
      p.invoiceNumber,
      buildLedgerVoucherHtml({
        partyName: supplier?.name || "Supplier",
        periodFrom: p.createdAt,
        periodTo: p.createdAt,
        lines,
        opening,
        closing,
      })
    );
  };

  const printHistory = () => {
    if (!purchases.length) return toast.error("No purchases to print");
    const lines = [...purchases]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .flatMap(purchaseLines);
    const closing = supplier?.outstanding || 0;
    const opening = closing - payableNet(lines);
    printHtml(
      "Purchase History",
      buildLedgerVoucherHtml({
        partyName: supplier?.name || "Supplier",
        periodFrom: lines[0].date,
        periodTo: lines[lines.length - 1].date,
        lines,
        opening,
        closing,
      })
    );
  };

  if (loading || !supplier) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-brand-500">Loading supplier...</div>
      </DashboardLayout>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof ShoppingCart }[] = [
    { id: "history", label: "Purchase List", icon: Truck },
    { id: "payments", label: "Payment to Suppliers", icon: Banknote },
    { id: "purchase", label: "New Purchase", icon: ShoppingCart },
    { id: "return", label: "Goods Return", icon: RotateCcw },
    { id: "returns", label: "Return History", icon: Building2 },
  ];

  return (
    <DashboardLayout>
      <div className="mb-4">
        <Link href="/suppliers" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-800">
          <ArrowLeft className="w-4 h-4" /> Back to Suppliers
        </Link>
      </div>

      <PageHeader
        title={supplier.name}
        action={
          <div className="flex items-center gap-2">
            {tab === "history" && (
              <>
                <button
                  type="button"
                  onClick={printHistory}
                  disabled={purchases.length === 0}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
                <button type="button" onClick={() => setTab("purchase")} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" /> New Purchase
                </button>
              </>
            )}
            {tab === "payments" && (
              <>
                <button
                  type="button"
                  onClick={printPaymentLedger}
                  disabled={paymentLedgerRows.length === 0}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
                <button type="button" onClick={() => setShowPayModal(true)} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" /> New Payment to Supplier
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Total Amount</p>
          <p className="text-2xl font-bold text-brand-900 mt-1">{formatCurrency(supplier.totalPurchases)}</p>
          <p className="text-xs text-brand-400 mt-1">All purchases from this supplier</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Total Paid</p>
          <p className="text-2xl font-bold text-brand-900 mt-1">{formatCurrency(supplier.totalPaid)}</p>
          <p className="text-xs text-brand-400 mt-1">Payments made to supplier</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Total Payable</p>
          <p className={`text-2xl font-bold mt-1 ${supplier.outstanding > 0 ? "text-brand-700" : "text-brand-900"}`}>
            {formatCurrency(supplier.outstanding)}
          </p>
          <p className="text-xs text-brand-400 mt-1">Outstanding balance due</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-brand-100 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.id ? "bg-brand-900 text-white" : "bg-white text-brand-600 border border-brand-200 hover:bg-brand-50"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "purchase" && (
        <div className="card overflow-hidden">
          <PurchaseVoucherForm
            suppliers={[{ _id: supplier._id, name: supplier.name, outstanding: supplier.outstanding }]}
            products={products}
            warehouses={warehouses}
            defaultSupplierId={supplier._id}
            saving={saving}
            variant="embedded"
            onSubmit={handlePurchase}
            onCancel={() => setTab("history")}
          />
        </div>
      )}

      {tab === "history" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">PO Number</th>
                <th className="table-header">Total Amount</th>
                <th className="table-header">Paid</th>
                <th className="table-header">Payable</th>
                <th className="table-header">Status</th>
                <th className="table-header">Date</th>
                <th className="table-header text-right">Print</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-12 text-gray-400">
                    <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    No purchases yet
                  </td>
                </tr>
              ) : purchases.map((p) => (
                <tr key={p._id} className="hover:bg-brand-50/50">
                  <td className="table-cell font-medium text-brand-700">{p.invoiceNumber}</td>
                  <td className="table-cell font-medium">{formatCurrency(p.total)}</td>
                  <td className="table-cell">{formatCurrency(p.amountPaid)}</td>
                  <td className="table-cell">
                    <span className={p.amountDue > 0 ? "text-brand-700 font-medium" : "text-gray-500"}>
                      {formatCurrency(p.amountDue)}
                    </span>
                  </td>
                  <td className="table-cell"><span className="badge capitalize">{p.status}</span></td>
                  <td className="table-cell text-gray-500">{formatDateTime(p.createdAt)}</td>
                  <td className="table-cell text-right">
                    <button
                      type="button"
                      onClick={() => printPurchase(p)}
                      className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "payments" && (
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
              {paymentLedgerRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-12 text-gray-400">
                    <Banknote className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    No payments yet
                  </td>
                </tr>
              ) : paymentLedgerRows.map((row) => (
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

      {tab === "return" && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-brand-900 mb-4">Goods Return to Supplier</h3>
          <form onSubmit={handleReturn} className="form-modal">
            <FormField label="Original Purchase" required>
              <SelectField value={selectedPurchase} onChange={selectPurchaseForReturn} placeholder="Select purchase..."
                options={purchases
                  .filter((p) => p.status !== "cancelled")
                  .map((p) => ({ value: p._id, label: `${p.invoiceNumber}: ${formatCurrency(p.total)}` }))} />
            </FormField>

            {returnItems.length > 0 && (
              <div className="border border-brand-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-brand-50">
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-center">Purchased</th>
                      <th className="px-3 py-2 text-center">Return Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-brand-50">
                        <td className="px-3 py-2">{item.productName}</td>
                        <td className="px-3 py-2 text-center text-brand-500">{item.maxQty}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            max={item.maxQty}
                            value={item.quantity}
                            onChange={(e) => updateReturnQty(idx, Number(e.target.value))}
                            className="w-20 input-field py-1 text-center mx-auto"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 bg-brand-50 flex justify-between items-center">
                  <span className="text-sm font-medium text-brand-700">Return Total</span>
                  <span className="font-bold text-brand-900">{formatCurrency(returnTotal)}</span>
                </div>
              </div>
            )}

            <FormGrid cols={2}>
              <FormField label="Refund Method">
                <SelectField value={refundMethod} onChange={setRefundMethod} options={[
                  { value: "credit_note", label: "Credit Note (Reduce Payable)" },
                  { value: "cash", label: "Cash Refund" },
                  { value: "bank", label: "Bank Transfer" },
                ]} />
              </FormField>
              <FormField label="Reason">
                <input className="input-field" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Damaged, wrong item..." />
              </FormField>
            </FormGrid>

            <FormActions className="mt-0 pt-3 border-0">
              <button type="submit" disabled={saving || returnTotal <= 0} className="btn-primary">
                {saving ? "Processing..." : "Process Return"}
              </button>
            </FormActions>
          </form>
        </div>
      )}

      {tab === "returns" && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Return #</th>
                <th className="table-header">Original PO</th>
                <th className="table-header">Return Amount</th>
                <th className="table-header">Method</th>
                <th className="table-header">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {returns.length === 0 ? (
                <tr><td colSpan={5} className="table-cell text-center py-12 text-gray-400">No returns yet</td></tr>
              ) : returns.map((r) => (
                <tr key={r._id} className="hover:bg-brand-50/50">
                  <td className="table-cell font-medium text-brand-700">{r.returnNumber}</td>
                  <td className="table-cell">{r.originalPurchase?.invoiceNumber}</td>
                  <td className="table-cell font-medium">{formatCurrency(r.total)}</td>
                  <td className="table-cell capitalize">{r.refundMethod?.replace("_", " ")}</td>
                  <td className="table-cell text-gray-500">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} size="3xl" hideHeader>
        <SupplierPaymentForm
          suppliers={[{ _id: supplier._id, name: supplier.name, outstanding: supplier.outstanding }]}
          accounts={accounts}
          saving={saving}
          defaultSupplierId={supplier._id}
          onSubmit={handlePay}
          onCancel={() => setShowPayModal(false)}
          loadUnpaidPurchases={loadUnpaidPurchases}
        />
      </Modal>
    </DashboardLayout>
  );
}
