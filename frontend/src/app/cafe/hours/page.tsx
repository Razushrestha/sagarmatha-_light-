"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { cafeAPI } from "@/lib/api";
import toast from "react-hot-toast";

type Rule = { _id: string; name: string; percentOff: number; startTime: string; endTime: string; isActive: boolean };

export default function HappyHourPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [active, setActive] = useState<Rule | null>(null);
  const [name, setName] = useState("Happy hour");
  const [percentOff, setPercentOff] = useState("20");
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("19:00");

  const load = () => cafeAPI.getPriceRules().then((r) => {
    setRules(r.data.data || []);
    setActive(r.data.active || null);
  }).catch(() => toast.error("Could not load hours"));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await cafeAPI.savePriceRule({ name, percentOff: Number(percentOff), startTime, endTime, days: [0, 1, 2, 3, 4, 5, 6] });
      toast.success("Happy hour saved");
      load();
    } catch {
      toast.error("Could not save");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Happy hour" />
      {active && <p className="text-sm text-emerald-700 mb-3">Live now: {active.percentOff}% off ({active.startTime}–{active.endTime})</p>}
      <div className="card p-4 max-w-lg space-y-2 mb-6">
        <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input-field" type="number" value={percentOff} onChange={(e) => setPercentOff(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input-field" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <input className="input-field" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <button type="button" className="btn-primary" onClick={save}>Save rule</button>
      </div>
      <div className="card divide-y">
        {rules.map((row) => (
          <div key={row._id} className="p-3 flex justify-between text-sm">
            <span>{row.name} · {row.percentOff}% · {row.startTime}–{row.endTime}</span>
            <button type="button" className="text-brand-700" onClick={() => cafeAPI.removePriceRule(row._id).then(load)}>Remove</button>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
