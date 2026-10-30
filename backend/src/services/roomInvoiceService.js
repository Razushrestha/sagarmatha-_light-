const Sale = require('../models/Sale');
const Settings = require('../models/Settings');
const Shift = require('../models/Shift');
const { postCharge, postJournal, ACCOUNT_CODES } = require('./journalService');
const { addCharge } = require('./folioService');
const { registerSaleWithIrd } = require('./irdService');
const { nextInvoiceNumber } = require('../utils/invoiceNumber');
const { roomBillTotals, round2 } = require('../utils/roomBill');
const { scoped } = require('../utils/tenantQuery');

async function issueFolioSale(req, stay, folio, {
  sku,
  description,
  rate,
  nights,
  sourceType = 'room',
  setRoomSale = false,
} = {}) {
  if (!folio) return null;
  const settings = await Settings.findOne().select('vatRate vatInclusive invoicePrefix vatNumber').lean();
  const vatRate = Number.isFinite(Number(settings?.vatRate)) ? Number(settings.vatRate) : 13;
  const vatInclusive = settings?.vatInclusive !== false;
  const bill = roomBillTotals({
    rate,
    nights,
    vatRate,
    vatInclusive,
    includeVat: true,
  });
  if (!(bill.total > 0)) return null;

  const invoiceNumber = await nextInvoiceNumber(settings?.invoicePrefix);
  const unitQuoted = round2(Number(rate) || 0);
  const shift = await Shift.findOne(scoped(req, { status: 'open' })).select('_id').lean();

  const sale = await Sale.create({
    invoiceNumber,
    type: 'invoice',
    status: 'completed',
    customer: stay.customer || undefined,
    customerName: stay.guestName,
    customerPhone: stay.guestPhone,
    customerAddress: stay.guestAddress,
    items: [{
      productName: description,
      sku,
      quantity: bill.nights,
      unit: 'Night',
      unitPrice: unitQuoted,
      vatRate: bill.vatRate,
      vatAmount: bill.vatAmount,
      subtotal: bill.taxable,
      costPrice: 0,
    }],
    subtotal: bill.taxable,
    vatAmount: bill.vatAmount,
    total: bill.total,
    amountPaid: 0,
    amountDue: bill.total,
    payments: [{ method: 'credit', amount: bill.total }],
    isVatBill: true,
    notes: stay.guestIdNumber ? `ID ${stay.guestIdType || ''} ${stay.guestIdNumber}`.trim() : undefined,
    folioId: folio._id,
    shift: shift?._id,
    createdBy: req.user._id,
  });

  await postCharge({
    tenant: req.tenant?._id,
    customer: stay.customer,
    tax: { vatAmount: bill.vatAmount, isVatBill: true },
    accounts: {
      receivable: bill.total,
      sales: bill.taxable,
      vat: bill.vatAmount,
    },
    source: {
      type: sourceType,
      id: sale._id,
      reference: invoiceNumber,
      description,
      folioId: folio._id,
      userId: req.user._id,
    },
  });

  await registerSaleWithIrd(sale);
  await sale.save();
  if (stay.customer) {
    const Customer = require('../models/Customer');
    const CustomerPayment = require('../models/CustomerPayment');
    const { reconcileCustomerOutstanding } = require('../utils/salePayments');
    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, stay.customer);
  }
  if (setRoomSale) stay.roomSale = sale._id;
  stay.roomSales = [...(stay.roomSales || []).map((id) => id), sale._id];
  await stay.save();
  try {
    const { invalidateShopCache } = require('../utils/cache');
    await invalidateShopCache(['dashboard', 'reports', 'products', 'hotel']);
  } catch {
    // cache optional
  }
  return sale;
}

async function issueRoomInvoice(req, stay, room, folio, extras = {}) {
  if (!folio) return null;
  const nights = extras.nights != null ? extras.nights : stay.nights;
  const rate = extras.rate != null ? extras.rate : stay.rate;
  if (stay.roomSale && extras.nights == null && extras.rate == null) return null;
  const description = extras.description || `Room ${room.number} × ${nights} night${nights === 1 ? '' : 's'}`;
  return issueFolioSale(req, stay, folio, {
    sku: `ROOM-${room.number}`,
    description,
    rate,
    nights,
    sourceType: 'room',
    setRoomSale: true,
  });
}

async function issueMealInvoice(req, stay, folio, extras = {}) {
  const nights = extras.nights != null ? extras.nights : stay.nights;
  const rate = extras.rate != null ? extras.rate : stay.mealRate;
  if (!(Number(rate) > 0)) return null;
  const label = extras.label || 'Meal plan';
  return issueFolioSale(req, stay, folio, {
    sku: `MEAL-${String(stay.mealPlan || 'bb').toUpperCase()}`,
    description: extras.description || `${label} × ${nights} night${nights === 1 ? '' : 's'}`,
    rate,
    nights,
    sourceType: 'cafe_ticket',
    setRoomSale: false,
  });
}

async function issueStayFee(req, stay, folio, extras = {}) {
  const nights = extras.nights != null ? extras.nights : 1;
  const rate = extras.amount > 0 ? extras.amount : (extras.rate != null ? extras.rate : stay.rate);
  const qty = extras.amount > 0 ? 1 : nights;
  if (!(Number(rate) > 0)) return null;
  return issueFolioSale(req, stay, folio, {
    sku: extras.sku || 'FEE-ROOM',
    description: extras.description || 'Stay fee',
    rate,
    nights: qty,
    sourceType: 'room',
    setRoomSale: false,
  });
}

async function creditStayNights(req, stay, folio, extras = {}) {
  if (!folio) return null;
  const nights = Math.max(0, Number(extras.nights) || 0);
  const rate = extras.rate != null ? extras.rate : stay.rate;
  if (!(nights > 0) || !(Number(rate) > 0)) return null;
  const settings = await Settings.findOne().select('vatRate vatInclusive').lean();
  const vatRate = Number.isFinite(Number(settings?.vatRate)) ? Number(settings.vatRate) : 13;
  const vatInclusive = settings?.vatInclusive !== false;
  const bill = roomBillTotals({ rate, nights, vatRate, vatInclusive, includeVat: true });
  if (!(bill.total > 0)) return null;
  const description = extras.description || `Unused ${nights} night${nights === 1 ? '' : 's'} credit`;
  await postJournal({
    description,
    reference: `CR-${folio._id.toString().slice(-6)}`,
    referenceId: folio._id,
    folioId: folio._id,
    source: 'room',
    lines: [
      { code: ACCOUNT_CODES.SALES, debit: bill.taxable },
      { code: ACCOUNT_CODES.VAT_PAYABLE, debit: bill.vatAmount },
      { code: ACCOUNT_CODES.RECEIVABLE, credit: bill.total },
    ],
    userId: req.user._id,
  });
  await addCharge({
    folioId: folio._id,
    description,
    source: 'room',
    kind: 'credit',
    amount: 0,
    paid: bill.total,
  });
  return bill;
}

module.exports = { issueRoomInvoice, issueMealInvoice, issueStayFee, creditStayNights, roomBillTotals };
