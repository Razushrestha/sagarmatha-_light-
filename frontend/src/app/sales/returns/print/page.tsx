"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { saleAPI, miscAPI } from "@/lib/api";
import { COMPANY } from "@/lib/company";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";
import toast from "react-hot-toast";

interface ReturnBill {
  _id: string;
  returnNumber: string;
  createdAt: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  refundMethod?: string;
  reason?: string;
  customer?: { name?: string; phone?: string; address?: string; pan?: string; vatNumber?: string };
  originalSale?: { invoiceNumber?: string; customerName?: string; customerPhone?: string; isVatBill?: boolean };
  originalSales?: Array<{ invoiceNumber?: string }>;
  items: Array<{
    productName: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    invoiceNumber?: string;
  }>;
  createdBy?: { name?: string };
}

interface Settings {
  companyName: string;
  address: string;
  phone: string;
  pan?: string;
  vatNumber?: string;
  footerText?: string;
}

function ReturnPrintInner() {
  const searchParams = useSearchParams();
  const idKey = (searchParams.get("ids") || searchParams.get("id") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .join(",");
  const ids = idKey ? idKey.split(",") : [];

  const [bills, setBills] = useState<ReturnBill[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    miscAPI.getSettings().then((r) => setSettings(r.data.data)).catch(() => {
      setSettings({
        companyName: COMPANY.name,
        address: COMPANY.address,
        phone: COMPANY.phone,
        vatNumber: COMPANY.vatNumber,
      });
    });
  }, []);

  useEffect(() => {
    if (!ids.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(ids.map((id) => saleAPI.getReturn(id)))
      .then((responses) => setBills(responses.map((r) => r.data.data).filter(Boolean)))
      .catch(() => toast.error("Failed to load return bill"))
      .finally(() => setLoading(false));
  }, [idKey]);

  if (loading || !settings) {
    return <div className="min-h-screen flex items-center justify-center text-brand-500">Loading return bill...</div>;
  }

  if (!bills.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-brand-500">
        <p>No return bill found.</p>
        <Link href="/sales/returns" className="btn-secondary">Back to Returns</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto mb-4 px-4 flex flex-wrap gap-3 print:hidden">
        <Link href="/sales/returns" className="btn-secondary flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <button type="button" onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div id="return-bills">
        {(() => {
          const bill = bills[0];
          const extraItems = bills.slice(1).flatMap((b) => b.items || []);
          const items = [...(bill.items || []), ...extraItems];
          const vat = bills.reduce((s, b) => s + (Number(b.vatAmount) || 0), 0);
          const total = bills.reduce((s, b) => s + (Number(b.total) || 0), 0);
          const subtotal = bills.reduce((s, b) => s + (Number(b.subtotal) || b.total || 0), 0);
          const taxable = Math.max(0, total - vat);
          const customerName = bill.customer?.name || bill.originalSale?.customerName || "Walk-in Customer";
          const showVat = vat > 0 || bill.originalSale?.isVatBill !== false;
          const invoiceNos = Array.from(new Set([
            ...bills.flatMap((b) => (b.originalSales || []).map((s) => s.invoiceNumber || "")),
            ...bills.map((b) => b.originalSale?.invoiceNumber || ""),
            ...items.map((i) => i.invoiceNumber || ""),
          ].filter(Boolean)));
          return (
            <div className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none p-8 print:p-6">
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
                      <p className="text-xs uppercase tracking-wider">Sales Return</p>
                      <p className="text-lg font-bold">{bill.returnNumber}</p>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">{formatDateTime(bill.createdAt)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                <div>
                  <p className="font-semibold text-brand-800 mb-1">Returned by:</p>
                  <p className="font-medium">{customerName}</p>
                  {(bill.customer?.phone || bill.originalSale?.customerPhone) && (
                    <p className="text-gray-600">{bill.customer?.phone || bill.originalSale?.customerPhone}</p>
                  )}
                  {bill.customer?.address && <p className="text-gray-600">{bill.customer.address}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-brand-800 mb-1">Original Invoice{invoiceNos.length > 1 ? "s" : ""}</p>
                  <p className="font-medium">{invoiceNos.join(", ") || "—"}</p>
                  <p className="capitalize">Refund: {(bill.refundMethod || "cash").replace("_", " ")}</p>
                  {bill.reason && <p className="text-gray-500">Reason: {bill.reason}</p>}
                </div>
              </div>

              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="bg-brand-800 text-white">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Invoice</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2 text-brand-700 whitespace-nowrap">{item.invoiceNumber || invoiceNos[0] || "—"}</td>
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

              <div className="flex justify-end mb-6">
                <div className="w-64 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                  {showVat ? (
                    <>
                      <div className="flex justify-between"><span>Taxable Amount</span><span>{formatCurrency(taxable)}</span></div>
                      <div className="flex justify-between"><span>VAT (13%)</span><span>{formatCurrency(vat)}</span></div>
                    </>
                  ) : null}
                  <div className="flex justify-between font-bold text-lg border-t pt-2 text-brand-900">
                    <span>Refund (NPR)</span><span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 text-xs text-gray-500 space-y-2">
                <p>{settings.footerText || "Goods returned and amount adjusted as above."}</p>
                <p>Prepared by: {bill.createdBy?.name || "admin"}</p>
                <div className="flex justify-between mt-8">
                  <div className="text-center"><div className="border-t border-gray-400 w-40 pt-1">Customer Signature</div></div>
                  <div className="text-center"><div className="border-t border-gray-400 w-40 pt-1">Authorized Signature</div></div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #return-bills, #return-bills * { visibility: visible; }
          #return-bills { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

export default function SalesReturnPrintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-brand-500">Loading return bill...</div>}>
      <ReturnPrintInner />
    </Suspense>
  );
}
