"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { accountingAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

const DailySalesChart = dynamic(() => import("@/components/reports/DailySalesChart"), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-lg bg-brand-50 animate-pulse" />,
});

export default function ReportsPage() {
  const [reportType, setReportType] = useState("sales");
  const [data, setData] = useState<Array<{ _id: string; total?: number; count?: number; quantity?: number; revenue?: number; name?: string; sku?: string; currentStock?: number; minStock?: number; purchasePrice?: number; sellingPrice?: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    accountingAPI.getReports({ type: reportType })
      .then((res) => setData(res.data.data))
      .finally(() => setLoading(false));
  }, [reportType]);

  const tabs = [
    { id: "sales", label: "Daily Sales" },
    { id: "products", label: "Top Products" },
    { id: "lowstock", label: "Low Stock" },
    { id: "inventory", label: "Stock Summary" },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Reports" />

      <div className="flex gap-2 mb-6">
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

      {reportType === "sales" && !loading && data.length > 0 && (
        <div className="card p-6 mb-6">
          <DailySalesChart data={data} />
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {reportType === "sales" && <><th className="table-header">Date</th><th className="table-header">Total</th><th className="table-header">Orders</th></>}
              {reportType === "products" && <><th className="table-header">Product</th><th className="table-header">Qty Sold</th><th className="table-header">Revenue</th></>}
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
    </DashboardLayout>
  );
}
