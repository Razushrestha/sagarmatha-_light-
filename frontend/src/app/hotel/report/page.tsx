"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import DateInput from "@/components/ui/DateInput";
import { hotelAPI } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { todayISO } from "@/lib/nepaliDate";
import toast from "react-hot-toast";

type Report = {
  date: string;
  rooms: Record<string, number>;
  arrivals: Array<{ guestName: string; room?: string; status: string }>;
  departures: Array<{ guestName: string; room?: string; status: string }>;
  revenue: { room: number; roomVat: number; fb: number; fbVat: number };
};

export default function HotelReportPage() {
  const [date, setDate] = useState(todayISO());
  const [report, setReport] = useState<Report | null>(null);

  const load = useCallback(() => {
    hotelAPI.getReport({ date })
      .then((r) => setReport(r.data.data))
      .catch(() => toast.error("Could not load hotel report"));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const rooms = report?.rooms || {};
  const revenue = report?.revenue;

  return (
    <DashboardLayout>
      <PageHeader title="Hotel daily report" subtitle="Occupancy, arrivals, departures, room vs F&B. Use Night audit to freeze a date." />
      <div className="max-w-xs mb-4">
        <label className="label">Date</label>
        <DateInput className="input-field" value={date} onChange={setDate} />
      </div>
      {report && (
        <>
          <p className="text-sm text-brand-500 mb-4">{formatDate(report.date)}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Stat label="Rooms" value={rooms.total || 0} />
            <Stat label="In house" value={rooms.occupied || 0} />
            <Stat label="Held" value={rooms.held || 0} />
            <Stat label="Vacant" value={rooms.vacant || 0} />
            <Stat label="Dirty" value={rooms.dirty || 0} />
            <Stat label="Cleaning" value={rooms.cleaning || 0} />
            <Stat label="Inspected" value={rooms.inspected || 0} />
            <Stat label="Out of order" value={rooms.ooo || 0} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <div className="card p-4">
              <h2 className="font-semibold mb-2">Room revenue</h2>
              <p className="text-2xl font-semibold">{formatCurrency(revenue?.room || 0)}</p>
              <p className="text-sm text-brand-500">incl. VAT {formatCurrency(revenue?.roomVat || 0)}</p>
            </div>
            <div className="card p-4">
              <h2 className="font-semibold mb-2">F&B / POS to folio</h2>
              <p className="text-2xl font-semibold">{formatCurrency(revenue?.fb || 0)}</p>
              <p className="text-sm text-brand-500">incl. VAT {formatCurrency(revenue?.fbVat || 0)}</p>
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <List title="Arrivals" rows={report.arrivals} empty="No arrivals." />
            <List title="Departures" rows={report.departures} empty="No departures." />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-brand-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function List({ title, empty, rows }: { title: string; empty: string; rows: Array<{ guestName: string; room?: string; status: string }> }) {
  return (
    <div className="card p-4">
      <h2 className="font-semibold mb-2">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-brand-400">{empty}</p> : (
        <ul className="text-sm divide-y divide-brand-50">
          {rows.map((row, i) => (
            <li key={i} className="py-2">{row.guestName} · {row.room || "—"} · {row.status.replace(/_/g, " ")}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
