const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const Settings = require('../models/Settings');
const SaleReturn = require('../models/SaleReturn');
const { processSale, processSaleReturn, reverseSale } = require('../services/transactionService');
const CustomerPayment = require('../models/CustomerPayment');
const { normalizeSalePaymentFields, hasCreditPayment, reconcileCustomerOutstanding } = require('../utils/salePayments');
const { getDefaultWarehouseId } = require('../utils/warehouse');
const { applyCommissionToSaleBody } = require('../utils/electricianCommission');
const { allocateReturnLines, round2 } = require('../utils/saleReturn');
const { tenantKey, cacheGet, cacheSet, invalidateShopCache } = require('../utils/cache');
const { scoped, scopedMatch, parsePaging, mustBelongToShop } = require('../utils/tenantQuery');
const { hasModule } = require('../config/industry');
const Product = require('../models/Product');
const { isTintedSaleItem } = require('../config/paintPacks');
const { stampRecipeItems } = require('../services/recipeService');
const { cafeBillTotals } = require('../utils/cafeBill');
const Shift = require('../models/Shift');
const { parseFolioId } = require('../utils/folio');
const DiningTable = require('../models/DiningTable');
const PriceRule = require('../models/PriceRule');
const { matchingHappyHour, applyHappyHourToItems } = require('../utils/happyHour');
const { registerSaleWithIrd } = require('../services/irdService');
const { nextInvoiceNumber } = require('../utils/invoiceNumber');

function saleWasPosted(sale) {
  return ['invoice', 'estimate'].includes(sale.type) && sale.status === 'completed' && !sale.isHeld;
}

async function stampTintedItems(items) {
  if (!Array.isArray(items) || !items.length) return items;
  const ids = items.map((item) => item.product).filter(Boolean);
  const products = await Product.find({ _id: { $in: ids } }).select('attrs').lean();
  const byId = new Map(products.map((row) => [String(row._id), row]));
  return items.map((item) => {
    const product = byId.get(String(item.product));
    const mark = Boolean(product?.attrs?.tinted);
    return {
      ...item,
      tinted: mark,
      shadeCode: mark ? (product.attrs.shadeCode || item.shadeCode) : item.shadeCode,
    };
  });
}

function saleId(value) {
  if (!value) return null;
  return String(value._id || value);
}

async function applyCafeTotals(req, body) {
  if (!hasModule(req.tenant, 'recipes')) return;
  const settings = await Settings.findOne().select('serviceChargePercent vatRate').lean();
  const scPercent = Number(settings?.serviceChargePercent);
  const vatRate = Number(settings?.vatRate);
  const serviceType = body.serviceType === 'takeaway' ? 'takeaway' : 'dine_in';
  body.serviceType = serviceType;
  const bill = cafeBillTotals({
    food: Number(body.subtotal) || 0,
    serviceChargePercent: Number.isFinite(scPercent) ? scPercent : 10,
    vatRate: Number.isFinite(vatRate) ? vatRate : 13,
    includeVat: body.isVatBill !== false,
    serviceType,
  });
  body.serviceChargePercent = serviceType === 'takeaway' ? 0 : (Number.isFinite(scPercent) ? scPercent : 10);
  body.serviceChargeAmount = bill.serviceCharge;
  body.vatAmount = bill.vatAmount;
  body.total = bill.total;
}

async function applyHappyHourIfCafe(req, body) {
  if (!hasModule(req.tenant, 'recipes') || !Array.isArray(body.items)) return;
  const rules = await PriceRule.find({ isActive: true }).lean();
  const rule = matchingHappyHour(rules);
  if (!rule) return;
  body.items = applyHappyHourToItems(body.items, rule);
  body.happyHourPercent = rule.percentOff;
}

async function syncDiningTable(tableId, sale) {
  if (!tableId) return;
  const table = await DiningTable.findById(tableId);
  if (!table) return;
  if (sale.isHeld) {
    table.status = 'occupied';
    table.sale = sale._id;
  } else {
    const otherHeld = await Sale.findOne({ table: tableId, isHeld: true, _id: { $ne: sale._id } });
    if (!otherHeld) {
      table.status = 'free';
      table.sale = null;
    }
  }
  await table.save();
}

async function afterCompletedSale(sale) {
  if (sale.customer && (sale.serviceType || (sale.items || []).some((item) => item.recipeDeducted?.length))) {
    const settings = await Settings.findOne().select('loyaltyStampsNeeded').lean();
    const need = Number(settings?.loyaltyStampsNeeded) || 10;
    const customer = await Customer.findById(sale.customer);
    if (customer) {
      const stamps = (sale.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      customer.loyaltyStamps = (customer.loyaltyStamps || 0) + stamps;
      sale.loyaltyStampsAwarded = stamps;
      while (customer.loyaltyStamps >= need) {
        customer.loyaltyStamps -= need;
        customer.loyaltyRewards = (customer.loyaltyRewards || 0) + 1;
      }
      await customer.save();
    }
  }
  await registerSaleWithIrd(sale);
  await sale.save();
  await syncDiningTable(sale.table, sale);
}

async function requireOpenShift(req, body, { held }) {
  if (held || !hasModule(req.tenant, 'shifts')) return;
  const shift = await Shift.findOne(scoped(req, { status: 'open' }));
  if (!shift) {
    const err = new Error('Open a cash shift before selling.');
    err.statusCode = 400;
    throw err;
  }
  body.shift = shift._id;
}

async function saleReturnCount(saleIdValue) {
  return SaleReturn.countDocuments({
    $or: [{ originalSale: saleIdValue }, { originalSales: saleIdValue }],
  });
}

const generateNumber = (prefix) => nextInvoiceNumber(prefix);

exports.getSales = async (req, res) => {
  try {
    const { type, status, startDate, endDate, search, includeHeld } = req.query;
    const { page, limit, skip } = parsePaging(req.query, { defaultLimit: 50, max: 200 });
    const query = scoped(req);
    if (type) {
      const types = String(type).split(',').map((t) => t.trim()).filter(Boolean);
      query.type = types.length > 1 ? { $in: types } : types[0];
    }
    if (status) {
      const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
      query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }
    if (includeHeld !== 'true') query.isHeld = { $ne: true };
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
      ];
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .select("invoiceNumber type customer customerName customerPhone total amountPaid amountDue status createdAt createdBy validityDate returnedTotal returnedCommission refundedAmount electrician")
        .populate('customer', 'name phone')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sale.countDocuments(query),
    ]);

    res.json({ success: true, data: sales, pagination: { total, page, pages: Math.ceil(total / limit) || 1, limit } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSale = async (req, res) => {
  try {
    const sale = await Sale.findOne(scoped(req, { _id: req.params.id }))
      .populate('customer')
      .populate('items.product')
      .populate('createdBy', 'name')
      .lean();
    mustBelongToShop(sale, req, 'Sale not found.');
    res.json({ success: true, data: sale });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.createSale = async (req, res) => {
  try {
    const type = req.body.type || 'invoice';
    if (type === 'quotation' && !hasModule(req.tenant, 'quotations')) {
      return res.status(404).json({ success: false, message: 'Not available for this shop.' });
    }
    if (!hasModule(req.tenant, 'partners')) {
      delete req.body.electrician;
    }
    const prefix = type === 'quotation' ? 'QT' : type === 'estimate' ? 'EST' : 'INV';

    const isHeld = req.body.isHeld === true;
    const payments = req.body.payments || [];
    let { amountPaid, amountDue } = normalizeSalePaymentFields(req.body.total, payments, {
      amountPaid: req.body.amountPaid,
      amountDue: req.body.amountDue,
    }); // recalculated after cafe totals when recipes are on

    // Guard: debtor sales must keep unpaid balance when credit payment line exists.
    if (hasCreditPayment(payments) && amountDue <= 0) {
      const safeTotal = Number(req.body.total) || 0;
      const cashPaid = payments
        .filter((p) => p.method !== 'credit')
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      amountPaid = Math.min(safeTotal, cashPaid);
      amountDue = Math.max(0, safeTotal - amountPaid);
    }

    if (amountDue > 0 && !req.body.customer) {
      return res.status(400).json({ success: false, message: 'Customer is required for debtor / credit sales.' });
    }

    const warehouse = req.body.warehouse || await getDefaultWarehouseId();

    if (Array.isArray(req.body.items) && req.body.items.length) {
      req.body.items = await stampTintedItems(req.body.items);
      if (hasModule(req.tenant, 'recipes')) {
        await applyHappyHourIfCafe(req, req.body);
        req.body.items = await stampRecipeItems(req.body.items);
        await applyCafeTotals(req, req.body);
        ({ amountPaid, amountDue } = normalizeSalePaymentFields(req.body.total, payments, {
          amountPaid: req.body.amountPaid,
          amountDue: req.body.amountDue,
        }));
        if (hasCreditPayment(payments) && amountDue <= 0) {
          const safeTotal = Number(req.body.total) || 0;
          const cashPaid = payments
            .filter((p) => p.method !== 'credit')
            .reduce((s, p) => s + (Number(p.amount) || 0), 0);
          amountPaid = Math.min(safeTotal, cashPaid);
          amountDue = Math.max(0, safeTotal - amountPaid);
        }
      }
    }

    await requireOpenShift(req, req.body, { held: isHeld || type === 'quotation' });

    const payload = {
      ...req.body,
      type,
      payments,
      warehouse,
      folioId: parseFolioId(req.body.folioId),
      table: hasModule(req.tenant, 'tables') ? (req.body.table || undefined) : undefined,
      amountPaid: isHeld ? 0 : amountPaid,
      amountDue: isHeld ? req.body.total : amountDue,
      status: isHeld ? 'draft' : (req.body.status || 'completed'),
      isHeld,
      heldAt: isHeld ? new Date() : undefined,
      createdBy: req.user._id,
    };
    await applyCommissionToSaleBody(payload);

    let sale;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        sale = await Sale.create({
          ...payload,
          invoiceNumber: await generateNumber(prefix),
        });
        break;
      } catch (err) {
        if (err?.code !== 11000 || attempt === 7) throw err;
      }
    }

    const isCompletedSale = ['invoice', 'estimate'].includes(sale.type) && sale.status === 'completed' && !sale.isHeld;
    if (sale.table) await syncDiningTable(sale.table, sale);

    if (isCompletedSale) {
      await processSale(sale, req.user._id, req);
      await afterCompletedSale(sale);
      if (sale.customer) {
        const customerId = sale.customer._id || sale.customer;
        await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customerId);
      }
    }

    const populated = await Sale.findById(sale._id).populate('customer', 'name phone address').populate('createdBy', 'name');
    await invalidateShopCache(['dashboard', 'products', 'reports']);
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.getHeldSales = async (req, res) => {
  try {
    const held = await Sale.find(scoped(req, { isHeld: true }))
      .populate('customer', 'name phone')
      .sort({ heldAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, data: held });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.splitSale = async (req, res) => {
  try {
    const sale = await Sale.findOne(scoped(req, { _id: req.params.id, isHeld: true }));
    if (!sale) return res.status(404).json({ success: false, message: 'Open table bill not found.' });
    const moves = Array.isArray(req.body.items) ? req.body.items : [];
    if (!moves.length) return res.status(400).json({ success: false, message: 'Pick items to split off.' });

    const newItems = [];
    for (const move of moves) {
      const idx = Number(move.index);
      const qty = Number(move.quantity);
      const item = sale.items[idx];
      if (!item || !(qty > 0) || qty > item.quantity) {
        return res.status(400).json({ success: false, message: 'Split quantities do not match the bill.' });
      }
      const share = qty / item.quantity;
      const cloned = item.toObject ? item.toObject() : { ...item };
      cloned.quantity = qty;
      cloned.subtotal = round2((Number(item.subtotal) || 0) * share);
      cloned.vatAmount = round2((Number(item.vatAmount) || 0) * share);
      cloned.commission = round2((Number(item.commission) || 0) * share);
      newItems.push(cloned);
      item.quantity = round2(item.quantity - qty);
      item.subtotal = round2((Number(item.subtotal) || 0) * (1 - share));
      item.vatAmount = round2((Number(item.vatAmount) || 0) * (1 - share));
      item.commission = round2((Number(item.commission) || 0) * (1 - share));
    }
    sale.items = sale.items.filter((item) => Number(item.quantity) > 0);
    const remainingFood = sale.items.reduce((s, item) => s + (Number(item.subtotal) || 0), 0);
    sale.subtotal = remainingFood;
    await applyCafeTotals(req, sale);
    sale.total = sale.total || remainingFood;
    await sale.save();

    const splitBody = {
      items: newItems,
      subtotal: newItems.reduce((s, item) => s + (Number(item.subtotal) || 0), 0),
      serviceType: sale.serviceType,
      table: sale.table,
      isVatBill: sale.isVatBill,
      warehouse: sale.warehouse,
    };
    await applyCafeTotals(req, splitBody);
    const split = await Sale.create({
      type: 'invoice',
      status: 'draft',
      isHeld: true,
      heldAt: new Date(),
      invoiceNumber: await generateNumber('INV'),
      items: newItems,
      subtotal: splitBody.subtotal,
      vatAmount: splitBody.vatAmount,
      serviceChargeAmount: splitBody.serviceChargeAmount,
      serviceChargePercent: splitBody.serviceChargePercent,
      serviceType: sale.serviceType,
      table: sale.table,
      splitFrom: sale._id,
      total: splitBody.total,
      amountPaid: 0,
      amountDue: splitBody.total,
      isVatBill: sale.isVatBill,
      warehouse: sale.warehouse,
      createdBy: req.user._id,
    });
    await syncDiningTable(sale.table, sale);
    res.status(201).json({ success: true, data: { original: sale, split } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.updateSale = async (req, res) => {
  try {
    const sale = await Sale.findOne(scoped(req, { _id: req.params.id }));
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found.' });
    if (['cancelled', 'returned', 'partial_return'].includes(sale.status)) {
      return res.status(400).json({ success: false, message: 'Returned or cancelled sales cannot be edited.' });
    }

    const returnsCount = await saleReturnCount(sale._id);
    if (returnsCount > 0) {
      return res.status(400).json({ success: false, message: 'This sale has returns. Reverse the returns before editing.' });
    }

    const previousCustomerId = saleId(sale.customer);
    const wasPosted = saleWasPosted(sale);
    if (wasPosted) {
      await reverseSale(sale, req.user._id, req);
    }

    const payload = { ...req.body };
    await applyCommissionToSaleBody(payload);

    const payments = payload.payments || sale.payments || [];
    let { amountPaid, amountDue } = normalizeSalePaymentFields(payload.total ?? sale.total, payments, {
      amountPaid: payload.amountPaid,
      amountDue: payload.amountDue,
    });

    if (hasCreditPayment(payments) && amountDue <= 0) {
      const safeTotal = Number(payload.total ?? sale.total) || 0;
      const cashPaid = payments
        .filter((p) => p.method !== 'credit')
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      amountPaid = Math.min(safeTotal, cashPaid);
      amountDue = Math.max(0, safeTotal - amountPaid);
    }

    if (amountDue > 0 && !payload.customer && !sale.customer) {
      return res.status(400).json({ success: false, message: 'Customer is required for debtor / credit sales.' });
    }

    sale.customer = payload.customer !== undefined ? payload.customer || undefined : sale.customer;
    sale.customerName = payload.customerName ?? sale.customerName;
    sale.customerPhone = payload.customerPhone ?? sale.customerPhone;
    sale.customerAddress = payload.customerAddress ?? sale.customerAddress;
    sale.electrician = payload.electrician !== undefined ? payload.electrician : sale.electrician;
    sale.commissionRate = payload.commissionRate ?? sale.commissionRate;
    sale.commissionTotal = payload.commissionTotal ?? sale.commissionTotal;
    sale.items = payload.items ? await stampTintedItems(payload.items) : sale.items;
    sale.subtotal = payload.subtotal ?? sale.subtotal;
    sale.discount = payload.discount ?? sale.discount;
    sale.discountType = payload.discountType || sale.discountType;
    sale.vatAmount = payload.vatAmount ?? sale.vatAmount;
    sale.total = payload.total ?? sale.total;
    sale.payments = payments;
    sale.amountPaid = amountPaid;
    sale.amountDue = amountDue;
    sale.notes = payload.notes ?? sale.notes;
    sale.terms = payload.terms ?? sale.terms;
    if (payload.warehouse) sale.warehouse = payload.warehouse;
    if (payload.status) sale.status = payload.status;
    await sale.save();

    if (saleWasPosted(sale)) {
      await processSale(sale, req.user._id, req);
    }

    const nextCustomerId = saleId(sale.customer);
    const ids = [...new Set([previousCustomerId, nextCustomerId].filter(Boolean))];
    for (const id of ids) {
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, id);
    }

    const populated = await Sale.findById(sale._id)
      .populate('customer', 'name phone address')
      .populate('createdBy', 'name');
    await invalidateShopCache(['dashboard', 'products', 'reports']);
    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findOne(scoped(req, { _id: req.params.id }));
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found.' });
    if (sale.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Sale is already cancelled.' });
    }

    const returnsCount = await saleReturnCount(sale._id);
    if (returnsCount > 0 || ['returned', 'partial_return'].includes(sale.status)) {
      return res.status(400).json({ success: false, message: 'This sale has returns. Reverse the returns before deleting.' });
    }

    const previousCustomerId = saleId(sale.customer);
    if (saleWasPosted(sale)) {
      await reverseSale(sale, req.user._id, req);
    }

    await Sale.deleteOne({ _id: sale._id });

    if (previousCustomerId) {
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, previousCustomerId);
    }

    await invalidateShopCache(['dashboard', 'products', 'reports']);
    res.json({ success: true, message: 'Sale deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.completeHeldSale = async (req, res) => {
  try {
    const sale = await Sale.findOne(scoped(req, { _id: req.params.id }));
    if (!sale || !sale.isHeld) return res.status(404).json({ success: false, message: 'Held sale not found.' });

    await applyCommissionToSaleBody(req.body);
    if (Array.isArray(req.body.items)) req.body.items = await stampTintedItems(req.body.items);
    if (hasModule(req.tenant, 'recipes') && Array.isArray(req.body.items)) {
      await applyHappyHourIfCafe(req, req.body);
      req.body.items = await stampRecipeItems(req.body.items);
      await applyCafeTotals(req, req.body);
    }
    await requireOpenShift(req, req.body, { held: false });
    Object.assign(sale, req.body, {
      isHeld: false,
      heldAt: undefined,
      status: 'completed',
      folioId: parseFolioId(req.body.folioId !== undefined ? req.body.folioId : sale.folioId),
    });
    await sale.save();

    await processSale(sale, req.user._id, req);
    await afterCompletedSale(sale);
    if (sale.customer) {
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, sale.customer);
    }
    const populated = await Sale.findById(sale._id).populate('customer', 'name phone');
    await invalidateShopCache(['dashboard', 'products', 'reports']);
    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.convertToSale = async (req, res) => {
  try {
    const source = await Sale.findOne(scoped(req, { _id: req.params.id }));
    if (!source) return res.status(404).json({ success: false, message: 'Document not found.' });
    if (!['quotation', 'estimate'].includes(source.type)) {
      return res.status(400).json({ success: false, message: 'Only quotations or estimates can be converted.' });
    }
    if (source.type === 'quotation' && !hasModule(req.tenant, 'quotations')) {
      return res.status(404).json({ success: false, message: 'Not available for this shop.' });
    }

    const invoiceNumber = await generateNumber('INV');
    const payments = req.body.payments || [];
    const total = source.total;
    const { amountPaid, amountDue } = normalizeSalePaymentFields(total, payments, {
      amountPaid: req.body.amountPaid,
      amountDue: req.body.amountDue,
    });

    if (amountDue > 0 && !source.customer) {
      return res.status(400).json({ success: false, message: 'Customer is required for debtor / credit sales.' });
    }

    const warehouse = req.body.warehouse || source.warehouse || await getDefaultWarehouseId();

    const converted = {
      electrician: source.electrician,
      items: source.items.map((item) => (item.toObject ? item.toObject() : item)),
    };
    await applyCommissionToSaleBody(converted);

    const sale = await Sale.create({
      type: 'invoice',
      status: 'completed',
      invoiceNumber,
      customer: source.customer,
      customerName: source.customerName,
      customerPhone: source.customerPhone,
      customerAddress: source.customerAddress,
      customerPan: source.customerPan,
      electrician: converted.electrician,
      commissionRate: converted.commissionRate,
      commissionTotal: converted.commissionTotal,
      items: converted.items,
      subtotal: source.subtotal,
      discount: source.discount,
      discountType: source.discountType,
      vatAmount: source.vatAmount,
      total,
      amountPaid,
      amountDue,
      payments,
      isVatBill: req.body.isVatBill ?? source.isVatBill ?? true,
      notes: source.notes,
      warehouse,
      folioId: parseFolioId(req.body.folioId !== undefined ? req.body.folioId : source.folioId),
      createdBy: req.user._id,
    });

    source.status = 'completed';
    await source.save();
    await processSale(sale, req.user._id, req);
    await afterCompletedSale(sale);
    if (sale.customer) {
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, sale.customer);
    }

    await invalidateShopCache(['dashboard', 'products', 'reports']);
    res.status(201).json({ success: true, data: sale });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

function rejectTintedReturn(sale, allocated) {
  for (const alloc of allocated.allocations || []) {
    const item = sale.items[alloc.saleItemIndex];
    if (!isTintedSaleItem(item)) continue;
    const err = new Error(`Tinted paint cannot be returned (${item.productName || 'tin'}).`);
    err.statusCode = 400;
    throw err;
  }
}

function assertReturnableSale(sale) {
  if (!sale) {
    const err = new Error('Sale not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!['invoice', 'estimate'].includes(sale.type) || sale.isHeld) {
    throw new Error('Only completed invoices can be returned.');
  }
  if (sale.status === 'cancelled') {
    throw new Error('Cancelled sales cannot be returned.');
  }
  if (sale.status === 'returned') {
    throw new Error(`${sale.invoiceNumber || 'This sale'} is already fully returned.`);
  }
}

async function persistSaleReturn({ groups, refundMethod, reason, warehouse, userId, req }) {
  const allItems = [];
  const parts = [];
  let subtotal = 0;
  let commission = 0;
  let anyVat = false;

  for (const group of groups) {
    const allocated = group.allocated;
    const partTotal = allocated.subtotal;
    const partVat = group.sale.isVatBill !== false ? round2(partTotal * (13 / 113)) : 0;
    if (group.sale.isVatBill !== false) anyVat = true;
    subtotal = round2(subtotal + partTotal);
    commission = round2(commission + allocated.commission);
    allItems.push(...allocated.items.map((item) => ({
      ...item,
      originalSale: group.sale._id,
      invoiceNumber: group.sale.invoiceNumber,
    })));
    parts.push({
      sale: group.sale,
      allocations: allocated.allocations,
      items: allocated.items,
      total: partTotal,
      vatAmount: partVat,
      commission: allocated.commission,
    });
  }

  const vatAmount = anyVat ? round2(subtotal * (13 / 113)) : 0;
  const count = await SaleReturn.countDocuments();
  const returnNumber = `RTN-${String(count + 1).padStart(6, '0')}`;
  const primary = groups[0].sale;

  const saleReturn = await SaleReturn.create({
    returnNumber,
    originalSale: primary._id,
    originalSales: groups.map((g) => g.sale._id),
    customer: primary.customer,
    items: allItems,
    subtotal,
    vatAmount,
    total: subtotal,
    commissionReversed: commission,
    refundMethod,
    reason,
    warehouse: warehouse || primary.warehouse || await getDefaultWarehouseId(),
    createdBy: userId,
  });

  try {
    await processSaleReturn(saleReturn, primary, userId, req, { parts, commission });
  } catch (err) {
    await SaleReturn.findByIdAndDelete(saleReturn._id);
    throw err;
  }

  const customerIds = [...new Set(groups.map((g) => String(g.sale.customer || '')).filter(Boolean))];
  for (const customerId of customerIds) {
    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customerId);
  }

  return SaleReturn.findById(saleReturn._id)
    .populate('originalSale', 'invoiceNumber status returnedTotal amountPaid amountDue customerName customerPhone isVatBill')
    .populate('originalSales', 'invoiceNumber')
    .populate('customer', 'name phone address pan vatNumber')
    .populate('createdBy', 'name');
}

exports.createReturn = async (req, res) => {
  try {
    const originalSale = await Sale.findOne(scoped(req, { _id: req.params.id }));
    assertReturnableSale(originalSale);
    const requested = Array.isArray(req.body.items) ? req.body.items : [];
    const allocated = allocateReturnLines(originalSale.items, requested);
    rejectTintedReturn(originalSale, allocated);
    const refundMethod = ['cash', 'bank', 'credit_note'].includes(req.body.refundMethod)
      ? req.body.refundMethod
      : 'cash';

    const populated = await persistSaleReturn({
      groups: [{ sale: originalSale, allocated }],
      refundMethod,
      reason: req.body.reason,
      warehouse: req.body.warehouse,
      userId: req.user._id,
      req,
    });

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.createReturnsBatch = async (req, res) => {
  try {
    const entries = Array.isArray(req.body.returns) ? req.body.returns : [];
    if (!entries.length) {
      return res.status(400).json({ success: false, message: 'Select invoices and items to return.' });
    }

    const groups = [];
    for (const entry of entries) {
      const saleId = entry.sale || entry.saleId;
      const sale = await Sale.findOne(scoped(req, { _id: saleId }));
      assertReturnableSale(sale);
      const allocated = allocateReturnLines(sale.items, entry.items || []);
      rejectTintedReturn(sale, allocated);
      groups.push({ sale, allocated });
    }

    const refundMethod = ['cash', 'bank', 'credit_note'].includes(req.body.refundMethod)
      ? req.body.refundMethod
      : 'cash';

    const populated = await persistSaleReturn({
      groups,
      refundMethod,
      reason: req.body.reason,
      warehouse: req.body.warehouse,
      userId: req.user._id,
      req,
    });

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.getReturns = async (req, res) => {
  try {
    const returns = await SaleReturn.find()
      .populate('originalSale', 'invoiceNumber')
      .populate('originalSales', 'invoiceNumber')
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: returns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getReturn = async (req, res) => {
  try {
    const saleReturn = await SaleReturn.findById(req.params.returnId)
      .populate('originalSale', 'invoiceNumber customerName customerPhone total isVatBill')
      .populate('originalSales', 'invoiceNumber')
      .populate('customer', 'name phone address pan vatNumber')
      .populate('customer', 'name phone address pan vatNumber')
      .populate('createdBy', 'name')
      .lean();
    if (!saleReturn) return res.status(404).json({ success: false, message: 'Return not found.' });
    res.json({ success: true, data: saleReturn });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const {
      TZ,
      todayStartKathmandu,
      monthStartKathmandu,
      monthsBackStartKathmandu,
      kathmanduYmd,
      netSaleAmount,
      revenueSaleMatch,
    } = require('../utils/businessDates');

    const cacheKey = tenantKey(['dashboard', 'stats', kathmanduYmd()]);
    const forceRefresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
    if (!forceRefresh) {
      const cached = await cacheGet(cacheKey);
      if (cached) return res.json({ success: true, data: cached });
    }

    const todayStart = todayStartKathmandu();
    const monthStart = monthStartKathmandu();
    const trendStart = monthsBackStartKathmandu(11);

    const Product = require('../models/Product');
    const Customer = require('../models/Customer');
    const Supplier = require('../models/Supplier');

    const [
      todaySales, monthSales, totalProducts, lowStockProducts,
      totalCustomers, totalReceivable, totalPayable, recentSales, monthlyTrend,
    ] = await Promise.all([
      Sale.aggregate([
        scopedMatch(req, revenueSaleMatch({ createdAt: { $gte: todayStart } })),
        { $group: { _id: null, total: { $sum: netSaleAmount }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        scopedMatch(req, revenueSaleMatch({ createdAt: { $gte: monthStart } })),
        { $group: { _id: null, total: { $sum: netSaleAmount }, count: { $sum: 1 } } },
      ]),
      Product.countDocuments(scoped(req, { isActive: true })),
      Product.aggregate([
        scopedMatch(req, { isActive: true }),
        { $match: { $expr: { $lte: ['$currentStock', '$minStock'] } } },
        { $count: 'n' },
      ]).then((rows) => rows[0]?.n || 0),
      Customer.countDocuments(scoped(req, { isActive: true })),
      Customer.aggregate([
        scopedMatch(req, { isActive: { $ne: false } }),
        { $group: { _id: null, total: { $sum: { $ifNull: ['$outstanding', 0] } } } },
      ]),
      Supplier.aggregate([
        scopedMatch(req, { isActive: { $ne: false } }),
        { $group: { _id: null, total: { $sum: { $ifNull: ['$outstanding', 0] } } } },
      ]),
      Sale.find(scoped(req, revenueSaleMatch()))
        .select('invoiceNumber total returnedTotal customer customerName createdAt status')
        .populate('customer', 'name')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Sale.aggregate([
        scopedMatch(req, revenueSaleMatch({ createdAt: { $gte: trendStart } })),
        {
          $group: {
            _id: {
              year: { $year: { date: '$createdAt', timezone: TZ } },
              month: { $month: { date: '$createdAt', timezone: TZ } },
            },
            total: { $sum: netSaleAmount },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    const monthlyMap = new Map(
      monthlyTrend.map((row) => [`${row._id.year}-${row._id.month}`, row])
    );
    const filledTrend = [];
    const todayYmd = kathmanduYmd();
    const [ty, tm] = todayYmd.split('-').map(Number);
    for (let i = 11; i >= 0; i -= 1) {
      const totalMonths = ty * 12 + (tm - 1) - i;
      const year = Math.floor(totalMonths / 12);
      const month = (totalMonths % 12) + 1;
      const found = monthlyMap.get(`${year}-${month}`);
      filledTrend.push({
        _id: { year, month },
        total: found?.total || 0,
        count: found?.count || 0,
      });
    }

    const data = {
      todaySales: todaySales[0]?.total || 0,
      todayCount: todaySales[0]?.count || 0,
      monthSales: monthSales[0]?.total || 0,
      monthCount: monthSales[0]?.count || 0,
      totalProducts,
      lowStockProducts,
      totalCustomers,
      totalReceivable: totalReceivable[0]?.total || 0,
      totalPayable: totalPayable[0]?.total || 0,
      recentSales: recentSales.map((sale) => ({
        ...sale,
        total: Math.max(0, (Number(sale.total) || 0) - (Number(sale.returnedTotal) || 0)),
      })),
      monthlyTrend: filledTrend,
      asOf: new Date().toISOString(),
      businessDate: todayYmd,
    };
    await cacheSet(cacheKey, data, 30);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
