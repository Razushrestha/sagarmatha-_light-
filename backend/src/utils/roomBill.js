function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Nepal hotel room bill. IRD VAT invoice: taxable + 13% VAT.
 * Quoted room rate follows Settings.vatInclusive (default inclusive).
 */
function roomBillTotals({
  rate = 0,
  nights = 1,
  vatRate = 13,
  vatInclusive = true,
  includeVat = true,
} = {}) {
  const qty = Math.max(1, Number(nights) || 1);
  const quoted = round2((Number(rate) || 0) * qty);
  const ratePct = Math.max(0, Number(vatRate) || 0);
  if (!includeVat || ratePct === 0) {
    return { nights: qty, quoted, taxable: quoted, vatAmount: 0, total: quoted, vatRate: ratePct, vatInclusive: Boolean(vatInclusive) };
  }
  if (vatInclusive) {
    const taxable = round2(quoted * (100 / (100 + ratePct)));
    const vatAmount = round2(quoted - taxable);
    return { nights: qty, quoted, taxable, vatAmount, total: quoted, vatRate: ratePct, vatInclusive: true };
  }
  const vatAmount = round2(quoted * (ratePct / 100));
  return {
    nights: qty,
    quoted,
    taxable: quoted,
    vatAmount,
    total: round2(quoted + vatAmount),
    vatRate: ratePct,
    vatInclusive: false,
  };
}

module.exports = { round2, roomBillTotals };
