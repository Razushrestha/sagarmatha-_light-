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
  SERVICE_CHARGE: '4002',
  COGS: '5001',
};

const getAccountByCode = async (code, session) =>
  sessionQuery(Account.findOne({ code }), session);

async function ensureAccount(code, defaults, session) {
  const existing = await getAccountByCode(code, session);
  if (existing) return existing;
  const [created] = await Account.create([{ code, isSystem: true, ...defaults }], sessionOpts(session));
  return created;
}

const postJournal = async ({ description, reference, referenceId, folioId, source, lines, userId }, session) => {
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
  if (entries.length === 0) return null;
  const [entry] = await JournalEntry.create([{
    description,
    reference,
    referenceId,
    folioId: folioId || null,
    source: source || undefined,
    entries,
    createdBy: userId,
  }], sessionOpts(session));
  return entry;
};

const CHARGE_SOURCES = ['shop_sale', 'mix', 'cafe_ticket', 'room'];

function chargeSourceFromSale(sale) {
  if (sale?.serviceType || (sale?.items || []).some((item) => Array.isArray(item.recipeDeducted) && item.recipeDeducted.length)) {
    return 'cafe_ticket';
  }
  if ((sale?.items || []).some((item) => item.tinted === true)) return 'mix';
  return 'shop_sale';
}

function buildChargeLines({ accounts = {}, tax = {} }) {
  const cash = Number(accounts.cash) || 0;
  const receivable = Number(accounts.receivable) || 0;
  const serviceCharge = Number(accounts.serviceCharge) || 0;
  const vat = Number(accounts.vat != null ? accounts.vat : tax.vatAmount) || 0;
  const sales = Number(accounts.sales) || 0;
  const lines = [];
  if (cash > 0) lines.push({ code: ACCOUNT_CODES.CASH, debit: cash });
  if (receivable > 0) lines.push({ code: ACCOUNT_CODES.RECEIVABLE, debit: receivable });
  if (sales > 0) lines.push({ code: ACCOUNT_CODES.SALES, credit: sales });
  if (serviceCharge > 0) lines.push({ code: ACCOUNT_CODES.SERVICE_CHARGE, credit: serviceCharge });
  if (vat > 0) lines.push({ code: ACCOUNT_CODES.VAT_PAYABLE, credit: vat });
  return lines;
}

/**
 * Single money path for shop sales, mixed-paint sales, and cafe tickets.
 *
 * folioId is stored on the journal (and on the sale) and otherwise ignored.
 * Hotel PMS later can park this charge on a guest folio without a second ledger.
 *
 * @param {{ tenant?: *, customer?: *, tax?: { vatAmount?: number }, accounts?: object, source?: object, session?: * }} args
 */
async function postCharge({ tenant, customer, tax = {}, accounts = {}, source = {}, session } = {}) {
  void tenant;
  void customer;
  const type = CHARGE_SOURCES.includes(source.type) ? source.type : 'shop_sale';
  const serviceCharge = Number(accounts.serviceCharge) || 0;
  if (serviceCharge > 0) {
    await ensureAccount(ACCOUNT_CODES.SERVICE_CHARGE, { name: 'Service Charge', type: 'income' }, session);
  }
  const lines = buildChargeLines({ accounts, tax });
  const entry = await postJournal({
    description: source.description || `Charge ${source.reference || ''}`.trim(),
    reference: source.reference,
    referenceId: source.id,
    folioId: source.folioId || null,
    source: type,
    lines,
    userId: source.userId,
  }, session);
  if (source.folioId) {
    const { addCharge } = require('./folioService');
    await addCharge({
      folioId: source.folioId,
      saleId: source.id,
      description: source.description,
      source: type,
      amount: (Number(accounts.sales) || 0) + (Number(accounts.serviceCharge) || 0) + (Number(accounts.vat) || 0),
      paid: Number(accounts.cash) || 0,
      session,
    });
  }
  return entry;
}

const postSaleJournal = async (sale, userId, session) => {
  const cashPaid = (sale.payments || [])
    .filter((p) => p.method !== 'credit')
    .reduce((s, p) => s + p.amount, 0);
  const creditAmount = sale.amountDue || 0;
  const vat = sale.vatAmount || 0;
  const serviceCharge = Number(sale.serviceChargeAmount) || 0;
  const netSales = Math.max(0, sale.total - vat - serviceCharge);

  return postCharge({
    tenant: sale.tenantId,
    customer: sale.customer,
    tax: { vatAmount: vat, isVatBill: sale.isVatBill },
    accounts: {
      cash: cashPaid,
      receivable: creditAmount,
      sales: netSales,
      serviceCharge,
      vat,
    },
    source: {
      type: chargeSourceFromSale(sale),
      id: sale._id,
      reference: sale.invoiceNumber,
      description: `Sale ${sale.invoiceNumber}`,
      folioId: sale.folioId,
      userId,
    },
    session,
  });
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

const reverseSupplierPaymentJournal = async (payment, account, userId, session) => {
  const cashAmount = payment.amount || 0;
  if (cashAmount <= 0) return;

  await postJournal({
    description: `Reverse Supplier Payment ${payment.paymentNumber}`,
    reference: `${payment.paymentNumber}-REV`,
    referenceId: payment._id,
    lines: [
      { code: account.code, debit: cashAmount },
      { code: ACCOUNT_CODES.PAYABLE, credit: cashAmount },
    ],
    userId,
  }, session);
};

module.exports = {
  postCharge,
  postSaleJournal,
  postSaleReturnJournal,
  postPurchaseJournal,
  postSupplierPaymentJournal,
  reverseSupplierPaymentJournal,
  postJournal,
  ACCOUNT_CODES,
  CHARGE_SOURCES,
  chargeSourceFromSale,
  buildChargeLines,
};
