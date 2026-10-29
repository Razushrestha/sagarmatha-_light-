"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { shiftAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import toast from "react-hot-toast";

type StaffRow = { name?: string; invoices?: number; total?: number };

type ShiftRow = {
  _id: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  closingCash?: number;
  expectedCash?: number;
  difference?: number;
  cashSales?: number;
  cashRefunds?: number;
  notes?: string;
  openedBy?: { name?: string };
  closedBy?: { name?: string };
  staffSales?: StaffRow[];
  live?: { cashSales?: number; cashRefunds?: number; expectedCash?: number; staffSales?: StaffRow[] };
};

export default function ShiftsPage() {
  const [current, setCurrent] = useState<ShiftRow | null>(null);
  const [history, setHistory] = useState<ShiftRow[]>([]);
  const [float, setFloat] = useState("0");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([shiftAPI.current(), shiftAPI.list()])
      .then(([cur, list]) => {
        setCurrent(cur.data.data || null);
        setHistory(list.data.data || []);
      })
      .catch(() => toast.error("Could not load shifts"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openShift = async () => {
    setSaving(true);
    try {
      await shiftAPI.open({ openingFloat: Number(float) || 0, notes });
      toast.success("Shift opened");
      setNotes("");
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not open shift");
    } finally {
      setSaving(false);
    }
  };

  const closeShift = async () => {
    if (!current) return;
    const cash = Number(counted);
    if (!Number.isFinite(cash) || cash < 0) {
      toast.error("Enter counted cash");
      return;
    }
    setSaving(true);
    try {
      const res = await shiftAPI.close(current._id, { closingCash: cash, notes });
      const diff = Number(res.data.data?.difference) || 0;
      toast.success(diff === 0 ? "Shift closed, cash matches" : `Shift closed. Difference ${formatCurrency(diff)}`);
      setCounted("");
      setNotes("");
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not close shift");
    } finally {
      setSaving(false);
    }
  };

  const live = current?.live;
  const expected = live?.expectedCash ?? current?.expectedCash ?? (current ? current.openingFloat : 0);
  const staff = live?.staffSales || current?.staffSales || [];

  return (
    <DashboardLayout>
      <PageHeader title="Cash shift" />
      {loading ? (
        <div className="card h-24 bg-brand-50 animate-pulse" />
      ) : current ? (
        <div className="card p-5 space-y-4 mb-6">
          <div className="flex justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-brand-400">Open shift</p>
              <p className="font-semibold text-brand-900">Opened {formatDateTime(current.openedAt)} by {current.openedBy?.name || "staff"}</p>
            </div>
            <p className="text-sm text-brand-600">Float {formatCurrency(current.openingFloat)}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><p className="text-xs text-brand-400">Cash sales</p><p className="font-medium">{formatCurrency(live?.cashSales || 0)}</p></div>
            <div><p className="text-xs text-brand-400">Cash refunds</p><p className="font-medium">{formatCurrency(live?.cashRefunds || 0)}</p></div>
            <div><p className="text-xs text-brand-400">Expected drawer</p><p className="font-medium">{formatCurrency(expected)}</p></div>
            <div>
              <p className="text-xs text-brand-400">Counted cash</p>
              <input className="input-field mt-1" type="number" value={counted} onChange={(e) => setCounted(e.target.value)} />
            </div>
          </div>
          {staff.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Staff</th>
                  <th className="table-header">Bills</th>
                  <th className="table-header">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {staff.map((row, i) => (
                  <tr key={i}>
                    <td className="table-cell">{row.name}</td>
                    <td className="table-cell">{row.invoices}</td>
                    <td className="table-cell">{formatCurrency(row.total || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <input className="input-field" placeholder="Close notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="button" className="btn-primary" disabled={saving} onClick={closeShift}>
            {saving ? "Closing…" : "Close shift"}
          </button>
        </div>
      ) : (
        <div className="card p-5 space-y-3 mb-6 max-w-md">
          <p className="text-sm text-brand-600">No open shift. Count the drawer, then open.</p>
          <label className="text-xs text-brand-400">Opening float</label>
          <input className="input-field" type="number" value={float} onChange={(e) => setFloat(e.target.value)} />
          <input className="input-field" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="button" className="btn-primary" disabled={saving} onClick={openShift}>
            {saving ? "Opening…" : "Open shift"}
          </button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Opened</th>
              <th className="table-header">Closed</th>
              <th className="table-header">Expected</th>
              <th className="table-header">Counted</th>
              <th className="table-header">Diff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {history.length === 0 ? (
              <tr><td colSpan={5} className="table-cell text-center py-10 text-gray-400">No closed shifts yet</td></tr>
            ) : history.map((row) => (
              <tr key={row._id}>
                <td className="table-cell">{formatDateTime(row.openedAt)}</td>
                <td className="table-cell">{row.closedAt ? formatDateTime(row.closedAt) : "Open"}</td>
                <td className="table-cell">{formatCurrency(row.expectedCash || 0)}</td>
                <td className="table-cell">{row.closingCash == null ? "—" : formatCurrency(row.closingCash)}</td>
                <td className="table-cell">{row.difference == null ? "—" : formatCurrency(row.difference)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
