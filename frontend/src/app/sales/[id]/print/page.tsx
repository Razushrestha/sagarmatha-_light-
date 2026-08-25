"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { saleAPI, miscAPI } from "@/lib/api";
import { COMPANY } from "@/lib/company";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Printer, ArrowLeft, Receipt, X, Download } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "bank", label: "Bank" },
  { id: "esewa", label: "eSewa" },
  { id: "fonepay", label: "Fonepay" },
  { id: "khalti", label: "Khalti" },
] as const;

interface Sale {
  _id: string;
  invoiceNumber: string;
  type?: string;
  status?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerPan?: string;
  customer?: { name: string; phone: string; address?: string; pan?: string; vatNumber?: string };
  items: Array<{ productName: string; sku?: string; quantity: number; unitPrice: number; subtotal: number }>;
  subtotal: number;
  discount: number;
  vatAmount: number;
  total: number;
  returnedTotal?: number;
  amountPaid: number;
  amountDue: number;
  payments: Array<{ method: string; amount: number }>;
  isVatBill: boolean;
  createdAt: string;
  createdBy?: { name: string };
}

interface Settings {
  companyName: string;
  address: string;
  phone: string;
  pan: string;
  vatNumber: string;
  termsAndConditions?: string;
  footerText?: string;
}

interface PaymentLine { method: string; amount: number; }

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sale, setSale] = useState<Sale | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showConvert, setShowConvert] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: "cash", amount: 0 }]);
  const [converting, setConverting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    saleAPI.getById(id).then((r) => setSale(r.data.data));
    miscAPI.getSettings().then((r) => setSettings(r.data.data)).catch(() => {
      setSettings({
        companyName: COMPANY.name,
        address: COMPANY.address,
        phone: COMPANY.phone,
        pan: "",
        vatNumber: COMPANY.vatNumber,
      });
    });
  }, [id]);

  useEffect(() => {
    if (!sale || sale.type !== "estimate" || sale.status === "completed") return;
    setPayments([{ method: "cash", amount: sale.total }]);
    setShowConvert(true);
  }, [sale]);

  const startConvert = () => {
    if (!sale) return;
    setSelectedPaymentMethod("cash");
    setPayments([{ method: "cash", amount: sale.total }]);
    setShowConvert(true);
  };

  const cashPaidTotal = payments.filter((p) => p.method !== "credit").reduce((s, p) => s + (p.amount || 0), 0);
  const creditTotal = payments.filter((p) => p.method === "credit").reduce((s, p) => s + (p.amount || 0), 0);
  const paidTotal = cashPaidTotal;
  const change = sale && cashPaidTotal > sale.total ? cashPaidTotal - sale.total : 0;
  const amountDue = sale ? (creditTotal > 0 ? creditTotal : Math.max(0, sale.total - cashPaidTotal)) : 0;

  const updatePayment = (idx: number, field: keyof PaymentLine, value: string | number) => {
    setPayments(payments.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const addPaymentLine = () => setPayments([...payments, { method: "cash", amount: 0 }]);
  const removePayment = (idx: number) => setPayments(payments.filter((_, i) => i !== idx));

  const handleConvertToBill = async () => {
    if (!sale) return;
    if (cashPaidTotal < sale.total && !payments.some((p) => p.method === "credit")) {
      return toast.error("Add debtor payment for remaining balance or pay full amount");
    }
    setConverting(true);
    try {
      const res = await saleAPI.convertToSale(sale._id, {
        payments: payments.filter((p) => p.amount > 0),
        amountPaid: cashPaidTotal,
        amountDue,
        isVatBill: sale.isVatBill,
      });
      toast.success(`Invoice ${res.data.data.invoiceNumber} created!`);
      router.push(`/sales/${res.data.data._id}/print`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to convert to bill");
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = async () => {
    const element = document.getElementById("invoice");
    if (!element || !sale) return;

    setDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${sale.invoiceNumber}.pdf`);
      toast.success("Download started");
    } catch {
      toast.error("Failed to download copy");
    } finally {
      setDownloading(false);
    }
  };

  if (!sale || !settings) {
    return <div className="min-h-screen flex items-center justify-center">Loading invoice...</div>;
  }

  const taxableAmount = sale.total - sale.vatAmount;
  const isEstimate = sale.type === "estimate" && sale.status !== "completed";

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto mb-4 px-4 flex flex-wrap gap-3 print:hidden">
        <Link href="/sales" className="btn-secondary flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Back</Link>
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer className="w-4 h-4" /> Print
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="btn-secondary flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          {downloading ? "Preparing..." : "Download a Copy"}
        </button>
        {isEstimate && !showConvert && (
          <button onClick={startConvert} className="btn-accent flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Convert to Bill
          </button>
        )}
      </div>

      {isEstimate && showConvert && (
        <div className="max-w-3xl mx-auto mb-4 px-4 print:hidden">
          <div className="bg-white border border-brand-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-900">Convert Estimate to Bill</h2>
              <button type="button" onClick={() => setShowConvert(false)} className="text-brand-400 hover:text-brand-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-brand-600">
              {sale.invoiceNumber} · Total {formatCurrency(sale.total)}
            </p>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-500 mb-2">Payment Method</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => {
                      setSelectedPaymentMethod(method.id);
                      setPayments((prev) => prev.map((p, i) => i === 0 ? { ...p, method: method.id } : p));
                    }}
                    className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors ${
                      selectedPaymentMethod === method.id
                        ? "bg-brand-900 text-white border-brand-900"
                        : "bg-white text-brand-700 border-brand-200 hover:bg-brand-50"
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium text-brand-700">Split Payments</p>
                <button type="button" onClick={addPaymentLine} className="text-xs text-brand-600 hover:underline">+ Add</button>
              </div>
              {payments.map((p, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={p.method}
                    onChange={(e) => updatePayment(idx, "method", e.target.value)}
                    className="input-field text-xs w-28 py-1.5"
                  >
                    {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    <option value="credit">Credit</option>
                  </select>
                  <input
                    type="number"
                    value={p.amount || ""}
                    onChange={(e) => updatePayment(idx, "amount", Number(e.target.value))}
                    placeholder="Amount"
                    className="input-field flex-1 py-1.5 text-sm"
                  />
                  {payments.length > 1 && (
                    <button type="button" onClick={() => removePayment(idx)} className="text-brand-700">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <div className="text-sm space-y-1 bg-brand-50 rounded-lg p-3">
                <div className="flex justify-between"><span>Paid</span><span className="font-medium">{formatCurrency(paidTotal)}</span></div>
                {amountDue > 0 && <div className="flex justify-between text-brand-700"><span>Due (Credit)</span><span className="font-medium">{formatCurrency(amountDue)}</span></div>}
                {change > 0 && <div className="flex justify-between text-brand-900"><span>Change</span><span className="font-medium">{formatCurrency(change)}</span></div>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowConvert(false)} className="btn-secondary py-2.5">Cancel</button>
              <button
                type="button"
                onClick={handleConvertToBill}
                disabled={converting}
                className="btn-accent flex items-center justify-center gap-2 py-2.5"
              >
                <Receipt className="w-4 h-4" />
                {converting ? "Creating..." : "Create Bill"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none p-8 print:p-6" id="invoice">
        {/* Header */}
        <div className="border-b-2 border-brand-800 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-brand-900">{settings.companyName}</h1>
              <p className="text-sm text-gray-600 mt-1">{settings.address}</p>
              <p className="text-sm text-gray-600">Tel: {settings.phone}</p>
              {settings.vatNumber && <p className="text-sm text-gray-600">VAT: {settings.vatNumber}</p>}
            </div>
            <div className="text-right">
              <div className="bg-brand-800 text-white px-4 py-2 rounded-lg">
                <p className="text-xs uppercase tracking-wider">
                  {sale.type === "estimate" ? "Estimate" : sale.isVatBill ? "Tax Invoice" : "Invoice"}
                </p>
                <p className="text-lg font-bold">{sale.invoiceNumber}</p>
              </div>
              <p className="text-sm text-gray-500 mt-2">{formatDateTime(sale.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Customer */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <p className="font-semibold text-brand-800 mb-1">Bill To:</p>
            <p className="font-medium">{sale.customer?.name || sale.customerName || "Walk-in Customer"}</p>
            {(sale.customer?.phone || sale.customerPhone) && (
              <p className="text-gray-600">{sale.customer?.phone || sale.customerPhone}</p>
            )}
            {(sale.customerAddress || sale.customer?.address) && (
              <p className="text-gray-600">{sale.customerAddress || sale.customer?.address}</p>
            )}
            {(sale.customer?.pan || sale.customerPan) && <p className="text-gray-600">PAN: {sale.customer?.pan || sale.customerPan}</p>}
            {sale.customer?.vatNumber && <p className="text-gray-600">VAT: {sale.customer.vatNumber}</p>}
          </div>
          <div className="text-right">
            <p className="font-semibold text-brand-800 mb-1">Payment Status</p>
            <p>Paid: <span className="font-medium text-brand-900">{formatCurrency(sale.amountPaid || 0)}</span></p>
            <p>Due: <span className={`font-medium ${(sale.amountDue || 0) > 0 ? "text-brand-700" : "text-gray-500"}`}>{formatCurrency(sale.amountDue || 0)}</span></p>
          </div>
        </div>

        {/* Items */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="bg-brand-800 text-white">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{item.productName}</p>
                  {item.sku && <p className="text-xs text-gray-400">{item.sku}</p>}
                </td>
                <td className="px-3 py-2 text-right">{item.quantity}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(sale.subtotal)}</span></div>
            {sale.discount > 0 && <div className="flex justify-between text-brand-700"><span>Discount ({sale.discount}%)</span><span>-{formatCurrency(sale.subtotal * sale.discount / 100)}</span></div>}
            <div className="flex justify-between"><span>Taxable Amount</span><span>{formatCurrency(taxableAmount)}</span></div>
            {sale.isVatBill ? (
              <div className="flex justify-between"><span>VAT (13%)</span><span>{formatCurrency(sale.vatAmount)}</span></div>
            ) : (
              <div className="flex justify-between text-gray-400"><span>VAT</span><span>Not applicable</span></div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2 text-brand-900">
              <span>Total (NPR)</span><span>{formatCurrency(sale.total)}</span>
            </div>
            {(sale.returnedTotal || 0) > 0 && (
              <>
                <div className="flex justify-between text-brand-700">
                  <span>Returned</span><span>-{formatCurrency(sale.returnedTotal || 0)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Net after return</span>
                  <span>{formatCurrency(Math.max(0, sale.total - (sale.returnedTotal || 0)))}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payments */}
        {sale.payments?.length > 0 && (
          <div className="mb-6 text-sm">
            <p className="font-semibold text-brand-800 mb-2">Payment Details:</p>
            <div className="flex gap-4 flex-wrap">
              {sale.payments.map((p, i) => (
                <span key={i} className="bg-brand-50 px-3 py-1 rounded capitalize">{p.method}: {formatCurrency(p.amount)}</span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t pt-4 text-xs text-gray-500 space-y-2">
          {settings.termsAndConditions && <p><strong>Terms:</strong> {settings.termsAndConditions}</p>}
          <p>{settings.footerText || "Thank you for your business!"}</p>
          <div className="flex justify-between mt-8">
            <div className="text-center"><div className="border-t border-gray-400 w-40 pt-1">Customer Signature</div></div>
            <div className="text-center"><div className="border-t border-gray-400 w-40 pt-1">Authorized Signature</div></div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #invoice, #invoice * { visibility: visible; }
          #invoice { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
