"use client";

import { useCallback, useEffect, useState } from "react";
import { customerAPI, hotelAPI } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import toast from "react-hot-toast";

type Line = {
  _id?: string;
  label?: string;
  kind?: string;
  source?: string;
  description?: string;
  amount?: number;
  paid?: number;
  at?: string;
  bucket?: string;
  sale?: { _id: string; invoiceNumber: string; total: number; vatAmount: number };
};

type Window = { key: string; label: string; charged: number; paid: number; balance: number };

type Folio = {
  _id: string;
  status: string;
  balance: number;
  charged?: number;
  paid?: number;
  guestName?: string;
  guestBName?: string;
  splitMode?: string;
  charges: Line[];
  windows?: Window[];
  stay?: { guestName?: string; guestPhone?: string; guestEmail?: string; secondGuestName?: string; room?: { number: string } };
  customer?: { _id: string; name: string; company?: string; outstanding?: number };
};

export default function FolioPanel({ folioId, onChanged }: { folioId: string; onChanged?: () => void }) {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [amount, setAmount] = useState("");
  const [windowKey, setWindowKey] = useState("main");
  const [guestB, setGuestB] = useState("");
  const [customers, setCustomers] = useState<Array<{ _id: string; name: string; company?: string }>>([]);
  const [billTo, setBillTo] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailing, setEmailing] = useState(false);

  const load = useCallback(() => {
    hotelAPI.getFolio(folioId)
      .then((r) => {
        const next = r.data.data as Folio;
        setFolio(next);
        setGuestB(next.guestBName || next.stay?.secondGuestName || "");
        const due = Number(next?.balance) || 0;
        setAmount(due > 0 ? String(due) : "");
        const keys = (next.windows || []).map((w) => w.key);
        setWindowKey((prev) => (keys.includes(prev) ? prev : keys[0] || "main"));
        setBillTo(next.customer?._id || "");
        setEmailTo(next.stay?.guestEmail || "");
      })
      .catch(() => toast.error("Could not load folio"));
  }, [folioId]);

  useEffect(() => {
    customerAPI.getAll({ limit: "100" }).then((r) => setCustomers(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!folio) return <p className="text-sm text-brand-500">Loading folio…</p>;

  const windows = folio.windows || [];
  const split = folio.splitMode && folio.splitMode !== "none";
  const visible = split ? folio.charges.filter((row) => (row.bucket || "main") === windowKey) : folio.charges;
  const active = windows.find((w) => w.key === windowKey);

  const emailBody = [
    `Folio ${folio._id.slice(-6)} · ${folio.stay?.guestName || folio.guestName || ""}`,
    `Room ${folio.stay?.room?.number || ""}`,
    split ? `Window ${active?.label || windowKey}` : "",
    "",
    ...visible.map((row) => {
      const money = Number(row.paid) > 0 ? `- ${formatCurrency(row.paid || 0)}` : formatCurrency(row.amount || 0);
      return `${row.label || row.kind} · ${row.description || ""} · ${money}`;
    }),
    "",
    `Charged ${formatCurrency(active?.charged ?? folio.charged ?? 0)}`,
    `Paid ${formatCurrency(active?.paid ?? folio.paid ?? 0)}`,
    `Balance ${formatCurrency(active?.balance ?? folio.balance)}`,
  ].filter((line, i, arr) => line !== "" || arr[i - 1] !== "").join("\n");

  const takeMoney = (kind: "deposit" | "payment") => {
    const value = Number(amount);
    if (!(value > 0)) {
      toast.error("Enter an amount");
      return;
    }
    const payload = { amount: value, method: "cash", bucket: split ? windowKey : undefined };
    const req = kind === "deposit"
      ? hotelAPI.depositFolio(folio._id, payload)
      : hotelAPI.settleFolio(folio._id, payload);
    req.then(() => {
      toast.success(kind === "deposit" ? "Deposit taken" : "Payment applied");
      load();
      onChanged?.();
    }).catch((e) => toast.error(e.response?.data?.message || "Could not post"));
  };

  const splitTo = (mode: string) => {
    hotelAPI.splitFolio(folio._id, { splitMode: mode, guestBName: guestB })
      .then(() => { toast.success(mode === "none" ? "Split cleared" : "Folio split"); load(); onChanged?.(); })
      .catch((e) => toast.error(e.response?.data?.message || "Split failed"));
  };

  const printHref = split
    ? `/hotel/folio/${folio._id}/print?window=${encodeURIComponent(windowKey)}`
    : `/hotel/folio/${folio._id}/print`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Folio</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <a className="btn-secondary text-sm" href={printHref} target="_blank" rel="noreferrer">Print</a>
          <input className="input-field w-48 text-sm py-1" type="email" placeholder="guest@email.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={emailing}
            onClick={() => {
              setEmailing(true);
              hotelAPI.emailFolio(folio._id, { to: emailTo, window: split ? windowKey : undefined })
                .then(() => toast.success("Folio emailed"))
                .catch((e) => toast.error(e.response?.data?.message || "Could not send email"))
                .finally(() => setEmailing(false));
            }}
          >
            Send email
          </button>
          <a
            className="text-xs text-brand-600 underline"
            href={`mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(`Folio ${folio.stay?.guestName || ""}`)}&body=${encodeURIComponent(emailBody)}`}
          >
            Mail app
          </a>
        </div>
      </div>

      {folio.status === "open" && (
        <div className="flex flex-wrap gap-2 items-end text-sm">
          <button type="button" className="btn-secondary text-sm" onClick={() => splitTo("room_extras")}>Split room / extras</button>
          <div className="flex gap-2 items-end">
            <input className="input-field w-40" placeholder="Second guest" value={guestB} onChange={(e) => setGuestB(e.target.value)} />
            <button type="button" className="btn-secondary text-sm" onClick={() => splitTo("two_guests")}>Split two guests</button>
          </div>
          {split && <button type="button" className="text-brand-600" onClick={() => splitTo("none")}>One folio</button>}
        </div>
      )}

      {windows.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {windows.map((win) => (
            <button
              key={win.key}
              type="button"
              className={`px-3 py-1 rounded-lg text-sm border ${windowKey === win.key ? "bg-brand-800 text-white border-brand-800" : "border-brand-200"}`}
              onClick={() => setWindowKey(win.key)}
            >
              {win.label} · {formatCurrency(win.balance)}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">When</th>
              <th className="table-header">Type</th>
              <th className="table-header">Detail</th>
              <th className="table-header text-right">Charge</th>
              <th className="table-header text-right">Paid</th>
              {split ? <th className="table-header">Move</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {visible.map((row, i) => (
              <tr key={row._id || i}>
                <td className="table-cell text-xs text-brand-500">{row.at ? formatDateTime(row.at) : ""}</td>
                <td className="table-cell">{row.label || row.kind}</td>
                <td className="table-cell">
                  {row.description}
                  {row.sale?.invoiceNumber ? (
                    <a className="block text-xs text-brand-700 hover:underline" href={`/sales/${row.sale._id}/print`} target="_blank" rel="noreferrer">
                      {row.sale.invoiceNumber}
                    </a>
                  ) : null}
                </td>
                <td className="table-cell text-right">{Number(row.amount) > 0 ? formatCurrency(row.amount || 0) : "—"}</td>
                <td className="table-cell text-right">{Number(row.paid) > 0 ? formatCurrency(row.paid || 0) : "—"}</td>
                {split ? (
                  <td className="table-cell">
                    {row._id && folio.status === "open" ? (
                      <select
                        className="input-field text-xs py-1"
                        value={row.bucket || windowKey}
                        onChange={(e) => hotelAPI.moveFolioCharge(folio._id, { chargeId: row._id, bucket: e.target.value })
                          .then(() => { load(); onChanged?.(); })
                          .catch((err) => toast.error(err.response?.data?.message || "Move failed"))}
                      >
                        {windows.map((win) => (
                          <option key={win.key} value={win.key}>{win.label}</option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <p>Charged <span className="font-semibold">{formatCurrency(active?.charged ?? folio.charged ?? 0)}</span></p>
        <p>Paid / deposit <span className="font-semibold">{formatCurrency(active?.paid ?? folio.paid ?? 0)}</span></p>
        <p>Balance <span className="font-semibold">{formatCurrency(active?.balance ?? folio.balance)}</span></p>
      </div>
      {windows.length > 1 && (
        <p className="text-xs text-brand-500">Whole folio still due {formatCurrency(folio.balance)} — checkout needs all windows settled.</p>
      )}
      {folio.status === "open" && (
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[8rem]">
            <label className="label">Amount{split ? ` · ${active?.label || ""}` : ""}</label>
            <input className="input-field" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <button type="button" className="btn-secondary" onClick={() => takeMoney("deposit")}>Take deposit</button>
          <button type="button" className="btn-primary" onClick={() => takeMoney("payment")}>Apply payment</button>
          <div className="w-full flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[12rem]">
              <label className="label">Bill to company</label>
              <select className="input-field" value={billTo} onChange={(e) => setBillTo(e.target.value)}>
                <option value="">Company / agent</option>
                {customers.map((row) => (
                  <option key={row._id} value={row._id}>{row.company || row.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (!billTo) {
                  toast.error("Pick a company");
                  return;
                }
                hotelAPI.cityLedgerFolio(folio._id, {
                  customerId: billTo,
                  amount: Number(amount) || folio.balance,
                  bucket: split ? windowKey : undefined,
                }).then(() => {
                  toast.success("Transferred to city ledger");
                  load();
                  onChanged?.();
                }).catch((e) => toast.error(e.response?.data?.message || "City ledger failed"));
              }}
            >
              City ledger
            </button>
          </div>
          {folio.customer?.name ? (
            <p className="text-xs text-brand-500 w-full">
              Bill-to {folio.customer.company || folio.customer.name}
              {folio.customer.outstanding != null ? ` · company due ${formatCurrency(folio.customer.outstanding)}` : ""}
              . Collect later from Customers.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
