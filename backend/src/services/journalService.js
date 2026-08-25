const { Account, JournalEntry } = require('../models/Account');
const { sessionQuery, sessionOpts } = require('../utils/mongoTransaction');

const ACCOUNT_CODES = {
  CASH: '1001',
  BANK: '1002',
  RECEIVABLE: '1101',
  INVENTORY: '1201',
  PAYABLE: '2001',
  VAT_PAYABLE: '2101',
  SALES: '4001',
  COGS: '5001',
};

const getAccountByCode = async (code, session) =>
  sessionQuery(Account.findOne({ code }), session);

const postJournal = async ({ description, reference, referenceId, lines, userId }, session) => {
  const entries = [];
  for (const line of lines) {
    if (!line.debit && !line.credit) continue;
    const account = await getAccountByCode(line.code, session);
    if (!account) continue;
    entries.push({
      account: account._id,
      debit: line.debit || 0,
      credit: line.credit || 0,
    });
    account.balance += (line.debit || 0) - (line.credit || 0);
    await account.save(sessionOpts(session));
  }
  if (entries.length === 0) return;
  await JournalEntry.create([{
    description,
    reference,
    referenceId,
    entries,
    createdBy: userId,
  }], sessionOpts(session));
};

const postSaleJournal = async (sale, userId, session) => {
  const cashPaid = (sale.payments || [])
    .filter((p) => p.method !== 'credit')
    .reduce((s, p) => s + p.amount, 0);
  const creditAmount = sale.amountDue || 0;
  const vat = sale.vatAmount || 0;
  const netSales = Math.max(0, sale.total - vat);

  const lines = [];
  if (cashPaid > 0) lines.push({ code: ACCOUNT_CODES.CASH, debit: cashPaid });
  if (creditAmount > 0) lines.push({ code: ACCOUNT_CODES.RECEIVABLE, debit: creditAmount });
  if (netSales > 0) lines.push({ code: ACCOUNT_CODES.SALES, credit: netSales });
  if (vat > 0) lines.push({ code: ACCOUNT_CODES.VAT_PAYABLE, credit: vat });

  await postJournal({
    description: `Sale ${sale.invoiceNumber}`,
    reference: sale.invoiceNumber,
    referenceId: sale._id,
    lines,
    userId,
  }, session);
};

const postSaleReturnJournal = async (saleReturn, { cashRefund = 0, dueReduce = 0 } = {}, userId, session) => {
  const total = Number(saleReturn.total) || 0;
  if (total <= 0) return;
  const vat = Number(saleReturn.vatAmount) || 0;
  const netSales = Math.max(0, total - vat);
  const cash = Math.min(total, Math.max(0, Number(cashRefund) || 0));
  const receivable = Math.min(total - cash, Math.max(0, Number(dueReduce) || 0));
  const leftover = Math.max(0, total - cash - receivable);

  const lines = [];
  if (netSales > 0) lines.push({ code: ACCOUNT_CODES.SALES, debit: netSales });
  if (vat > 0) lines.push({ code: ACCOUNT_CODES.VAT_PAYABLE, debit: vat });
  if (cash > 0) lines.push({ code: ACCOUNT_CODES.CASH, credit: cash });
  if (receivable + leftover > 0) lines.push({ code: ACCOUNT_CODES.RECEIVABLE, credit: receivable + leftover });

  await postJournal({
    description: `Sale return ${saleReturn.returnNumber}`,
    reference: saleReturn.returnNumber,
    referenceId: saleReturn._id,
    lines,
    userId,
  }, session);
};

const postPurchaseJournal = async (purchase, userId, session) => {
  const cashPaid = purchase.amountPaid || 0;
  const creditAmount = purchase.amountDue || 0;
  const total = purchase.total || 0;

  const lines = [
    { code: ACCOUNT_CODES.INVENTORY, debit: total },
    { code: ACCOUNT_CODES.CASH, credit: cashPaid },
    { code: ACCOUNT_CODES.PAYABLE, credit: creditAmount },
  ];

  await postJournal({
    description: `Purchase ${purchase.invoiceNumber}`,
    reference: purchase.invoiceNumber,
    referenceId: purchase._id,
    lines,
    userId,
  }, session);
};

const postSupplierPaymentJournal = async (payment, account, userId, session) => {
  const cashAmount = payment.amount || 0;
  if (cashAmount <= 0) return;

  await postJournal({
    description: `Supplier Payment ${payment.paymentNumber}`,
    reference: payment.paymentNumber,
    referenceId: payment._id,
    lines: [
      { code: ACCOUNT_CODES.PAYABLE, debit: cashAmount },
      { code: account.code, credit: cashAmount },
    ],
    userId,
  }, session);
};

module.exports = { postSaleJournal, postSaleReturnJournal, postPurchaseJournal, postSupplierPaymentJournal, postJournal, ACCOUNT_CODES };
