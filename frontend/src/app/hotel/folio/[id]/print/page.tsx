"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { hotelAPI, miscAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { PRODUCT } from "@/lib/company";

type Line = { kind?: string; label?: string; description?: string; amount?: number; paid?: number; at?: string; bucket?: string };
type Window = { key: string; label: string; charged: number; paid: number; balance: number };

export default function FolioPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [windowKey, setWindowKey] = useState("");
  const [folio, setFolio] = useState<{
    guestName?: string;
    guestBName?: string;
    balance: number;
    charged?: number;
    paid?: number;
    charges: Line[];
    windows?: Window[];
    stay?: { guestName?: string; guestPhone?: string; room?: { number: string } };
  } | null>(null);
  const [shop, setShop] = useState({ companyName: PRODUCT.name, address: "", vatNumber: "" });

  useEffect(() => {
    setWindowKey(new URLSearchParams(window.location.search).get("window") || "");
    hotelAPI.getFolio(String(id)).then((r) => setFolio(r.data.data)).catch(() => {});
    miscAPI.getSettings().then((r) => setShop({
      companyName: r.data.data?.companyName || PRODUCT.name,
      address: r.data.data?.address || "",
      vatNumber: r.data.data?.vatNumber || "",
    })).catch(() => {});
  }, [id]);

  if (!folio) return <p className="p-8 text-sm">Loading folio…</p>;

  const win = (folio.windows || []).find((w) => w.key === windowKey);
  const lines = windowKey ? (folio.charges || []).filter((row) => (row.bucket || "main") === windowKey) : folio.charges;
  const charged = win?.charged ?? folio.charged ?? 0;
  const paid = win?.paid ?? folio.paid ?? 0;
  const balance = win?.balance ?? folio.balance;
  const title = win ? `${win.label} folio` : "Guest folio";

  return (
    <div className="max-w-2xl mx-auto p-6 print:p-0">
      <div className="print:hidden mb-4 flex gap-2">
        <Link href="/hotel" className="btn-secondary">Back</Link>
        <button type="button" className="btn-primary" onClick={() => window.print()}>Print</button>
      </div>
      <h1 className="text-xl font-semibold">{shop.companyName}</h1>
      <p className="text-sm text-brand-600">{shop.address}{shop.vatNumber ? ` · VAT ${shop.vatNumber}` : ""}</p>
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="text-sm">{folio.stay?.guestName || folio.guestName}{folio.guestBName ? ` / ${folio.guestBName}` : ""} · Room {folio.stay?.room?.number || "—"} · {folio.stay?.guestPhone}</p>
      <table className="w-full mt-4 text-sm">
        <thead>
          <tr>
            <th className="table-header">When</th>
            <th className="table-header">Item</th>
            <th className="table-header text-right">Charge</th>
            <th className="table-header text-right">Paid</th>
          </tr>
        </thead>
        <tbody>
          {(lines || []).map((row, i) => (
            <tr key={i}>
              <td className="table-cell text-xs">{row.at ? formatDateTime(row.at) : ""}</td>
              <td className="table-cell">{row.label || row.kind} · {row.description}</td>
              <td className="table-cell text-right">{Number(row.amount) > 0 ? formatCurrency(row.amount || 0) : ""}</td>
              <td className="table-cell text-right">{Number(row.paid) > 0 ? formatCurrency(row.paid || 0) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-sm space-y-1">
        <p>Charged {formatCurrency(charged)}</p>
        <p>Paid / deposit {formatCurrency(paid)}</p>
        <p className="font-semibold">Balance {formatCurrency(balance)}</p>
      </div>
    </div>
  );
}
