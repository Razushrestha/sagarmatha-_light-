"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/ui/StatsCard";
import PageHeader from "@/components/ui/PageHeader";
import { saleAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  DollarSign, ShoppingBag, Package, Users, AlertTriangle,
  TrendingUp, CreditCard, ArrowUpRight,
} from "lucide-react";

const SalesTrendChart = dynamic(() => import("@/components/dashboard/SalesTrendChart"), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-lg bg-brand-50 animate-pulse" />,
});

interface DashboardData {
  todaySales: number;
  todayCount: number;
  monthSales: number;
  monthCount: number;
  totalProducts: number;
  lowStockProducts: number;
  totalCustomers: number;
  totalReceivable: number;
  totalPayable: number;
  recentSales: Array<{
    _id: string;
    invoiceNumber: string;
    total: number;
    customer?: { name: string };
    customerName?: string;
    createdAt: string;
  }>;
  monthlyTrend: Array<{ _id: { year: number; month: number }; total: number; count: number }>;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    saleAPI.getDashboard()
      .then((res) => setData(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const chartData = (() => {
    const trend = data?.monthlyTrend || [];
    if (trend.length >= 12) {
      return trend.map((item) => ({
        name: monthNames[item._id.month - 1],
        sales: item.total || 0,
        orders: item.count || 0,
      }));
    }
    const byMonth = new Map(
      trend.map((item) => [`${item._id.year}-${item._id.month}`, item])
    );
    const now = new Date();
    return Array.from({ length: 12 }, (_, index) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const item = byMonth.get(`${year}-${month}`);
      return {
        name: monthNames[month - 1],
        sales: item?.total || 0,
        orders: item?.count || 0,
      };
    });
  })();

  return (
    <DashboardLayout>
      <PageHeader title="Dashboard" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 h-28 animate-pulse bg-brand-50" />
          ))}
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            <StatsCard title="Today's Sales" value={formatCurrency(data.todaySales)} subtitle={`${data.todayCount} transactions`} icon={DollarSign} />
            <StatsCard title="Monthly Sales" value={formatCurrency(data.monthSales)} subtitle={`${data.monthCount} transactions`} icon={TrendingUp} />
            <StatsCard title="Total Products" value={String(data.totalProducts)} subtitle={`${data.lowStockProducts} low stock`} icon={Package} />
            <StatsCard title="Customers" value={String(data.totalCustomers)} subtitle="Active customers" icon={Users} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <StatsCard title="Receivables" value={formatCurrency(data.totalReceivable)} icon={CreditCard} />
            <StatsCard title="Payables" value={formatCurrency(data.totalPayable)} icon={AlertTriangle} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-brand-900">Sales Trend</h3>
                <p className="text-xs text-brand-500">Last 12 months</p>
              </div>
              <SalesTrendChart data={chartData} />
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-brand-900">Recent Sales</h3>
                <ShoppingBag className="w-5 h-5 text-brand-500" strokeWidth={1.75} />
              </div>
              <div className="space-y-3">
                {data.recentSales.length === 0 ? (
                  <p className="text-sm text-brand-400 text-center py-8">No sales yet</p>
                ) : (
                  data.recentSales.map((sale) => (
                    <div key={sale._id} className="flex items-center justify-between p-3 rounded-lg hover:bg-brand-50 transition-colors border border-transparent hover:border-brand-200">
                      <div>
                        <p className="text-sm font-medium text-brand-900">{sale.invoiceNumber}</p>
                        <p className="text-xs text-brand-500">
                          {sale.customer?.name || sale.customerName || "Walk-in"} &bull; {formatDateTime(sale.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-brand-900">{formatCurrency(sale.total)}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-brand-400" strokeWidth={1.75} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
