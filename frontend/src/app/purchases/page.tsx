"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import PurchaseVoucherForm, { PurchaseVoucherPayload } from "@/components/purchases/PurchaseVoucherForm";
import { supplierAPI, productAPI, miscAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { COMPANY } from "@/lib/company";
import { Plus, Truck, Printer, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { closingLabel, payableNet } from "@/lib/supplierLedger";

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

interface Purchase {
  _id: string;
  invoiceNumber: string;
  supplier: { name: string; company?: string };
  total: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  createdAt: string;
  warehouse?: string | { _id: string; name?: string };
  notes?: string;
  terms?: string;
  discount?: number;
  vatAmount?: number;
  otherCosts?: number;
  items?: Array<{
    product: string | { _id: string };
    productName: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    vatRate?: number;
    subtotal: number;
  }>;
}

interface SupplierRow {
  _id: string;
  name: string;
  outstanding: number;
  paymentTerms?: string;
}

interface ProductRow {
  _id: string;
  name: string;
  sku?: string;
  purchasePrice: number;
  currentStock?: number;
  unit?: { name?: string; symbol?: string };
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);

  useEffect(() => {
    loadPurchases();
    supplierAPI.getAll({ limit: "100" }).then((r) => setSuppliers(r.data.data));
    productAPI.getAll({ limit: "200" }).then((r) => setProducts(r.data.data));
    miscAPI.getWarehouses().then((r) => setWarehouses(r.data.data));
  }, []);

  const loadPurchases = async () => {
    setLoading(true);
    try {
      const res = await supplierAPI.getPurchases({ limit: "50" });
      setPurchases(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (payload: PurchaseVoucherPayload) => {
    setSaving(true);
    try {
      if (editingPurchase) {
        await supplierAPI.updatePurchase(editingPurchase._id, { ...payload, type: "invoice" });
        toast.success("Purchase updated!");
        setEditingPurchase(null);
      } else {
        await supplierAPI.createPurchase({ ...payload, type: "invoice" });
        toast.success("Purchase voucher saved!");
      }
      setShowModal(false);
      loadPurchases();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to save purchase");
    } finally {
      setSaving(false);
    }
  };

  const openModal = () => {
    setEditingPurchase(null);
    setShowModal(true);
  };

  const openEdit = async (purchaseId: string) => {
    try {
      const res = await supplierAPI.getPurchase(purchaseId);
      setEditingPurchase(res.data.data);
      setShowModal(true);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to load purchase");
    }
  };

  const handleDelete = async (p: Purchase) => {
    if (!window.confirm(`Delete ${p.invoiceNumber}? Stock and supplier balance will be reversed.`)) return;
    try {
      await supplierAPI.deletePurchase(p._id);
      toast.success("Purchase deleted");
      loadPurchases();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to delete purchase");
    }
  };

  const purchaseLines = (p: Purchase): LedgerLine[] => {
    const lines: LedgerLine[] = [
      {
        date: p.createdAt,
        particulars: "PURCHASE A/C",
        voucher: "PurchaseInvoice",
        voucherNo: p.invoiceNumber.replace(/^PUR-0*/, "") || p.invoiceNumber,
        debit: 0,
        credit: p.total,
      },
    ];
    if (p.amountPaid > 0) {
      lines.push({
        date: p.createdAt,
        particulars: "CASH A/C",
        voucher: "Payment",
        voucherNo: p.invoiceNumber.replace(/^PUR-0*/, "") || p.invoiceNumber,
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
        partyName: p.supplier?.name || "Supplier",
        periodFrom: p.createdAt,
        periodTo: p.createdAt,
        lines,
        opening,
        closing,
      })
    );
  };

  const printRegister = () => {
    if (!purchases.length) return toast.error("No purchases to print");
    const lines = [...purchases]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .flatMap(purchaseLines);
    const net = payableNet(lines);
    printHtml(
      "Purchases",
      buildLedgerVoucherHtml({
        partyName: "PURCHASES",
        periodFrom: lines[0].date,
        periodTo: lines[lines.length - 1].date,
        lines,
        opening: 0,
        closing: net,
      })
    );
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Purchases"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={printRegister}
              disabled={purchases.length === 0}
              className="btn-secondary flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={openModal} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Purchase
            </button>
          </div>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">PO Number</th>
              <th className="table-header">Supplier</th>
              <th className="table-header">Total Amount</th>
              <th className="table-header">Paid</th>
              <th className="table-header">Payable</th>
              <th className="table-header">Status</th>
              <th className="table-header">Date</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}><td colSpan={8} className="table-cell"><div className="h-10 bg-brand-50 rounded animate-pulse" /></td></tr>
              ))
            ) : purchases.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-cell text-center py-12 text-gray-400">
                  <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />No purchases yet
                </td>
              </tr>
            ) : (
              purchases.map((p) => (
                <tr key={p._id} className="hover:bg-brand-50/50">
                  <td className="table-cell font-medium text-brand-700">{p.invoiceNumber}</td>
                  <td className="table-cell">{p.supplier?.name}</td>
                  <td className="table-cell font-medium">{formatCurrency(p.total)}</td>
                  <td className="table-cell text-brand-900">{formatCurrency(p.amountPaid)}</td>
                  <td className="table-cell">
                    <span className={p.amountDue > 0 ? "text-brand-700 font-medium" : "text-gray-500"}>
                      {formatCurrency(p.amountDue)}
                    </span>
                  </td>
                  <td className="table-cell"><span className="badge badge capitalize">{p.status}</span></td>
                  <td className="table-cell text-gray-500">{formatDateTime(p.createdAt)}</td>
                  <td className="table-cell text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => printPurchase(p)}
                        className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(p._id)}
                        className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1 text-red-700 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditingPurchase(null); }} size="3xl" hideHeader>
        <PurchaseVoucherForm
          key={editingPurchase?._id || "new"}
          suppliers={suppliers}
          products={products}
          warehouses={warehouses}
          saving={saving}
          initialPurchase={editingPurchase}
          onSubmit={handleCreate}
          onCancel={() => { setShowModal(false); setEditingPurchase(null); }}
        />
      </Modal>
    </DashboardLayout>
  );
}
