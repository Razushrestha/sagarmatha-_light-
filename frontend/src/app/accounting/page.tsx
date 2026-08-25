"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import StatsCard from "@/components/ui/StatsCard";
import { accountingAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, Wallet, CreditCard, Package } from "lucide-react";

interface FinancialSummary {
  monthlyRevenue: number;
  monthlyCOGS: number;
  grossProfit: number;
  monthlyExpenses: number;
  netProfit: number;
  receivables: number;
  payables: number;
  inventoryValue: number;
  accounts: Array<{ _id: string; code: string; name: string; type: string; balance: number }>;
}

interface ProfitLoss {
  revenue: number;
  vatCollected: number;
  cogs: number;
  grossProfit: number;
  expenses: Array<{ category: string; amount: number }>;
  expenseTotal: number;
  netProfit: number;
}

interface BalanceSheet {
  assets: Array<{ code: string; name: string; balance: number }>;
  liabilities: Array<{ code: string; name: string; balance: number }>;
  equity: Array<{ code: string; name: string; balance: number }>;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  receivables: number;
  payables: number;
  inventoryValue: number;
}

const typeColors: Record<string, string> = {
  asset: "badge",
  liability: "badge",
  equity: "badge",
  income: "badge",
  expense: "badge",
  cogs: "badge",
  tax: "badge",
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "pl", label: "Profit & Loss" },
  { id: "balance", label: "Balance Sheet" },
];

export default function AccountingPage() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [pl, setPl] = useState<ProfitLoss | null>(null);
  const [balance, setBalance] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const loaders: Record<string, () => Promise<void>> = {
      overview: () => accountingAPI.getSummary().then((res) => setData(res.data.data)),
      pl: () => accountingAPI.getProfitLoss().then((res) => setPl(res.data.data)),
      balance: () => accountingAPI.getBalanceSheet().then((res) => setBalance(res.data.data)),
    };
    loaders[tab]().finally(() => setLoading(false));
    if (tab === "overview") {
      accountingAPI.getProfitLoss().then((res) => setPl(res.data.data)).catch(() => {});
      accountingAPI.getBalanceSheet().then((res) => setBalance(res.data.data)).catch(() => {});
    }
  }, [tab]);

  return (
    <DashboardLayout>
      <PageHeader title="Accounting" />

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? "bg-brand-900 text-white shadow-sm" : "bg-white text-brand-700 border border-brand-200 hover:bg-brand-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => <div key={i} className="card p-5 h-28 animate-pulse bg-brand-50" />)}
        </div>
      ) : tab === "overview" && data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
            <StatsCard title="Monthly Revenue" value={formatCurrency(data.monthlyRevenue)} icon={DollarSign} />
            <StatsCard title="Gross Profit" value={formatCurrency(data.grossProfit)} icon={TrendingUp} />
            <StatsCard title="Net Profit" value={formatCurrency(data.netProfit)} icon={Wallet} />
            <StatsCard title="Monthly Expenses" value={formatCurrency(data.monthlyExpenses)} icon={TrendingDown} />
            <StatsCard title="Receivables" value={formatCurrency(data.receivables)} icon={CreditCard} />
            <StatsCard title="Inventory Value" value={formatCurrency(data.inventoryValue)} icon={Package} />
          </div>

          <div className="card">
            <div className="px-6 py-4 border-b border-brand-100">
              <h3 className="text-lg font-semibold text-gray-900">Chart of Accounts</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Code</th>
                    <th className="table-header">Account Name</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50">
                  {data.accounts.map((account) => (
                    <tr key={account._id} className="hover:bg-brand-50/50">
                      <td className="table-cell font-mono text-brand-600">{account.code}</td>
                      <td className="table-cell font-medium">{account.name}</td>
                      <td className="table-cell">
                        <span className={`badge capitalize ${typeColors[account.type] || "bg-gray-100"}`}>{account.type}</span>
                      </td>
                      <td className="table-cell font-medium">{formatCurrency(account.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : tab === "pl" && pl ? (
        <div className="card p-6 max-w-2xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Profit & Loss Statement</h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-brand-100">
              <span className="font-medium">Sales Revenue</span>
              <span className="text-brand-900 font-semibold">{formatCurrency(pl.revenue)}</span>
            </div>
            <div className="flex justify-between py-2 text-sm text-gray-500">
              <span>VAT Collected (incl.)</span>
              <span>{formatCurrency(pl.vatCollected)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-brand-100">
              <span>Cost of Goods Sold</span>
              <span className="text-brand-700">({formatCurrency(pl.cogs)})</span>
            </div>
            <div className="flex justify-between py-3 bg-brand-50 rounded-lg px-4">
              <span className="font-semibold">Gross Profit</span>
              <span className="font-bold text-brand-700">{formatCurrency(pl.grossProfit)}</span>
            </div>
            {pl.expenses.map((e) => (
              <div key={e.category} className="flex justify-between py-2 text-sm">
                <span className="capitalize">{e.category}</span>
                <span className="text-brand-700">({formatCurrency(e.amount)})</span>
              </div>
            ))}
            <div className="flex justify-between py-2 border-b border-brand-100">
              <span>Total Operating Expenses</span>
              <span className="text-brand-700">({formatCurrency(pl.expenseTotal)})</span>
            </div>
            <div className="flex justify-between py-4 bg-brand-900 text-white rounded-xl px-4 mt-4">
              <span className="font-bold text-lg">Net Profit</span>
              <span className="font-bold text-lg">{formatCurrency(pl.netProfit)}</span>
            </div>
          </div>
        </div>
      ) : tab === "balance" && balance ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assets</h3>
            <div className="space-y-2 mb-4">
              {balance.assets.map((a) => (
                <div key={a.code} className="flex justify-between text-sm">
                  <span>{a.code}: {a.name}</span>
                  <span className="font-medium">{formatCurrency(a.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm text-gray-500">
                <span>Accounts Receivable</span>
                <span>{formatCurrency(balance.receivables)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Inventory Value</span>
                <span>{formatCurrency(balance.inventoryValue)}</span>
              </div>
            </div>
            <div className="flex justify-between pt-3 border-t font-bold text-brand-700">
              <span>Total Assets</span>
              <span>{formatCurrency(balance.totalAssets + balance.receivables + balance.inventoryValue)}</span>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Liabilities</h3>
              <div className="space-y-2 mb-4">
                {balance.liabilities.map((l) => (
                  <div key={l.code} className="flex justify-between text-sm">
                    <span>{l.code}: {l.name}</span>
                    <span className="font-medium">{formatCurrency(l.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Accounts Payable</span>
                  <span>{formatCurrency(balance.payables)}</span>
                </div>
              </div>
              <div className="flex justify-between pt-3 border-t font-bold text-brand-700">
                <span>Total Liabilities</span>
                <span>{formatCurrency(balance.totalLiabilities + balance.payables)}</span>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Equity</h3>
              <div className="space-y-2 mb-4">
                {balance.equity.map((e) => (
                  <div key={e.code} className="flex justify-between text-sm">
                    <span>{e.code}: {e.name}</span>
                    <span className="font-medium">{formatCurrency(e.balance)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-3 border-t font-bold text-brand-400">
                <span>Total Equity</span>
                <span>{formatCurrency(balance.totalEquity)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
