import { COMPANY } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/utils";

type SaleRow = {
  _id: string;
  invoiceNumber: string;
  type?: string;
  total: number;
  createdAt: string;
};

type PaymentRow = {
  _id: string;
  amount: number;
  method: string;
  type?: string;
  createdAt: string;
};

type CustomerBalances = {
  name: string;
  phone: string;
  company?: string;
  outstanding?: number;
  debtAmount?: number;
  creditBalance?: number;
  creditAmount?: number;
};

type LedgerLine = {
  date: string;
  particulars: string;
  voucher: string;
  voucherNo: string;
  debit: number;
  credit: number;
};

function npr(amount: number) {
  return formatCurrency(amount).replace(/^NPR\s*/, "NPR ");
}

function moneyPlain(amount: number) {
  return Math.abs(amount).toLocaleString("en-NP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Normalize Nepal / local phone to WhatsApp digits (country code, no +). */
export function toWhatsAppPhone(phone: string): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("977") && digits.length >= 12) return digits;
  if (digits.length === 10 && /^9[78]/.test(digits)) return `977${digits}`;
  if (digits.length === 9 && /^9[78]/.test(digits)) return `977${digits}`;
  if (digits.length >= 10) return digits;
  return null;
}

function buildLedgerLines(sales: SaleRow[], payments: PaymentRow[]): LedgerLine[] {
  const saleLines: LedgerLine[] = sales.map((s) => ({
    date: s.createdAt,
    particulars: "SALES A/C",
    voucher: s.type === "estimate" ? "Estimate" : "SalesInvoice",
    voucherNo: s.invoiceNumber || "",
    debit: s.total,
    credit: 0,
  }));
  const payLines: LedgerLine[] = payments.map((p, idx) => ({
    date: p.createdAt,
    particulars: `${(p.method || "cash").toUpperCase()} A/C`,
    voucher: p.type === "refund" ? "Refund" : "Receipt",
    voucherNo: String(idx + 1),
    debit: p.type === "refund" ? p.amount : 0,
    credit: p.type === "refund" ? 0 : p.amount,
  }));
  return [...saleLines, ...payLines].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

export function buildCustomerLedgerWhatsAppText(
  customer: CustomerBalances,
  sales: SaleRow[],
  payments: PaymentRow[]
): string {
  const ledger = buildLedgerLines(sales, payments);
  const debt = customer.debtAmount ?? customer.outstanding ?? 0;
  const credit = customer.creditAmount ?? customer.creditBalance ?? 0;
  const closing = debt > 0 ? debt : -credit;
  const totalDebit = ledger.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = ledger.reduce((sum, line) => sum + line.credit, 0);
  const opening = closing - totalDebit + totalCredit;

  const header = [
    `*${COMPANY.name}*`,
    `Customer Ledger`,
    ``,
    `Customer: ${customer.name}${customer.company ? ` (${customer.company})` : ""}`,
    `Phone: ${customer.phone}`,
    `Printed: ${formatDate(new Date())}`,
    ``,
  ];

  const lines: string[] = [];
  let running = opening;
  lines.push(
    `Opening: ${moneyPlain(opening)} ${opening >= 0 ? "Dr" : "Cr"}`
  );
  lines.push(`------------------------------`);

  let receiptNo = 0;
  for (const line of ledger) {
    running += line.debit - line.credit;
    const vNo =
      line.voucher === "Receipt" || line.voucher === "Refund"
        ? String(++receiptNo)
        : line.voucherNo;
    const bal = `${moneyPlain(running)} ${running >= 0 ? "Dr" : "Cr"}`;
    const dr = line.debit ? moneyPlain(line.debit) : "-";
    const cr = line.credit ? moneyPlain(line.credit) : "-";
    lines.push(
      `${formatDate(line.date)} | ${line.particulars} | ${line.voucher} ${vNo} | Dr ${dr} | Cr ${cr} | Bal ${bal}`
    );
  }

  if (!ledger.length) {
    lines.push(`(No transactions yet)`);
  }

  lines.push(`------------------------------`);
  lines.push(`Total Debit: ${npr(totalDebit)}`);
  lines.push(`Total Credit: ${npr(totalCredit)}`);
  lines.push(
    closing >= 0
      ? `*Closing Balance (Due): ${npr(closing)}*`
      : `*Closing Balance (Credit): ${npr(Math.abs(closing))}*`
  );
  lines.push(``);
  lines.push(`Thank you.`);
  lines.push(COMPANY.address);

  return [...header, ...lines].join("\n");
}

/** Keep WhatsApp deep-link URLs within practical browser limits. */
function fitWhatsAppText(full: string, maxLen = 1800): string {
  if (full.length <= maxLen) return full;
  const marker = "\n------------------------------\n";
  const parts = full.split(marker);
  if (parts.length < 3) return `${full.slice(0, maxLen - 40)}\n\n…(truncated)`;
  const [head, , ...rest] = parts;
  const footer = rest.join(marker);
  const bodyBudget = maxLen - head.length - footer.length - 80;
  const bodyLines = parts[1].split("\n").filter(Boolean);
  const kept: string[] = [];
  let used = 0;
  for (let i = bodyLines.length - 1; i >= 0; i -= 1) {
    const line = bodyLines[i];
    if (used + line.length + 1 > bodyBudget) break;
    kept.unshift(line);
    used += line.length + 1;
  }
  return [
    head,
    `(Showing recent ${kept.length} of ${bodyLines.length} entries)`,
    kept.join("\n"),
    footer,
  ].join(marker);
}

export function openCustomerLedgerWhatsApp(
  phone: string,
  message: string
): { ok: true } | { ok: false; message: string } {
  const waPhone = toWhatsAppPhone(phone);
  if (!waPhone) {
    return { ok: false, message: "Add a valid mobile number to send on WhatsApp." };
  }
  const text = encodeURIComponent(fitWhatsAppText(message));
  const url = `https://wa.me/${waPhone}?text=${text}`;
  window.open(url, "_blank", "noopener,noreferrer");
  return { ok: true };
}
