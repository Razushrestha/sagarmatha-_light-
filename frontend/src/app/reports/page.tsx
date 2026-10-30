"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import DateInput from "@/components/ui/DateInput";
import { accountingAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { todayISO } from "@/lib/nepaliDate";
import { RefreshCw } from "lucide-react";

const DailySalesChart = dynamic(() => import("@/components/reports/DailySalesChart"), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-lg bg-brand-50 animate-pulse" />,
});

type Row = {
  _id: string;
  total?: number;
  count?: number;
  quantity?: number;
  revenue?: number;
  name?: string;
  sku?: string;
  currentStock?: number;
  minStock?: number;
  purchasePrice?: number;
  sellingPrice?: number;
};

type PaintBucket = { quantity: number; revenue: number; litres: number; invoices: number };

type MarginRow = { _id: string; quantity?: number; revenue?: number; cost?: number; profit?: number };
type CreditRow = { _id: string; name?: string; phone?: string; outstanding?: number };
type EodReport = {
  sales: { count: number; total: number; vat: number; serviceCharge: number; cash: number; credit: number };
  profitByItem: MarginRow[];
  creditDue: CreditRow[];
  creditTotal: number;
  lowStock: Row[];
};

type PaintMixReport = {
  mix: PaintBucket;
  ready: PaintBucket;
  other: PaintBucket;
  mixShare: number;
  daily: Array<{ date: string; mixRevenue: number; readyRevenue: number; mixLitres: number; readyLitres: number }>;
};

const emptyBucket: PaintBucket = { quantity: 0, revenue: 0, litres: 0, invoices: 0 };

export default function ReportsPage() {
  const { hasModule } = useAuth();
  const tintingOn = hasModule("tinting");
  const [reportType, setReportType] = useState("sales");
  const [startDate, setStartDate] = useState(() => `${todayISO().slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(() => todayISO());
  const [data, setData] = useState<Row[]>([]);
  const [paintMix, setPaintMix] = useState<PaintMixReport | null>(null);
  const [eod, setEod] = useState<EodReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const heavy = reportType === "products" || reportType === "inventory";
    setLoading(true);
    setData([]);
    setPaintMix(null);
    setEod(null);

    const needsDates = !["lowstock", "inventory", "credit"].includes(reportType);
    const query: Record<string, string> = { type: reportType };
    if (needsDates) {
      query.startDate = reportType === "eod" ? endDate : startDate;
      query.endDate = endDate;
    }

    const applyPayload = (payload: unknown) => {
      if (reportType === "paint-mix") {
        setPaintMix(payload as PaintMixReport);
        setData([]);
      } else if (reportType === "eod") {
        setEod(payload as EodReport);
        setData([]);
      } else {
        setData((payload as Row[]) || []);
      }
    };

    const loadSync = () => accountingAPI.getReports(query)
      .then((res) => {
        if (!cancelled) applyPayload(res.data.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    if (!heavy) {
      loadSync();
      return () => { cancelled = true; };
    }

    let timer: ReturnType<typeof setTimeout>;
    accountingAPI.enqueueReport(query)
      .then(async (queued) => {
        const jobId = queued.data.data?.jobId;
        if (!jobId) throw new Error("No job id");
        const poll = async () => {
          if (cancelled) return;
          const job = await accountingAPI.getReportJob(jobId);
          const payload = job.data.data;
          if (payload.status === "completed") {
            if (!cancelled) applyPayload(payload.data);
            setLoading(false);
            return;
          }
          if (payload.status === "failed") {
            throw new Error(payload.message || "Report failed");
          }
          timer = setTimeout(poll, 600);
        };
        await poll();
      })
      .catch(() => {
        if (!cancelled) loadSync();
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reportType, startDate, endDate, reloadToken]);

  const tabs = [
    { id: "sales", label: "Daily Sales" },
    { id: "products", label: "Top Products" },
    { id: "lowstock", label: "Low Stock" },
    { id: "inventory", label: "Stock Summary" },
    { id: "eod", label: "End of day" },
    { id: "margin", label: "Profit by item" },
    { id: "credit", label: "Credit due" },
    ...(tintingOn ? [{ id: "paint-mix", label: "Mix vs ready-made" }] : []),
  ];

  useEffect(() => {
    if (!tintingOn && reportType === "paint-mix") setReportType("sales");
  }, [tintingOn, reportType]);

  const mix = paintMix?.mix || emptyBucket;
  const ready = paintMix?.ready || emptyBucket;

  return (
    <DashboardLayout>
      <PageHeader
        title="Reports"
        action={(
          <button
            type="button"
            className="btn-secondary text-sm inline-flex items-center gap-2"
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setReportType(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              reportType === tab.id ? "bg-brand-900 text-white shadow-sm" : "bg-white text-brand-700 border border-brand-200 hover:bg-brand-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!["lowstock", "inventory", "credit"].includes(reportType) && (
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          {reportType !== "eod" && (
            <div>
              <label className="label">From</label>
              <DateInput value={startDate} onChange={setStartDate} />
            </div>
          )}
          <div>
            <label className="label">{reportType === "eod" ? "Hotel / business day" : "To"}</label>
            <DateInput value={endDate} onChange={setEndDate} />
          </div>
        </div>
      )}

      {reportType === "sales" && !loading && data.length > 0 && (
        <div className="card p-6 mb-6">
          <DailySalesChart data={data} />
        </div>
      )}

      {reportType === "eod" ? (
        <div className="space-y-6">
          {loading || !eod ? (
            <div className="card h-24 bg-brand-50 animate-pulse" />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="card p-5"><p className="text-xs uppercase text-brand-400">Sales</p><p className="text-2xl font-semibold">{formatCurrency(eod.sales.total)}</p><p className="text-sm text-brand-500">{eod.sales.count} bills</p></div>
                <div className="card p-5"><p className="text-xs uppercase text-brand-400">Cash</p><p className="text-2xl font-semibold">{formatCurrency(eod.sales.cash)}</p></div>
                <div className="card p-5"><p className="text-xs uppercase text-brand-400">Credit</p><p className="text-2xl font-semibold">{formatCurrency(eod.sales.credit)}</p></div>
                <div className="card p-5"><p className="text-xs uppercase text-brand-400">VAT</p><p className="text-2xl font-semibold">{formatCurrency(eod.sales.vat)}</p></div>
                <div className="card p-5"><p className="text-xs uppercase text-brand-400">Service charge</p><p className="text-2xl font-semibold">{formatCurrency(eod.sales.serviceCharge)}</p></div>
                <div className="card p-5"><p className="text-xs uppercase text-brand-400">Credit book</p><p className="text-2xl font-semibold">{formatCurrency(eod.creditTotal)}</p></div>
              </div>
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead><tr><th className="table-header">Item</th><th className="table-header">Qty</th><th className="table-header">Revenue</th><th className="table-header">Cost</th><th className="table-header">Profit</th></tr></thead>
                  <tbody className="divide-y divide-brand-50">
                    {eod.profitByItem.length === 0 ? (
                      <tr><td colSpan={5} className="table-cell text-center py-8 text-gray-400">No sales</td></tr>
                    ) : eod.profitByItem.map((row) => (
                      <tr key={row._id}>
                        <td className="table-cell font-medium">{row._id}</td>
                        <td className="table-cell">{row.quantity}</td>
                        <td className="table-cell">{formatCurrency(row.revenue || 0)}</td>
                        <td className="table-cell">{formatCurrency(row.cost || 0)}</td>
                        <td className="table-cell">{formatCurrency(row.profit || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : reportType === "paint-mix" ? (
        <div className="space-y-6">
          {loading ? (
            <div className="card h-24 bg-brand-50 animate-pulse" />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card p-5">
                  <p className="text-xs uppercase tracking-wide text-brand-400">Mixed at counter</p>
                  <p className="text-2xl font-semibold text-brand-900 mt-1">{formatCurrency(mix.revenue)}</p>
                  <p className="text-sm text-brand-600 mt-1">{mix.litres.toFixed(1)} L · {mix.quantity} tins · {mix.invoices} bills</p>
                </div>
                <div className="card p-5">
                  <p className="text-xs uppercase tracking-wide text-brand-400">Ready-made tins</p>
                  <p className="text-2xl font-semibold text-brand-900 mt-1">{formatCurrency(ready.revenue)}</p>
                  <p className="text-sm text-brand-600 mt-1">{ready.litres.toFixed(1)} L · {ready.quantity} tins · {ready.invoices} bills</p>
                </div>
              </div>
              <p className="text-sm text-brand-500">
                Mix is {Math.round((paintMix?.mixShare || 0) * 100)}% of paint rupees. Ready-made needs pack size on the product.
              </p>
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header">Mix NPR</th>
                      <th className="table-header">Mix L</th>
                      <th className="table-header">Ready NPR</th>
                      <th className="table-header">Ready L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-50">
                    {(paintMix?.daily || []).length === 0 ? (
                      <tr><td colSpan={5} className="table-cell text-center py-12 text-gray-400">No paint sales in this period</td></tr>
                    ) : (paintMix?.daily || []).map((row) => (
                      <tr key={row.date} className="hover:bg-brand-50/50">
                        <td className="table-cell font-medium">{row.date}</td>
                        <td className="table-cell">{formatCurrency(row.mixRevenue || 0)}</td>
                        <td className="table-cell">{(row.mixLitres || 0).toFixed(1)}</td>
                        <td className="table-cell">{formatCurrency(row.readyRevenue || 0)}</td>
                        <td className="table-cell">{(row.readyLitres || 0).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {reportType === "sales" && <><th className="table-header">Date</th><th className="table-header">Total</th><th className="table-header">Orders</th></>}
              {reportType === "products" && <><th className="table-header">Product</th><th className="table-header">Qty Sold</th><th className="table-header">Revenue</th></>}
              {reportType === "margin" && <><th className="table-header">Item</th><th className="table-header">Qty</th><th className="table-header">Revenue</th><th className="table-header">Cost</th><th className="table-header">Profit</th></>}
              {reportType === "credit" && <><th className="table-header">Customer</th><th className="table-header">Phone</th><th className="table-header">Outstanding</th></>}
              {reportType === "lowstock" && <><th className="table-header">Product</th><th className="table-header">SKU</th><th className="table-header">Stock</th><th className="table-header">Min</th></>}
              {reportType === "inventory" && <><th className="table-header">Product</th><th className="table-header">SKU</th><th className="table-header">Stock</th><th className="table-header">Purchase</th><th className="table-header">Selling</th></>}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loading ? (
              <tr><td colSpan={5} className="table-cell"><div className="h-20 bg-brand-50 animate-pulse rounded" /></td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={5} className="table-cell text-center py-12 text-gray-400">No data available</td></tr>
            ) : reportType === "sales" ? data.map((row) => (
              <tr key={row._id} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium">{row._id}</td>
                <td className="table-cell">{formatCurrency(row.total || 0)}</td>
                <td className="table-cell">{row.count}</td>
              </tr>
            )) : reportType === "margin" ? data.map((row, i) => (
              <tr key={i} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium">{row._id}</td>
                <td className="table-cell">{row.quantity}</td>
                <td className="table-cell">{formatCurrency(row.revenue || 0)}</td>
                <td className="table-cell">{formatCurrency((row as MarginRow).cost || 0)}</td>
                <td className="table-cell">{formatCurrency((row as MarginRow).profit || 0)}</td>
              </tr>
            )) : reportType === "credit" ? data.map((row) => (
              <tr key={row._id} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium">{row.name}</td>
                <td className="table-cell">{(row as CreditRow).phone}</td>
                <td className="table-cell">{formatCurrency((row as CreditRow).outstanding || 0)}</td>
              </tr>
            )) : reportType === "products" ? data.map((row, i) => (
              <tr key={i} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium">{row._id}</td>
                <td className="table-cell">{row.quantity}</td>
                <td className="table-cell font-medium text-brand-700">{formatCurrency(row.revenue || 0)}</td>
              </tr>
            )) : reportType === "lowstock" ? data.map((row) => (
              <tr key={row._id} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium">{row.name}</td>
                <td className="table-cell">{row.sku}</td>
                <td className="table-cell text-brand-700 font-medium">{row.currentStock}</td>
                <td className="table-cell">{row.minStock}</td>
              </tr>
            )) : data.map((row) => (
              <tr key={row._id} className="hover:bg-brand-50/50">
                <td className="table-cell font-medium">{row.name}</td>
                <td className="table-cell">{row.sku}</td>
                <td className="table-cell">{row.currentStock}</td>
                <td className="table-cell">{formatCurrency(row.purchasePrice || 0)}</td>
                <td className="table-cell">{formatCurrency(row.sellingPrice || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </DashboardLayout>
  );
}
