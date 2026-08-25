export type LedgerKind = "purchase" | "payment";

export function voucherSeq(voucherNo: string): number {
  const match = String(voucherNo || "").match(/(\d+)\s*$/);
  return match ? Number(match[1]) : 0;
}

export function calendarDay(date: string | Date): number {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Oldest first. Same day: purchases (credit) before payments (debit), then voucher number. */
export function compareSupplierLedgerLines(a: {
  date: string;
  kind: LedgerKind;
  voucherNo: string;
}, b: {
  date: string;
  kind: LedgerKind;
  voucherNo: string;
}): number {
  const day = calendarDay(a.date) - calendarDay(b.date);
  if (day !== 0) return day;
  const kindRank = (kind: LedgerKind) => (kind === "purchase" ? 0 : 1);
  const kindDiff = kindRank(a.kind) - kindRank(b.kind);
  if (kindDiff !== 0) return kindDiff;
  const seq = voucherSeq(a.voucherNo) - voucherSeq(b.voucherNo);
  if (seq !== 0) return seq;
  return new Date(a.date).getTime() - new Date(b.date).getTime();
}

/**
 * Supplier (creditor) running balance:
 * Closing = previous + Credit − Debit
 * Positive = Cr (amount payable), negative = Dr (advance)
 */
export function withPayableClosing<T extends { debit: number; credit: number }>(
  lines: T[],
  opening = 0
): Array<T & { closing: number }> {
  let running = opening;
  return lines.map((line) => {
    running += (Number(line.credit) || 0) - (Number(line.debit) || 0);
    return { ...line, closing: running };
  });
}

export function payableNet(lines: Array<{ debit: number; credit: number }>): number {
  return lines.reduce((sum, line) => sum + (Number(line.credit) || 0) - (Number(line.debit) || 0), 0);
}

export function closingLabel(closing: number, figure: (n: number) => string): string {
  const abs = figure(Math.abs(closing));
  if (closing < 0) return `${abs} Dr`;
  return `${abs} Cr`;
}
