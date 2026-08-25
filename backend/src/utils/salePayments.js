function sumPayments(payments, { creditOnly = false, excludeCredit = false } = {}) {
  return (payments || []).reduce((sum, p) => {
    const amount = Number(p.amount) || 0;
    if (creditOnly && p.method !== 'credit') return sum;
    if (excludeCredit && p.method === 'credit') return sum;
    return sum + amount;
  }, 0);
}

function hasCreditPayment(payments = []) {
  return payments.some((p) => p.method === 'credit' && Number(p.amount) > 0);
}

function normalizeSalePaymentFields(total, payments = [], overrides = {}) {
  const safeTotal = Number(total) || 0;
  const cashPaid = sumPayments(payments, { excludeCredit: true });
  const creditMarked = sumPayments(payments, { creditOnly: true });

  let amountPaid = Math.min(safeTotal, cashPaid);
  let amountDue = Math.max(0, safeTotal - amountPaid);

  // Debtor/credit lines mark unpaid balance; never treat credit as cash received.
  if (hasCreditPayment(payments) && amountDue <= 0 && creditMarked > 0 && safeTotal > amountPaid) {
    amountDue = Math.max(0, safeTotal - amountPaid);
  }

  if (overrides.amountPaid != null) {
    amountPaid = Math.min(safeTotal, Math.max(0, Number(overrides.amountPaid) || 0));
    amountDue = Math.max(0, safeTotal - amountPaid);
  }
  if (overrides.amountDue != null) {
    amountDue = Math.min(safeTotal, Math.max(0, Number(overrides.amountDue) || 0));
    amountPaid = Math.max(0, safeTotal - amountDue);
  }

  return { amountPaid, amountDue };
}

async function sumCustomerPayments(CustomerPayment, customerId) {
  const [agg] = await CustomerPayment.aggregate([
    { $match: { customer: customerId } },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'],
          },
        },
      },
    },
  ]);
  return agg?.total || 0;
}

async function repairCreditSales(Sale) {
  const withCredit = await Sale.find({
    type: { $in: ['invoice', 'estimate'] },
    status: { $nin: ['cancelled'] },
    'payments.method': 'credit',
  });

  for (const sale of withCredit) {
    const safeTotal = Number(sale.total) || 0;
    const cashPaid = sumPayments(sale.payments, { excludeCredit: true });
    const expectedDue = Math.max(0, safeTotal - Math.min(safeTotal, cashPaid));
    const normalized = normalizeSalePaymentFields(safeTotal, sale.payments);

    const amountDue = expectedDue > 0 ? expectedDue : normalized.amountDue;
    const amountPaid = Math.min(safeTotal, safeTotal - amountDue);

    if (
      Math.abs((sale.amountDue || 0) - amountDue) > 0.009
      || Math.abs((sale.amountPaid || 0) - amountPaid) > 0.009
    ) {
      sale.amountPaid = amountPaid;
      sale.amountDue = amountDue;
      await sale.save();
    }
  }
}

async function reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customerId) {
  const customer = await Customer.findById(customerId);
  if (!customer) return;

  const sales = await Sale.find({
    customer: customer._id,
    type: { $in: ['invoice', 'estimate'] },
    status: { $nin: ['cancelled', 'draft'] },
    isHeld: { $ne: true },
  });

  let totalPurchases = 0;
  let totalDue = 0;

  for (const sale of sales) {
    const originalTotal = Number(sale.total) || 0;
    const netTotal = Math.max(0, originalTotal - (Number(sale.returnedTotal) || 0));
    const cashPaid = Math.max(
      0,
      sumPayments(sale.payments, { excludeCredit: true }) - (Number(sale.refundedAmount) || 0)
    );

    let amountDue;
    let amountPaid;
    if ((Number(sale.returnedTotal) || 0) > 0 || (Number(sale.refundedAmount) || 0) > 0) {
      amountPaid = Math.min(netTotal, Math.max(0, Number(sale.amountPaid) || 0));
      amountDue = Math.min(netTotal, Math.max(0, Number(sale.amountDue) || 0));
      if (amountPaid + amountDue - netTotal > 0.05) {
        amountDue = Math.max(0, netTotal - amountPaid);
      }
    } else {
      const expectedDue = Math.max(0, netTotal - Math.min(netTotal, cashPaid));
      const normalized = normalizeSalePaymentFields(netTotal, sale.payments, {
        amountPaid: sale.amountPaid,
        amountDue: sale.amountDue,
      });
      amountDue = expectedDue > 0 ? expectedDue : normalized.amountDue;
      amountPaid = Math.min(netTotal, netTotal - amountDue);
    }

    if (
      Math.abs((sale.amountPaid || 0) - amountPaid) > 0.009
      || Math.abs((sale.amountDue || 0) - amountDue) > 0.009
    ) {
      sale.amountPaid = amountPaid;
      sale.amountDue = amountDue;
      await sale.save();
    }
    totalPurchases += netTotal;
    totalDue += amountDue;
  }

  const openingDebt = Math.max(0, customer.openingDebt ?? Math.max(0, customer.openingBalance || 0));
  const openingCredit = Math.max(0, customer.openingCredit ?? Math.max(0, -(customer.openingBalance || 0)));
  const targetDebt = openingDebt + totalDue;
  const cashOnInvoices = Math.max(0, totalPurchases - totalDue);
  const totalPayments = await sumCustomerPayments(CustomerPayment, customer._id);
  const targetCredit = openingCredit + Math.max(0, totalPayments - cashOnInvoices);
  const targetPaid = cashOnInvoices;

  customer.totalPurchases = totalPurchases;
  customer.totalPaid = targetPaid;
  customer.outstanding = targetDebt;
  customer.creditBalance = targetCredit;
  await customer.save();
}

async function reconcileAllCustomers(Customer, Sale, CustomerPayment) {
  await repairCreditSales(Sale);

  const customerIds = new Set();

  (await Sale.distinct('customer', { customer: { $ne: null } }))
    .forEach((id) => customerIds.add(String(id)));
  (await CustomerPayment.distinct('customer'))
    .forEach((id) => customerIds.add(String(id)));
  (await Customer.find({
    isActive: true,
    $or: [
      { openingBalance: { $ne: 0 } },
      { openingDebt: { $gt: 0 } },
      { openingCredit: { $gt: 0 } },
      { outstanding: { $gt: 0 } },
      { creditBalance: { $gt: 0 } },
    ],
  }).select('_id'))
    .forEach((c) => customerIds.add(String(c._id)));

  for (const id of customerIds) {
    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, id);
  }
}

async function reconcileAllDebtors(Customer, Sale, CustomerPayment) {
  return reconcileAllCustomers(Customer, Sale, CustomerPayment);
}

module.exports = {
  normalizeSalePaymentFields,
  hasCreditPayment,
  repairCreditSales,
  reconcileCustomerOutstanding,
  reconcileAllCustomers,
  reconcileAllDebtors,
  sumCustomerPayments,
};
