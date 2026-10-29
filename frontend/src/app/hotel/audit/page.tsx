"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import DateInput from "@/components/ui/DateInput";
import { hotelAPI } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

type Preview = {
  date: string;
  rooms?: Record<string, number>;
  arrivals?: Array<{ guestName: string; room?: string; status: string }>;
  departures?: Array<{ guestName: string; room?: string; status: string }>;
  inHouse?: Array<{ guestName: string; room?: string; folioBalance?: number }>;
  revenue?: { room: number; roomVat: number; fb: number; fbVat: number };
};

type AuditState = {
  today: string;
  hotelDate: string;
  lastClosed: string | null;
  canClose: boolean;
  preview: Preview;
  history: Array<{
    _id: string;
    date: string;
    status: string;
    noShows?: Array<{ guestName: string; room?: string }>;
    closedBy?: { name: string };
    snapshot?: Preview;
  }>;
};

export default function NightAuditPage() {
  const [data, setData] = useState<AuditState | null>(null);
  const [notes, setNotes] = useState("");
  const [closeDate, setCloseDate] = useState("");

  const load = useCallback(() => {
    hotelAPI.getAudit()
      .then((r) => {
        setData(r.data.data);
        setCloseDate((prev) => prev || r.data.data?.hotelDate || "");
      })
      .catch(() => toast.error("Could not load night audit"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const preview = data?.preview;
  const rooms = preview?.rooms || {};

  return (
    <DashboardLayout>
      <PageHeader
        title="Night audit"
        subtitle="Close the hotel date: occupancy snapshot, auto no-show of missed arrivals. Room rent is already billed at check-in."
      />
      {data && (
        <div className="card p-4 mb-6 space-y-3">
          <p className="text-sm text-brand-600">
            Hotel date to close: <span className="font-semibold">{formatDate(data.lastClosed ? data.hotelDate : (closeDate || data.hotelDate))}</span>
            {data.lastClosed ? ` · last closed ${formatDate(data.lastClosed)}` : " · none closed yet"}
          </p>
          {!data.lastClosed && (
            <div className="max-w-xs">
              <label className="label">First date to close</label>
              <DateInput className="input-field" value={closeDate || data.hotelDate} onChange={setCloseDate} />
            </div>
          )}
          <textarea className="input-field" rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button
            type="button"
            className="btn-primary"
            disabled={Boolean(data.lastClosed) && !data.canClose}
            onClick={() => hotelAPI.closeNight({ date: data.lastClosed ? data.hotelDate : (closeDate || data.hotelDate), notes })
              .then(() => { toast.success("Hotel date closed"); setNotes(""); load(); })
              .catch((e) => toast.error(e.response?.data?.message || "Close failed"))}
          >
            Close {formatDate(data.hotelDate)}
          </button>
          {!data.canClose && (
            <p className="text-sm text-brand-500">Nothing to close yet — wait until this hotel date, or reopen the last close if you closed too early.</p>
          )}
        </div>
      )}

      {preview && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Stat label="In house" value={rooms.occupied || 0} />
            <Stat label="Held" value={rooms.held || 0} />
            <Stat label="Vacant" value={rooms.vacant || 0} />
            <Stat label="Dirty / OOO" value={(rooms.dirty || 0) + (rooms.ooo || 0)} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <div className="card p-4">
              <h2 className="font-semibold mb-1">Room revenue today</h2>
              <p className="text-2xl font-semibold">{formatCurrency(preview.revenue?.room || 0)}</p>
            </div>
            <div className="card p-4">
              <h2 className="font-semibold mb-1">F&B to folio</h2>
              <p className="text-2xl font-semibold">{formatCurrency(preview.revenue?.fb || 0)}</p>
            </div>
          </div>
          <div className="grid lg:grid-cols-3 gap-4 mb-8">
            <List title="In house" rows={(preview.inHouse || []).map((r) => `${r.guestName} · ${r.room || "—"} · due ${formatCurrency(r.folioBalance || 0)}`)} empty="No in-house guests." />
            <List title="Arrivals" rows={(preview.arrivals || []).map((r) => `${r.guestName} · ${r.room || "—"} · ${r.status}`)} empty="No arrivals." />
            <List title="Departures" rows={(preview.departures || []).map((r) => `${r.guestName} · ${r.room || "—"}`)} empty="No departures." />
          </div>
        </>
      )}

      <h2 className="font-semibold mb-2">Closed dates</h2>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Status</th>
              <th className="table-header">No-shows</th>
              <th className="table-header">Closed by</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {(data?.history || []).map((row, i) => (
              <tr key={row._id}>
                <td className="table-cell">{formatDate(row.date)}</td>
                <td className="table-cell capitalize">{row.status}</td>
                <td className="table-cell text-sm">{(row.noShows || []).map((n) => n.guestName).join(", ") || "—"}</td>
                <td className="table-cell text-sm">{row.closedBy?.name || "—"}</td>
                <td className="table-cell">
                  {i === 0 && row.status === "closed" && (
                    <button type="button" className="text-sm text-brand-700" onClick={() => hotelAPI.reopenNight(row._id).then(() => { toast.success("Reopened"); load(); }).catch((e) => toast.error(e.response?.data?.message || "Reopen failed"))}>
                      Reopen
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-brand-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function List({ title, empty, rows }: { title: string; empty: string; rows: string[] }) {
  return (
    <div className="card p-4">
      <h2 className="font-semibold mb-2">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-brand-400">{empty}</p> : (
        <ul className="text-sm divide-y divide-brand-50">
          {rows.map((row) => <li key={row} className="py-2">{row}</li>)}
        </ul>
      )}
    </div>
  );
}
