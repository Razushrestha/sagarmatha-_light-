"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import PurchaseVoucherForm, { PurchaseVoucherPayload } from "@/components/purchases/PurchaseVoucherForm";
import SupplierPaymentForm, { SupplierPaymentPayload } from "@/components/purchases/SupplierPaymentForm";
import { FormField, SelectField, SearchableSelect } from "@/components/ui/FormField";
import { FormGrid, FormActions } from "@/components/ui/FormLayout";
import { supplierAPI, productAPI, miscAPI, accountingAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ArrowLeft, ShoppingCart, RotateCcw, Building2, Printer, Banknote, Plus, Truck, Pencil, Trash2, Upload, FileSpreadsheet } from "lucide-react";
import toast from "react-hot-toast";
import { compareSupplierLedgerLines, payableNet } from "@/lib/supplierLedger";
import {
  StatementLine,
  buildAccountLedgerHtml,
  printAccountLedger,
} from "@/lib/ledgerStatement";
import AccountLedgerTable from "@/components/ledger/AccountLedgerTable";
import { formatAdSlash, formatBsDash } from "@/lib/nepaliDate";

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
  warehouse?: string | { _id: string; name?: string };
  notes?: string;
  terms?: string;
  supplierBillNo?: string;
  discount?: number;
  vatAmount?: number;
  otherCosts?: number;
  items: Array<{
    product: string | { _id: string };
    productName: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    vatRate?: number;
    subtotal: number;
  }>;
}

interface SupplierPayment {
  _id: string;
  paymentNumber: string;
  voucherDate?: string;
  createdAt: string;
  amount: number;
  discount?: number;
  taxDeducted?: number;
  total?: number;
  debit?: number;
  credit?: number;
  bankName?: string;
  narration?: string;
  paidFromAccount?: { _id?: string; name?: string; code?: string };
  purchaseAllocations?: Array<{
    amount: number;
    purchase: string | { _id: string; invoiceNumber?: string; total?: number; amountDue?: number };
  }>;
}

interface PurchaseReturn {
  _id: string;
  returnNumber: string;
  total: number;
  refundMethod: string;
  createdAt: string;
  reason?: string;
  warehouse?: string | { _id: string };
  items?: Array<{
    product: string | { _id: string };
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  originalPurchase?: {
    _id?: string;
    invoiceNumber: string;
    warehouse?: string | { _id: string };
    items?: Array<{ product: string | { _id: string }; productName: string; quantity: number; unitPrice: number }>;
  };
}

type Tab = "purchase" | "history" | "payments" | "return" | "returns";

type LedgerLine = StatementLine & { kind: "purchase" | "payment" | "return"; paymentId?: string };

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
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);

  const [products, setProducts] = useState<Array<{ _id: string; name: string; sku?: string; purchasePrice: number; currentStock?: number; unit?: { name?: string; symbol?: string } }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [importingProducts, setImportingProducts] = useState(false);
  const productFileRef = useRef<HTMLInputElement>(null);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);

  const [selectedPurchase, setSelectedPurchase] = useState("");
  const [returnItems, setReturnItems] = useState<Array<{
    product: string; productName: string; maxQty: number;
    quantity: number; unitPrice: number; subtotal: number;
  }>>([]);
  const [returnReason, setReturnReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("credit_note");
  const [editingReturn, setEditingReturn] = useState<PurchaseReturn | null>(null);

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
    productAPI.getAll().then((r) => setProducts(r.data.data));
    miscAPI.getWarehouses().then((r) => setWarehouses(r.data.data));
    accountingAPI.getAccounts().then((r) => setAccounts(r.data.data || []));
  }, [loadData]);

  const saveBlob = async (request: Promise<{ data: Blob }>, fallbackName: string) => {
    const res = await request;
    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadProductTemplate = async (format: "csv" | "xlsx") => {
    try {
      await saveBlob(productAPI.downloadTemplate(format), `product-import-template.${format}`);
      toast.success(format === "csv" ? "CSV template downloaded" : "Excel template downloaded");
    } catch {
      toast.error("Could not download template");
    }
  };

  const handleBulkImportProducts = async (file?: File) => {
    if (!file || !id) return;
    setImportingProducts(true);
    try {
      const res = await productAPI.importFile(file, { supplierId: id });
      const { created, updated, errors, categoriesCreated } = res.data.data || {};
      if ((created || 0) + (updated || 0) > 0) {
        toast.success(
          `Products added to inventory: ${created || 0} new, ${updated || 0} updated` +
            (categoriesCreated ? ` · ${categoriesCreated} categor${categoriesCreated === 1 ? "y" : "ies"} added` : "")
        );
        productAPI.getAll().then((r) => setProducts(r.data.data)).catch(() => {});
      }
      if (errors?.length) {
        const first = errors[0];
        toast.error(first?.message
          ? `${errors.length} row(s) failed. ${first.row ? `Row ${first.row}: ` : ""}${first.message}`
          : `${errors.length} row(s) could not be imported`);
      } else if ((created || 0) + (updated || 0) === 0) {
        toast.error("No product rows found in that file.");
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Import failed. Use a CSV or Excel file.");
    } finally {
      setImportingProducts(false);
      if (productFileRef.current) productFileRef.current.value = "";
    }
  };

  const handlePurchase = async (payload: PurchaseVoucherPayload) => {
    setSaving(true);
    try {
      if (editingPurchase) {
        await supplierAPI.updatePurchase(editingPurchase._id, { ...payload, supplier: id });
        toast.success("Purchase updated!");
        setEditingPurchase(null);
      } else {
        await supplierAPI.createPurchase({ ...payload, supplier: id });
        toast.success("Purchase voucher saved!");
      }
      loadData();
      setTab("history");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to record purchase");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = async (purchaseId: string) => {
    try {
      const res = await supplierAPI.getPurchase(purchaseId);
      setEditingPurchase(res.data.data);
      setTab("purchase");
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
      loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to delete purchase");
    }
  };

  const fillReturnForm = (purchaseId: string, preset?: PurchaseReturn) => {
    setSelectedPurchase(purchaseId);
    const purchase = purchases.find((p) => p._id === purchaseId);
    const sourceItems = purchase?.items || preset?.originalPurchase?.items || [];
    const qtyByProduct: Record<string, number> = {};
    for (const item of preset?.items || []) {
      const pid = typeof item.product === "object" ? item.product._id : String(item.product);
      qtyByProduct[pid] = item.quantity;
    }
    setReturnItems(sourceItems.map((i) => {
      const product = typeof i.product === "object" ? (i.product as { _id: string })._id : String(i.product);
      const quantity = qtyByProduct[product] || 0;
      return {
        product,
        productName: i.productName,
        maxQty: i.quantity,
        quantity,
        unitPrice: i.unitPrice,
        subtotal: quantity * i.unitPrice,
      };
    }));
  };

  const selectPurchaseForReturn = (purchaseId: string) => {
    fillReturnForm(purchaseId);
  };

  const openEditReturn = async (returnId: string) => {
    try {
      const res = await supplierAPI.getReturn(returnId);
      const data = res.data.data as PurchaseReturn;
      const purchaseId = data.originalPurchase?._id || "";
      setEditingReturn(data);
      setRefundMethod(data.refundMethod || "credit_note");
      setReturnReason(data.reason || "");
      fillReturnForm(purchaseId, data);
      setTab("return");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to load return");
    }
  };

  const handleDeleteReturn = async (r: PurchaseReturn) => {
    if (!window.confirm(`Delete ${r.returnNumber}? Stock and supplier balance will be restored.`)) return;
    try {
      await supplierAPI.deletePurchaseReturn(r._id);
      toast.success("Return deleted");
      loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to delete return");
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
      const payload = {
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
      };
      if (editingReturn) {
        await supplierAPI.updatePurchaseReturn(editingReturn._id, payload);
        toast.success("Return updated!");
      } else {
        await supplierAPI.createPurchaseReturn(selectedPurchase, payload);
        toast.success("Goods return processed!");
      }
      setEditingReturn(null);
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
      if (editingPayment) {
        await supplierAPI.updatePayment(editingPayment._id, payload);
        toast.success("Payment updated");
      } else {
        await supplierAPI.createPayment(payload);
        toast.success("Payment recorded");
      }
      setShowPayModal(false);
      setEditingPayment(null);
      loadData();
      setTab("payments");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const openEditPayment = async (paymentId: string) => {
    try {
      const res = await supplierAPI.getPayment(paymentId);
      setEditingPayment(res.data.data);
      setShowPayModal(true);
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
      loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to delete payment");
    }
  };

  const paymentLedgerRows: LedgerLine[] = (() => {
    const purchaseLines: LedgerLine[] = purchases.map((pur) => ({
      key: `pur-${pur._id}`,
      kind: "purchase" as const,
      date: pur.createdAt,
      particulars: "Purchase",
      voucherNo: pur.invoiceNumber,
      refNo: (pur.notes || pur.terms || "").trim(),
      vchType: "Purchase",
      debit: pur.debit ?? 0,
      credit: pur.credit ?? pur.total ?? 0,
    }));
    const paymentLines: LedgerLine[] = payments.map((pay) => ({
      key: `pay-${pay._id}`,
      kind: "payment" as const,
      paymentId: pay._id,
      date: pay.voucherDate || pay.createdAt,
      particulars: pay.bankName || pay.paidFromAccount?.name || "Bank",
      voucherNo: pay.paymentNumber,
      refNo: (pay.narration || "").trim(),
      vchType: "Payment",
      debit: pay.debit ?? pay.total ?? 0,
      credit: pay.credit ?? 0,
    }));
    const returnLines: LedgerLine[] = returns.map((ret) => ({
      key: `ret-${ret._id}`,
      kind: "return" as const,
      date: ret.createdAt,
      particulars: "Purchase Return",
      voucherNo: ret.returnNumber,
      refNo: ret.originalPurchase?.invoiceNumber || "",
      vchType: "Return",
      debit: ret.total || 0,
      credit: 0,
    }));
    return [...purchaseLines, ...paymentLines, ...returnLines].sort(compareSupplierLedgerLines);
  })();

  const printFullLedger = () => {
    const lines = paymentLedgerRows;
    if (!lines.length) return toast.error("No ledger entries to print");
    const closing = supplier?.outstanding || payableNet(lines);
    const opening = closing - payableNet(lines);
    printAccountLedger(
      `${supplier?.name || "Supplier"} Ledger`,
      buildAccountLedgerHtml({
        partyName: supplier?.name || "Supplier",
        accountGroup: "Sundry Creditors",
        book: "payable",
        periodFrom: lines[0].date,
        periodTo: lines[lines.length - 1].date,
        lines,
        opening,
        closing,
      })
    );
  };

  const printPaymentLedger = printFullLedger;
  const printHistory = printFullLedger;

  const printPurchase = (p: Purchase) => {
    const lines: StatementLine[] = [{
      date: p.createdAt,
      particulars: "Purchase",
      voucherNo: p.invoiceNumber,
      refNo: (p.notes || p.terms || "").trim(),
      vchType: "Purchase",
      debit: 0,
      credit: p.total,
    }];
    if (p.amountPaid > 0) {
      lines.push({
        date: p.createdAt,
        particulars: "Bank",
        voucherNo: p.invoiceNumber,
        vchType: "Payment",
        debit: p.amountPaid,
        credit: 0,
      });
    }
    const closing = p.amountDue;
    const opening = closing - payableNet(lines);
    printAccountLedger(
      p.invoiceNumber,
      buildAccountLedgerHtml({
        partyName: supplier?.name || "Supplier",
        accountGroup: "Sundry Creditors",
        book: "payable",
        periodFrom: p.createdAt,
        periodTo: p.createdAt,
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
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={productFileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => handleBulkImportProducts(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => handleDownloadProductTemplate("xlsx")}
              className="btn-secondary flex items-center gap-2"
              title="Download Excel template"
            >
              <FileSpreadsheet className="w-4 h-4" /> Template
            </button>
            <button
              type="button"
              disabled={importingProducts}
              onClick={() => productFileRef.current?.click()}
              className="btn-secondary flex items-center gap-2"
              title="Upload CSV or Excel — products go straight into inventory"
            >
              <Upload className="w-4 h-4" /> {importingProducts ? "Uploading..." : "Bulk Upload Products"}
            </button>
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
                <button type="button" onClick={() => { setEditingPurchase(null); setTab("purchase"); }} className="btn-primary flex items-center gap-2">
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
                <button type="button" onClick={() => { setEditingPayment(null); setShowPayModal(true); }} className="btn-primary flex items-center gap-2">
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
            onClick={() => {
              if (t.id === "purchase") setEditingPurchase(null);
              if (t.id === "return") {
                setEditingReturn(null);
                setSelectedPurchase("");
                setReturnItems([]);
                setReturnReason("");
              }
              setTab(t.id);
            }}
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
            key={editingPurchase?._id || "new"}
            suppliers={[{ _id: supplier._id, name: supplier.name, outstanding: supplier.outstanding }]}
            products={products}
            warehouses={warehouses}
            defaultSupplierId={supplier._id}
            saving={saving}
            variant="embedded"
            initialPurchase={editingPurchase}
            onSubmit={handlePurchase}
            onCancel={() => { setEditingPurchase(null); setTab("history"); }}
            onProductCreated={(product) => setProducts((prev) => prev.some((p) => p._id === product._id) ? prev : [...prev, product])}
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
                <th className="table-header text-right">Actions</th>
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
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-brand-100">
            <p className="text-sm font-bold uppercase tracking-wide text-brand-900">{supplier.name} A/C</p>
            <p className="text-xs text-brand-500">Sundry Creditors</p>
            {paymentLedgerRows.length > 0 && (
              <p className="text-xs text-brand-400 mt-1">
                {formatAdSlash(paymentLedgerRows[0].date)} to {formatAdSlash(paymentLedgerRows[paymentLedgerRows.length - 1].date)}
                {" · "}
                {formatBsDash(paymentLedgerRows[0].date)} to {formatBsDash(paymentLedgerRows[paymentLedgerRows.length - 1].date)}
              </p>
            )}
          </div>
          <AccountLedgerTable
            book="payable"
            lines={paymentLedgerRows}
            opening={(supplier.outstanding || 0) - payableNet(paymentLedgerRows)}
            closing={supplier.outstanding || payableNet(paymentLedgerRows)}
            emptyText="No ledger entries yet"
            rowActions={(line) => {
              if (line.kind !== "payment" || !line.paymentId) return null;
              const payment = payments.find((p) => p._id === line.paymentId);
              if (!payment) return null;
              return (
                <div className="inline-flex items-center justify-end gap-1">
                  <button type="button" onClick={() => openEditPayment(payment._id)} className="p-1.5 rounded hover:bg-brand-100 text-brand-600" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => handleDeletePayment(payment)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }}
          />
        </div>
      )}

      {tab === "return" && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-brand-900 mb-4">
            {editingReturn ? `Edit ${editingReturn.returnNumber}` : "Goods Return to Supplier"}
          </h3>
          <form onSubmit={handleReturn} className="form-modal">
            <FormField label="Original Purchase" required>
              <SearchableSelect
                value={selectedPurchase}
                onChange={selectPurchaseForReturn}
                placeholder="Select purchase..."
                searchPlaceholder="Search by PO number or product name..."
                options={purchases
                  .filter((p) => p.status !== "cancelled")
                  .map((p) => ({
                    value: p._id,
                    label: `${p.invoiceNumber}: ${formatCurrency(p.total)}${p.items?.length ? ` — ${p.items.map((i) => i.productName).join(", ")}` : ""}`,
                  }))}
              />
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
                {saving ? "Processing..." : editingReturn ? "Update Return" : "Process Return"}
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
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {returns.length === 0 ? (
                <tr><td colSpan={6} className="table-cell text-center py-12 text-gray-400">No returns yet</td></tr>
              ) : returns.map((r) => (
                <tr key={r._id} className="hover:bg-brand-50/50">
                  <td className="table-cell font-medium text-brand-700">{r.returnNumber}</td>
                  <td className="table-cell">{r.originalPurchase?.invoiceNumber}</td>
                  <td className="table-cell font-medium">{formatCurrency(r.total)}</td>
                  <td className="table-cell capitalize">{r.refundMethod?.replace("_", " ")}</td>
                  <td className="table-cell text-gray-500">{formatDateTime(r.createdAt)}</td>
                  <td className="table-cell text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEditReturn(r._id)}
                        className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReturn(r)}
                        className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1 text-red-700 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showPayModal} onClose={() => { setShowPayModal(false); setEditingPayment(null); }} size="3xl" hideHeader>
        <SupplierPaymentForm
          key={editingPayment?._id || "new-pay"}
          suppliers={[{ _id: supplier._id, name: supplier.name, outstanding: supplier.outstanding }]}
          accounts={accounts}
          saving={saving}
          defaultSupplierId={supplier._id}
          initialPayment={editingPayment}
          onSubmit={handlePay}
          onCancel={() => { setShowPayModal(false); setEditingPayment(null); }}
          loadUnpaidPurchases={loadUnpaidPurchases}
        />
      </Modal>
    </DashboardLayout>
  );
}
