const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const Settings = require('../models/Settings');
const SaleReturn = require('../models/SaleReturn');
const { processSale, processSaleReturn } = require('../services/transactionService');
const CustomerPayment = require('../models/CustomerPayment');
const { normalizeSalePaymentFields, hasCreditPayment, reconcileCustomerOutstanding } = require('../utils/salePayments');
const { getDefaultWarehouseId } = require('../utils/warehouse');
const { applyCommissionToSaleBody } = require('../utils/electricianCommission');
const { allocateReturnLines, round2 } = require('../utils/saleReturn');

const generateNumber = async (prefix) => {
  const settings = await Settings.findOne();
  const startNum = settings?.invoiceStartNumber || 1;
  const latest = await Sale.findOne({ invoiceNumber: new RegExp(`^${prefix}-`) })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber');
  let next = startNum;
  if (latest?.invoiceNumber) {
    const parsed = parseInt(String(latest.invoiceNumber).split('-').pop() || '', 10);
    if (!Number.isNaN(parsed)) next = Math.max(startNum, parsed + 1);
  }
  return `${prefix}-${String(next).padStart(6, '0')}`;
};

exports.getSales = async (req, res) => {
  try {
    const { type, status, page = 1, limit = 50, startDate, endDate, search, includeHeld } = req.query;
    const query = {};
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

    const skip = (Number(page) - 1) * Number(limit);
    const [sales, total] = await Promise.all([
      Sale.find(query)
        .select("invoiceNumber type customer customerName customerPhone total amountPaid amountDue status createdAt createdBy validityDate returnedTotal returnedCommission refundedAmount electrician")
        .populate('customer', 'name phone')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Sale.countDocuments(query),
    ]);

    res.json({ success: true, data: sales, pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('customer')
      .populate('items.product')
      .populate('createdBy', 'name');
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found.' });
    res.json({ success: true, data: sale });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSale = async (req, res) => {
  try {
    const type = req.body.type || 'invoice';
    const prefix = type === 'quotation' ? 'QT' : type === 'estimate' ? 'EST' : 'INV';

    const isHeld = req.body.isHeld === true;
    const payments = req.body.payments || [];
    let { amountPaid, amountDue } = normalizeSalePaymentFields(req.body.total, payments, {
      amountPaid: req.body.amountPaid,
      amountDue: req.body.amountDue,
    });

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

    const payload = {
      ...req.body,
      type,
      payments,
      warehouse,
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
    if (isCompletedSale) {
      await processSale(sale, req.user._id, req);
      if (sale.customer) {
        const customerId = sale.customer._id || sale.customer;
        await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customerId);
      }
    }

    const populated = await Sale.findById(sale._id).populate('customer', 'name phone address').populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getHeldSales = async (req, res) => {
  try {
    const held = await Sale.find({ isHeld: true })
      .populate('customer', 'name phone')
      .sort({ heldAt: -1 })
      .lean();
    res.json({ success: true, data: held });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.completeHeldSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale || !sale.isHeld) return res.status(404).json({ success: false, message: 'Held sale not found.' });

    await applyCommissionToSaleBody(req.body);
    Object.assign(sale, req.body, { isHeld: false, heldAt: undefined, status: 'completed' });
    await sale.save();

    await processSale(sale, req.user._id, req);
    if (sale.customer) {
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, sale.customer);
    }
    const populated = await Sale.findById(sale._id).populate('customer', 'name phone');
    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.convertToSale = async (req, res) => {
  try {
    const source = await Sale.findById(req.params.id);
    if (!source) return res.status(404).json({ success: false, message: 'Document not found.' });
    if (!['quotation', 'estimate'].includes(source.type)) {
      return res.status(400).json({ success: false, message: 'Only quotations or estimates can be converted.' });
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
      createdBy: req.user._id,
    });

    source.status = 'completed';
    await source.save();
    await processSale(sale, req.user._id, req);
    if (sale.customer) {
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, sale.customer);
    }

    res.status(201).json({ success: true, data: sale });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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
    const originalSale = await Sale.findById(req.params.id);
    assertReturnableSale(originalSale);
    const requested = Array.isArray(req.body.items) ? req.body.items : [];
    const allocated = allocateReturnLines(originalSale.items, requested);
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
      const sale = await Sale.findById(saleId);
      assertReturnableSale(sale);
      const allocated = allocateReturnLines(sale.items, entry.items || []);
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const Product = require('../models/Product');
    const Customer = require('../models/Customer');
    const Supplier = require('../models/Supplier');
    const netAmount = { $subtract: [{ $ifNull: ['$total', 0] }, { $ifNull: ['$returnedTotal', 0] }] };

    const [
      todaySales, monthSales, totalProducts, lowStockProducts,
      totalCustomers, totalReceivable, totalPayable, recentSales, monthlyTrend,
    ] = await Promise.all([
      Sale.aggregate([
        {
          $match: {
            type: 'invoice',
            status: { $nin: ['cancelled', 'draft'] },
            isHeld: { $ne: true },
            createdAt: { $gte: today },
          },
        },
        { $group: { _id: null, total: { $sum: netAmount }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        {
          $match: {
            type: 'invoice',
            status: { $nin: ['cancelled', 'draft'] },
            isHeld: { $ne: true },
            createdAt: { $gte: monthStart },
          },
        },
        { $group: { _id: null, total: { $sum: netAmount }, count: { $sum: 1 } } },
      ]),
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true, $expr: { $lte: ['$currentStock', '$minStock'] } }),
      Customer.countDocuments({ isActive: true }),
      Customer.aggregate([{ $group: { _id: null, total: { $sum: '$outstanding' } } }]),
      Supplier.aggregate([{ $group: { _id: null, total: { $sum: '$outstanding' } } }]),
      Sale.find({ type: 'invoice' })
        .select('invoiceNumber total customer customerName createdAt')
        .populate('customer', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Sale.aggregate([
        {
          $match: {
            type: 'invoice',
            status: { $nin: ['cancelled', 'draft'] },
            isHeld: { $ne: true },
            createdAt: { $gte: new Date(today.getFullYear(), today.getMonth() - 11, 1) },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: { date: '$createdAt', timezone: 'Asia/Kathmandu' } },
              month: { $month: { date: '$createdAt', timezone: 'Asia/Kathmandu' } },
            },
            total: { $sum: netAmount },
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
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const found = monthlyMap.get(`${year}-${month}`);
      filledTrend.push({
        _id: { year, month },
        total: found?.total || 0,
        count: found?.count || 0,
      });
    }

    res.json({
      success: true,
      data: {
        todaySales: todaySales[0]?.total || 0,
        todayCount: todaySales[0]?.count || 0,
        monthSales: monthSales[0]?.total || 0,
        monthCount: monthSales[0]?.count || 0,
        totalProducts,
        lowStockProducts,
        totalCustomers,
        totalReceivable: totalReceivable[0]?.total || 0,
        totalPayable: totalPayable[0]?.total || 0,
        recentSales,
        monthlyTrend: filledTrend,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
