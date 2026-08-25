"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { FormField } from "@/components/ui/FormField";
import { FormBackLink, FormGrid, FormActions } from "@/components/ui/FormLayout";
import { electricianAPI } from "@/lib/api";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  Banknote,
  CalendarDays,
  ExternalLink,
  FileText,
  MapPin,
  Phone,
  Receipt,
  Wallet,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";

interface Electrician {
  _id: string;
  name: string;
  number1: string;
  number2?: string;
  address?: string;
}

interface CommissionPayment {
  _id?: string;
  amount: number;
  date: string;
  notes?: string;
}

interface SaleRow {
  _id: string;
  invoiceNumber: string;
  type?: string;
  customerName?: string;
  createdAt: string;
  total: number;
  originalTotal?: number;
  returnedTotal?: number;
  commission: number;
}

interface CommissionSummary {
  rate: number;
  total: number;
  totalBill: number;
  month: number;
  threeMonths: number;
  sixMonths: number;
  year: number;
  received: number;
  toTake: number;
  payments: CommissionPayment[];
  sales?: SaleRow[];
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: typeof Wallet;
  tone?: "default" | "amber" | "dark";
}) {
  const styles = {
    default: "border-brand-100 bg-white text-brand-500",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    dark: "border-brand-800 bg-brand-900 text-brand-200",
  }[tone];
  const valueClass = {
    default: "text-brand-900",
    amber: "text-amber-950",
    dark: "text-white",
  }[tone];

  return (
    <div className={cn("rounded-2xl border p-4 sm:p-5 shadow-sm", styles)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
          <p className={cn("mt-2 text-lg font-semibold tabular-nums tracking-tight sm:text-xl", valueClass)}>
            {formatCurrency(value)}
          </p>
        </div>
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
          tone === "dark" ? "bg-white/10" : tone === "amber" ? "bg-amber-100" : "bg-brand-50"
        )}>
          <Icon className={cn("w-4 h-4", tone === "dark" ? "text-white" : tone === "amber" ? "text-amber-800" : "text-brand-700")} />
        </div>
      </div>
    </div>
  );
}

export default function ElectricianCommissionPage() {
  const { id } = useParams<{ id: string }>();
  const [electrician, setElectrician] = useState<Electrician | null>(null);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await electricianAPI.getCommission(id);
      setElectrician(res.data.data.electrician);
      setSummary(res.data.data.summary);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to load commission");
      setElectrician(null);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setPaying(true);
    try {
      const res = await electricianAPI.receiveCommission(id, {
        amount,
        notes: payNotes.trim(),
      });
      setElectrician(res.data.data.electrician);
      setSummary(res.data.data.summary);
      setPayAmount("");
      setPayNotes("");
      toast.success("Payment recorded");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not record payment");
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <FormBackLink href="/electricians" label="Electricians" />
        <div className="h-36 bg-brand-50 rounded-2xl animate-pulse mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-brand-50 rounded-2xl animate-pulse" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  if (!electrician || !summary) {
    return (
      <DashboardLayout>
        <FormBackLink href="/electricians" label="Electricians" />
        <p className="text-brand-500">Electrician not found.</p>
      </DashboardLayout>
    );
  }

  const bills = summary.sales || [];

  return (
    <DashboardLayout>
      <FormBackLink href="/electricians" label="Electricians" />

      <section className="relative overflow-hidden rounded-2xl bg-brand-900 text-white p-6 sm:p-8 mb-6">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-white/5" />
        <div className="absolute -right-6 bottom-0 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-brand-300 mb-2">Electrician ledger</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{electrician.name}</h1>
            <p className="text-sm text-brand-200 mt-2 max-w-xl">
              Commission is calculated item by item. Wire and cable lines stay at 0%.
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-brand-100 mt-4">
              <span className="inline-flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-brand-300" />
                {electrician.name}
              </span>
              <a href={`tel:${electrician.number1}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <Phone className="w-3.5 h-3.5" />
                {electrician.number1}
              </a>
              {electrician.number2 && (
                <a href={`tel:${electrician.number2}`} className="inline-flex items-center gap-1.5 hover:text-white">
                  <Phone className="w-3.5 h-3.5" />
                  {electrician.number2}
                </a>
              )}
              {electrician.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-brand-300" />
                  {electrician.address}
                </span>
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 px-5 py-4 min-w-[220px]">
            <p className="text-xs uppercase tracking-wide text-brand-200">Amount remaining</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{formatCurrency(summary.toTake)}</p>
            <p className="text-xs text-brand-300 mt-1">
              {formatCurrency(summary.received)} already paid
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Total bill" value={summary.totalBill} icon={Receipt} tone="dark" />
        <StatCard label="Total commission" value={summary.total} icon={Wallet} />
        <StatCard label="This month" value={summary.month} icon={CalendarDays} />
        <StatCard label="3 months" value={summary.threeMonths} icon={CalendarDays} />
        <StatCard label="6 months" value={summary.sixMonths} icon={CalendarDays} />
        <StatCard label="1 year" value={summary.year} icon={CalendarDays} />
        <StatCard label="Total received" value={summary.received} icon={Banknote} />
        <StatCard label="Amount remaining" value={summary.toTake} icon={Wallet} tone="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-6">
        <div className="xl:col-span-2 card p-5">
          <h2 className="text-sm font-semibold text-brand-900 mb-1">Pay electrician</h2>
          <p className="text-xs text-brand-400 mb-4">Recorded payments reduce the remaining amount.</p>
          <form onSubmit={handlePay} className="space-y-4">
            <FormGrid cols={2}>
              <FormField label="Amount" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </FormField>
              <FormField label="Notes">
                <input
                  className="input-field"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Optional"
                />
              </FormField>
            </FormGrid>
            <FormActions>
              <button
                type="submit"
                className="btn-primary"
                disabled={paying || summary.toTake <= 0}
              >
                {paying ? "Saving..." : "Record payment"}
              </button>
            </FormActions>
          </form>
        </div>

        <div className="xl:col-span-3 card overflow-hidden">
          <div className="px-5 py-4 border-b border-brand-100">
            <h2 className="text-sm font-semibold text-brand-900">Payment history</h2>
          </div>
          {summary.payments.length === 0 ? (
            <p className="text-sm text-brand-400 py-10 text-center">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Date</th>
                    <th className="table-header">Amount</th>
                    <th className="table-header">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50">
                  {summary.payments.map((p, i) => (
                    <tr key={p._id || i} className="hover:bg-brand-50/50">
                      <td className="table-cell">{formatDate(p.date)}</td>
                      <td className="table-cell font-medium">{formatCurrency(p.amount)}</td>
                      <td className="table-cell text-brand-500">{p.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-brand-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-brand-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-500" />
              Assigned bills
            </h2>
            <p className="text-xs text-brand-400 mt-0.5">
              Sales tagged to {electrician.name}. Commission follows each item’s rate.
            </p>
          </div>
          <span className="text-xs font-medium text-brand-500 bg-brand-50 border border-brand-100 rounded-full px-2.5 py-1">
            {bills.length} bill{bills.length === 1 ? "" : "s"}
          </span>
        </div>
        {bills.length === 0 ? (
          <div className="py-14 text-center text-brand-400">
            <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No bills assigned yet.</p>
            <p className="text-xs mt-1">Choose this electrician in the cart when making a sale.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Invoice</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Bill amount</th>
                  <th className="table-header">Commission</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {bills.map((sale) => (
                  <tr key={sale._id} className="hover:bg-brand-50/60">
                    <td className="table-cell font-semibold text-brand-900">{sale.invoiceNumber}</td>
                    <td className="table-cell whitespace-nowrap">{formatDate(sale.createdAt)}</td>
                    <td className="table-cell">{sale.customerName || "Walk-in"}</td>
                    <td className="table-cell capitalize">{sale.type || "invoice"}</td>
                    <td className="table-cell tabular-nums">
                      {formatCurrency(sale.total)}
                      {(sale.returnedTotal || 0) > 0 && (
                        <p className="text-xs text-gray-400">Returned {formatCurrency(sale.returnedTotal || 0)}</p>
                      )}
                    </td>
                    <td className="table-cell tabular-nums font-medium text-brand-800">
                      {formatCurrency(sale.commission)}
                    </td>
                    <td className="table-cell text-right">
                      <Link
                        href={`/sales/${sale._id}/print`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-950"
                      >
                        View <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
