function cityLedgerAmount(balance, requested) {
  const due = Math.max(0, Number(balance) || 0);
  if (!(due > 0)) return 0;
  if (requested == null || requested === '') return due;
  const amt = Number(requested);
  if (!(amt > 0)) return 0;
  return Math.round(Math.min(amt, due) * 100) / 100;
}

function creditCapOk(customer, extra, { ignoreLimit } = {}) {
  if (ignoreLimit) return true;
  const limit = Number(customer?.creditLimit) || 0;
  if (!(limit > 0)) return true;
  const next = (Number(customer?.outstanding) || 0) + extra;
  return next <= limit + 0.01;
}

module.exports = { cityLedgerAmount, creditCapOk };
