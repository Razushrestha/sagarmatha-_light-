"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { paintAPI, miscAPI } from "@/lib/api";

type Challan = {
  challanNumber: string;
  customerName?: string;
  customerAddress?: string;
  vehicle?: string;
  driver?: string;
  status: string;
  items: Array<{ productName: string; quantity: number }>;
};

export default function ChallanPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<Challan | null>(null);
  const [company, setCompany] = useState("");

  useEffect(() => {
    if (!id) return;
    paintAPI.getChallan(id).then((r) => setRow(r.data.data));
    miscAPI.getSettings().then((r) => setCompany(r.data.data?.companyName || "")).catch(() => {});
  }, [id]);

  if (!row) return <p className="p-8">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto p-8 bg-white">
      <div className="flex justify-between mb-6 print:hidden">
        <a href="/paint/challans" className="btn-secondary">Back</a>
        <button type="button" className="btn-primary" onClick={() => window.print()}>Print</button>
      </div>
      <h1 className="text-xl font-bold">{company}</h1>
      <p className="uppercase text-sm tracking-wide mt-1">Delivery challan {row.challanNumber}</p>
      <p className="mt-4 text-sm">To: {row.customerName}<br />{row.customerAddress}</p>
      <p className="text-sm mt-2">Vehicle {row.vehicle || "—"} · Driver {row.driver || "—"}</p>
      <table className="w-full mt-6 text-sm">
        <thead><tr><th className="text-left border-b py-2">Item</th><th className="text-right border-b py-2">Qty</th></tr></thead>
        <tbody>
          {row.items.map((item, i) => (
            <tr key={i}><td className="py-2">{item.productName}</td><td className="text-right">{item.quantity}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-8 text-xs text-gray-500">Not a tax invoice. {row.status}</p>
    </div>
  );
}
