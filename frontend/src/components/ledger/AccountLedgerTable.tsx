"use client";

import type { ReactNode } from "react";
import {
  formatAdSlash,
  formatBsDash,
} from "@/lib/nepaliDate";
import {
  LedgerBook,
  StatementLine,
  nprAmount,
  nprCell,
  nprTotal,
  shortVoucherNo,
  withRunningBalance,
} from "@/lib/ledgerStatement";

type Props = {
  lines: StatementLine[];
  opening: number;
  closing: number;
  book: LedgerBook;
  emptyText?: string;
  rowActions?: (line: StatementLine) => ReactNode;
};

function sideAmount(amount: number, book: LedgerBook, side: "debit" | "credit") {
  if (Math.abs(amount) < 0.005) return "";
  const payableCredit = book === "payable" && amount >= 0;
  const receivableDebit = book === "receivable" && amount >= 0;
  if (side === "credit" && (book === "payable" ? payableCredit : !receivableDebit)) return nprTotal(Math.abs(amount));
  if (side === "debit" && (book === "receivable" ? receivableDebit : !payableCredit)) return nprTotal(Math.abs(amount));
  return "";
}

export default function AccountLedgerTable({
  lines,
  opening,
  closing,
  book,
  emptyText = "No ledger entries yet",
  rowActions,
}: Props) {
  const rows = withRunningBalance(lines, opening, book);
  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  if (!lines.length) {
    return <p className="text-sm text-brand-400 text-center py-10">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[960px] border-collapse">
        <thead>
          <tr className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
            <th className="px-2 py-2 text-center font-semibold border-b border-slate-200">Date</th>
            <th className="px-2 py-2 text-center font-semibold border-b border-slate-200">Date</th>
            <th className="px-2 py-2 text-left font-semibold border-b border-slate-200">Particulars</th>
            <th className="px-2 py-2 text-center font-semibold border-b border-slate-200">Vch No</th>
            <th className="px-2 py-2 text-center font-semibold border-b border-slate-200">Ref No</th>
            <th className="px-2 py-2 text-center font-semibold border-b border-slate-200">Vch Type</th>
            <th className="px-2 py-2 text-right font-semibold border-b border-slate-200">Debit</th>
            <th className="px-2 py-2 text-right font-semibold border-b border-slate-200">Credit</th>
            <th className="px-2 py-2 text-right font-semibold border-b border-slate-200">Running Balance</th>
            {rowActions ? <th className="px-2 py-2 border-b border-slate-200" /> : null}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-slate-50 font-semibold">
            <td className="px-2 py-2" />
            <td className="px-2 py-2" />
            <td className="px-2 py-2" />
            <td className="px-2 py-2" />
            <td className="px-2 py-2" />
            <td className="px-2 py-2 text-right">Opening Balance:</td>
            <td className="px-2 py-2 text-right tabular-nums">{sideAmount(opening, book, "debit")}</td>
            <td className="px-2 py-2 text-right tabular-nums">{sideAmount(opening, book, "credit")}</td>
            <td className="px-2 py-2 text-right tabular-nums">{nprAmount(Math.abs(opening))}</td>
            {rowActions ? <td /> : null}
          </tr>
          {rows.map((line) => (
            <tr key={line.key || `${line.voucherNo}-${line.date}`} className="border-t border-slate-100 hover:bg-slate-50/80">
              <td className="px-2 py-2 text-center whitespace-nowrap text-slate-600">{formatAdSlash(line.date)}</td>
              <td className="px-2 py-2 text-center whitespace-nowrap text-slate-600">{formatBsDash(line.date)}</td>
              <td className="px-2 py-2">{line.particulars}</td>
              <td className="px-2 py-2 text-center font-medium text-brand-800">{shortVoucherNo(line.voucherNo)}</td>
              <td className="px-2 py-2 text-center text-slate-500">{line.refNo || ""}</td>
              <td className="px-2 py-2 text-center">{line.vchType}</td>
              <td className="px-2 py-2 text-right tabular-nums">{nprCell(line.debit)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{nprCell(line.credit)}</td>
              <td className="px-2 py-2 text-right tabular-nums font-medium">{nprAmount(Math.abs(line.running))}</td>
              {rowActions ? <td className="px-2 py-2 text-right whitespace-nowrap">{rowActions(line)}</td> : null}
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 font-semibold bg-slate-50">
            <td colSpan={5} />
            <td className="px-2 py-2 text-right">Current Total</td>
            <td className="px-2 py-2 text-right tabular-nums">{nprTotal(totalDebit)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{nprTotal(totalCredit)}</td>
            <td />
            {rowActions ? <td /> : null}
          </tr>
          <tr className="font-semibold bg-slate-50">
            <td colSpan={5} />
            <td className="px-2 py-2 text-right">Closing Balance:</td>
            <td className="px-2 py-2 text-right tabular-nums">{sideAmount(closing, book, "debit")}</td>
            <td className="px-2 py-2 text-right tabular-nums">{sideAmount(closing, book, "credit")}</td>
            <td className="px-2 py-2 text-right tabular-nums">{nprAmount(Math.abs(closing))}</td>
            {rowActions ? <td /> : null}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
