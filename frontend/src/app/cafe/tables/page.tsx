"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { cafeAPI } from "@/lib/api";
import toast from "react-hot-toast";

type TableRow = { _id: string; name: string; seats: number; status: string };

export default function CafeTablesPage() {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("4");

  const load = () => cafeAPI.getTables().then((r) => setRows(r.data.data || [])).catch(() => toast.error("Could not load tables"));
  useEffect(() => { load(); }, []);

  const add = async () => {
    try {
      await cafeAPI.createTable({ name, seats: Number(seats) || 4 });
      setName("");
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not add table");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Tables" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 max-w-xl">
        <input className="input-field flex-1" placeholder="T1" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input-field w-24" type="number" value={seats} onChange={(e) => setSeats(e.target.value)} />
        <button type="button" className="btn-primary" onClick={add}>Add table</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {rows.map((row) => (
          <div key={row._id} className={`card p-4 ${row.status === "occupied" ? "border-amber-300 bg-amber-50" : ""}`}>
            <p className="font-semibold">{row.name}</p>
            <p className="text-sm text-brand-500">{row.seats} seats · {row.status}</p>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
