import { COMPANY } from "@/lib/company";
import { formatAdSlash, formatBsDash } from "@/lib/nepaliDate";

export type LedgerBook = "payable" | "receivable";

export type StatementLine = {
  key?: string;
  date: string;
  particulars: string;
  voucherNo: string;
  refNo?: string;
  vchType: string;
  debit: number;
  credit: number;
  kind?: string;
  paymentId?: string;
};

export type StatementRow = StatementLine & { running: number };

export function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function nprAmount(amount: number) {
  const value = Number.isFinite(amount) ? amount : 0;
  return value.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function nprCell(amount: number) {
  return amount ? nprAmount(amount) : "";
}

export function nprTotal(amount: number) {
  return `NPR ${nprAmount(amount)}`;
}

export function shortVoucherNo(value: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^([A-Za-z]+)[-_\s]*0*(\d+)$/);
  if (match) return `${match[1].toUpperCase()}${match[2]}`;
  return raw;
}

export function withRunningBalance(
  lines: StatementLine[],
  opening: number,
  book: LedgerBook
): StatementRow[] {
  let running = opening;
  return lines.map((line) => {
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    running += book === "payable" ? credit - debit : debit - credit;
    return { ...line, debit, credit, running };
  });
}

function moneyOnSide(amount: number, book: LedgerBook, side: "debit" | "credit") {
  if (Math.abs(amount) < 0.005) return side === "credit" && book === "payable" ? nprTotal(0) : "";
  const payableCredit = book === "payable" && amount >= 0;
  const receivableDebit = book === "receivable" && amount >= 0;
  if (side === "credit" && payableCredit) return nprTotal(Math.abs(amount));
  if (side === "debit" && !payableCredit && book === "payable") return nprTotal(Math.abs(amount));
  if (side === "debit" && receivableDebit) return nprTotal(Math.abs(amount));
  if (side === "credit" && !receivableDebit && book === "receivable") return nprTotal(Math.abs(amount));
  return "";
}

export function buildAccountLedgerHtml(opts: {
  companyName?: string;
  partyName: string;
  accountGroup: string;
  book: LedgerBook;
  periodFrom: string;
  periodTo: string;
  lines: StatementLine[];
  opening: number;
  closing: number;
}) {
  const company = opts.companyName || COMPANY.name;
  const rows = withRunningBalance(opts.lines, opts.opening, opts.book);
  const totalDebit = opts.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = opts.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const body = rows
    .map((line) => `<tr>
      <td class="ctr">${escapeHtml(formatAdSlash(line.date))}</td>
      <td class="ctr">${escapeHtml(formatBsDash(line.date))}</td>
      <td class="part">${escapeHtml(line.particulars)}</td>
      <td class="ctr">${escapeHtml(shortVoucherNo(line.voucherNo))}</td>
      <td class="ctr">${escapeHtml(line.refNo || "")}</td>
      <td class="ctr">${escapeHtml(line.vchType)}</td>
      <td class="num">${escapeHtml(nprCell(line.debit))}</td>
      <td class="num">${escapeHtml(nprCell(line.credit))}</td>
      <td class="num">${escapeHtml(nprAmount(Math.abs(line.running)))}</td>
    </tr>`)
    .join("");

  return `<style>
@page { size: A4 landscape; margin: 8mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; }
.head { margin: 0 0 8px; }
.head .co { font-size: 13pt; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
.head .ac { font-size: 11pt; font-weight: 700; margin-top: 2px; text-transform: uppercase; }
.head .grp { font-size: 9.5pt; color: #333; }
.head .range { font-size: 9pt; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #9aa3ad; padding: 4px 6px; vertical-align: middle; }
th { background: #eef2f6; font-size: 8pt; letter-spacing: 0.4px; text-transform: uppercase; font-weight: 700; text-align: center; }
td.ctr { text-align: center; white-space: nowrap; }
td.part { text-align: left; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.label { text-align: right; font-weight: 700; }
tr.open td, tr.sum td { background: #f7f9fb; font-weight: 700; }
.sign { margin-top: 22px; display: flex; justify-content: space-between; font-size: 9pt; }
.sign .box { width: 28%; text-align: center; border-top: 1px solid #333; padding-top: 4px; }
</style></head><body>
  <div class="head">
    <div class="co">${escapeHtml(company)}</div>
    <div class="ac">${escapeHtml(opts.partyName)} A/C</div>
    <div class="grp">${escapeHtml(opts.accountGroup)}</div>
    <div class="range">${escapeHtml(formatAdSlash(opts.periodFrom))} to ${escapeHtml(formatAdSlash(opts.periodTo))}</div>
    <div class="range">${escapeHtml(formatBsDash(opts.periodFrom))} to ${escapeHtml(formatBsDash(opts.periodTo))}</div>
  </div>
  <table>
    <colgroup>
      <col style="width:9%" /><col style="width:10%" /><col style="width:16%" /><col style="width:9%" />
      <col style="width:9%" /><col style="width:10%" /><col style="width:12%" /><col style="width:12%" /><col style="width:13%" />
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Date</th>
        <th>Particulars</th>
        <th>Vch No</th>
        <th>Ref No</th>
        <th>Vch Type</th>
        <th class="num">Debit</th>
        <th class="num">Credit</th>
        <th class="num">Running Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr class="open">
        <td></td><td></td><td></td><td></td><td></td>
        <td class="label">Opening Balance:</td>
        <td class="num">${escapeHtml(moneyOnSide(opts.opening, opts.book, "debit"))}</td>
        <td class="num">${escapeHtml(moneyOnSide(opts.opening, opts.book, "credit"))}</td>
        <td class="num">${escapeHtml(nprAmount(Math.abs(opts.opening)))}</td>
      </tr>
      ${body}
      <tr class="sum">
        <td></td><td></td><td></td><td></td><td></td>
        <td class="label">Current Total</td>
        <td class="num">${escapeHtml(nprTotal(totalDebit))}</td>
        <td class="num">${escapeHtml(nprTotal(totalCredit))}</td>
        <td></td>
      </tr>
      <tr class="sum">
        <td></td><td></td><td></td><td></td><td></td>
        <td class="label">Closing Balance:</td>
        <td class="num">${escapeHtml(moneyOnSide(opts.closing, opts.book, "debit"))}</td>
        <td class="num">${escapeHtml(moneyOnSide(opts.closing, opts.book, "credit"))}</td>
        <td class="num">${escapeHtml(nprAmount(Math.abs(opts.closing)))}</td>
      </tr>
    </tbody>
  </table>
  <div class="sign">
    <div class="box">Prepared by</div>
    <div class="box">Checked by</div>
    <div class="box">Authorized</div>
  </div>
</body></html>`;
}

export function printAccountLedger(title: string, html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute(
    "style",
    "position:fixed;left:0;top:0;width:297mm;height:210mm;border:0;opacity:0;pointer-events:none;"
  );
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>${html}`);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 800);
  }, 300);
}
