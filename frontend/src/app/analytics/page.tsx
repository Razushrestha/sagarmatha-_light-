"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import StatsCard from "@/components/ui/StatsCard";
import { saleAPI, accountingAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, ShoppingBag, Users, Package, TrendingUp, BarChart3 } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_STROKE = "#374151";
const CHART_FILL = "#f3f4f6";

export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<{
    monthSales: number; monthCount: number; totalProducts: number;
    totalCustomers: number; totalReceivable: number; monthlyTrend: Array<{ _id: { year: number; month: number }; total: number; count: number }>;
  } | null>(null);
  const [topProducts, setTopProducts] = useState<Array<{ _id: string; quantity: number; revenue: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      saleAPI.getDashboard(),
      accountingAPI.getReports({ type: "products" }),
    ]).then(([dash, products]) => {
      setDashboard(dash.data.data);
      setTopProducts(products.data.data.slice(0, 10));
    }).finally(() => setLoading(false));
  }, []);

  const trendData = dashboard?.monthlyTrend.map((item) => ({
    name: monthNames[item._id.month - 1],
    sales: item.total,
    orders: item.count,
  })) || [];

  const productChartData = topProducts.map((p) => ({
    name: p._id.length > 20 ? p._id.slice(0, 18) + "…" : p._id,
    revenue: p.revenue,
    quantity: p.quantity,
  }));

  return (
    <DashboardLayout>
      <PageHeader title="Analytics" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => <div key={i} className="card p-5 h-28 animate-pulse bg-brand-50" />)}
        </div>
      ) : dashboard && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            <StatsCard title="Monthly Revenue" value={formatCurrency(dashboard.monthSales)} subtitle={`${dashboard.monthCount} orders`} icon={DollarSign} />
            <StatsCard title="Products" value={String(dashboard.totalProducts)} icon={Package} />
            <StatsCard title="Customers" value={String(dashboard.totalCustomers)} icon={Users} />
            <StatsCard title="Receivables" value={formatCurrency(dashboard.totalReceivable)} icon={TrendingUp} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-brand-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-brand-600" strokeWidth={1.75} /> Sales Trend (12 months)
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" fontSize={12} stroke="#9ca3af" />
                  <YAxis fontSize={12} stroke="#9ca3af" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value) || 0)} />
                  <Area type="monotone" dataKey="sales" stroke={CHART_STROKE} fill={CHART_FILL} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-6">
              <h3 className="text-lg font-semibold text-brand-900 mb-4 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-brand-600" strokeWidth={1.75} /> Top Products by Revenue
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={productChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" fontSize={11} stroke="#9ca3af" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" fontSize={10} width={100} stroke="#9ca3af" />
                  <Tooltip formatter={(value) => formatCurrency(Number(value) || 0)} />
                  <Bar dataKey="revenue" fill={CHART_STROKE} radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="px-6 py-4 border-b border-brand-200">
              <h3 className="text-lg font-semibold text-brand-900">Top Selling Products</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">#</th>
                    <th className="table-header">Product</th>
                    <th className="table-header">Qty Sold</th>
                    <th className="table-header">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={i} className="hover:bg-brand-50">
                      <td className="table-cell text-brand-400">{i + 1}</td>
                      <td className="table-cell font-medium">{p._id}</td>
                      <td className="table-cell">{p.quantity}</td>
                      <td className="table-cell font-medium">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
