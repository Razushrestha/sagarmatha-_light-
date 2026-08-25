"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { saleAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Plus, FileText, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

interface Quotation {
  _id: string;
  invoiceNumber: string;
  customerName?: string;
  customer?: { name: string };
  total: number;
  status: string;
  validityDate?: string;
  createdAt: string;
}

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => saleAPI.getAll({ type: "quotation", limit: "50" })
    .then((res) => setQuotations(res.data.data))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleConvert = async (id: string) => {
    try {
      const res = await saleAPI.convertToSale(id, { payments: [{ method: "cash", amount: 0 }], amountPaid: 0 });
      toast.success(`Converted to ${res.data.data.invoiceNumber}`);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Conversion failed");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Quotations"
        action={
          <Link href="/quotations/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Quotation
          </Link>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Quotation #</th>
              <th className="table-header">Customer</th>
              <th className="table-header">Total</th>
              <th className="table-header">Status</th>
              <th className="table-header">Valid Until</th>
              <th className="table-header">Created</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loading ? (
              <tr><td colSpan={7} className="table-cell"><div className="h-10 bg-brand-50 animate-pulse rounded" /></td></tr>
            ) : quotations.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-cell text-center py-12 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  No quotations yet. <Link href="/quotations/new" className="text-brand-600 underline">Create one</Link>
                </td>
              </tr>
            ) : quotations.map((q) => (
              <tr key={q._id} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium text-brand-700">{q.invoiceNumber}</td>
                <td className="table-cell">{q.customer?.name || q.customerName || ""}</td>
                <td className="table-cell font-medium">{formatCurrency(q.total)}</td>
                <td className="table-cell"><span className="badge bg-brand-100 text-brand-700 capitalize">{q.status}</span></td>
                <td className="table-cell">{q.validityDate ? formatDateTime(q.validityDate) : ""}</td>
                <td className="table-cell text-gray-500">{formatDateTime(q.createdAt)}</td>
                <td className="table-cell">
                  {q.status === "pending" && (
                    <button onClick={() => handleConvert(q._id)} className="text-brand-600 hover:text-brand-800 text-sm flex items-center gap-1">
                      <ArrowRight className="w-4 h-4" /> Convert to Sale
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
