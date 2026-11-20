const Customer = require('../models/Customer');
const CustomerPayment = require('../models/CustomerPayment');
const Sale = require('../models/Sale');
const { createAuditLog } = require('../middleware/audit');
const SaleReturn = require('../models/SaleReturn');
const {
  reconcileCustomerOutstanding,
  ensureSaleReturnStoreCredits,
} = require('../utils/salePayments');
const { scoped, scopedMatch, parsePaging, mustBelongToShop } = require('../utils/tenantQuery');
const { invalidateShopCache } = require('../utils/cache');

function mapDebtor(customer) {
  const doc = customer.toObject ? customer.toObject() : customer;
  return {
    ...doc,
    debtAmount: doc.outstanding || 0,
    creditAmount: doc.creditBalance || 0,
  };
}

exports.getCustomers = async (req, res) => {
  try {
    const { search } = req.query;
    const { page, limit, skip } = parsePaging(req.query, { defaultLimit: 50, max: 200 });
    const query = scoped(req, { isActive: true });
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }

    const [customers, total] = await Promise.all([
      Customer.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      Customer.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: customers.map(mapDebtor),
      pagination: { total, page, pages: Math.ceil(total / limit) || 1, limit },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne(scoped(req, { _id: req.params.id })).lean();
    mustBelongToShop(customer, req, 'Customer not found.');
    res.json({ success: true, data: mapDebtor(customer) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const openingDebt = Math.max(0, Number(req.body.openingDebt) || 0);
    const openingCredit = Math.max(0, Number(req.body.openingCredit) || 0);
    const legacyBalance = Number(req.body.openingBalance) || 0;
    const debt = openingDebt || (legacyBalance > 0 ? legacyBalance : 0);
    const credit = openingCredit || (legacyBalance < 0 ? Math.abs(legacyBalance) : 0);

    if (debt > 0 && credit > 0) {
      return res.status(400).json({
        success: false,
        message: 'Enter either previous debt or previous credit, not both.',
      });
    }

    const payload = {
      name: req.body.name,
      company: req.body.company,
      phone: req.body.phone,
      email: req.body.email,
      address: req.body.address,
      pan: req.body.pan,
      vatNumber: req.body.vatNumber || req.body.pan,
      creditLimit: Number(req.body.creditLimit) || 0,
      paymentTerms: req.body.paymentTerms || 'cash',
      customerType: req.body.customerType || 'retail',
      notes: req.body.notes,
      openingDebt: debt,
      openingCredit: credit,
      openingBalance: debt - credit,
      openingBalanceDate: req.body.openingBalanceDate ? new Date(req.body.openingBalanceDate) : undefined,
      outstanding: debt,
      creditBalance: credit,
    };

    const customer = await Customer.create(payload);
    res.status(201).json({ success: true, data: mapDebtor(customer) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const payload = {
      name: req.body.name,
      company: req.body.company,
      phone: req.body.phone,
      email: req.body.email,
      address: req.body.address,
      pan: req.body.pan,
      vatNumber: req.body.vatNumber || req.body.pan,
      creditLimit: Number(req.body.creditLimit) || 0,
      paymentTerms: req.body.paymentTerms || 'cash',
      customerType: req.body.customerType || 'retail',
      notes: req.body.notes,
    };

    const customer = await Customer.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, data: mapDebtor(customer) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, message: 'Customer removed.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDebtors = async (req, res) => {
  try {
    // Recompute balances before listing so collections / store credit reduce debt immediately.
    const needsSync = await Customer.find(scoped(req, {
      isActive: true,
      $or: [
        { outstanding: { $gt: 0 } },
        { creditBalance: { $gt: 0 } },
        { openingDebt: { $gt: 0 } },
      ],
    })).select('_id').limit(200).lean();
    for (const row of needsSync) {
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, row._id);
    }

    let debtors = await Customer.find(scoped(req, { isActive: true, outstanding: { $gt: 0 } }))
      .select('name phone company customerType outstanding creditBalance creditLimit totalPurchases totalPaid')
      .sort({ outstanding: -1 })
      .limit(200)
      .lean();

    // Fallback: include customers with unpaid invoices even if balance sync lagged
    if (debtors.length === 0) {
      const unpaid = await Sale.aggregate([
        scopedMatch(req, { type: { $in: ['invoice', 'estimate'] }, amountDue: { $gt: 0 }, customer: { $ne: null }, isHeld: { $ne: true } }),
        { $group: { _id: '$customer', debtAmount: { $sum: '$amountDue' } } },
      ]);
      if (unpaid.length > 0) {
        for (const row of unpaid) {
          await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, row._id);
        }
        debtors = await Customer.find(scoped(req, { isActive: true, outstanding: { $gt: 0 } }))
          .select('name phone company customerType outstanding creditBalance creditLimit totalPurchases totalPaid')
          .sort({ outstanding: -1 })
          .limit(200)
          .lean();
      }
    }

    res.json({ success: true, data: debtors.map(mapDebtor) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getCreditCustomers = async (req, res) => {
  try {
    await ensureSaleReturnStoreCredits(CustomerPayment, SaleReturn, Sale);
    const withReturns = await SaleReturn.distinct('customer', {
      refundMethod: 'credit_note',
      customer: { $ne: null },
    });
    for (const id of withReturns) {
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, id);
    }

    const customers = await Customer.find({ isActive: true, creditBalance: { $gt: 0 } })
      .select('name phone company customerType outstanding creditBalance creditLimit totalPurchases totalPaid')
      .sort({ creditBalance: -1 })
      .lean();
    res.json({ success: true, data: customers.map(mapDebtor) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCustomerLedger = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

    const [sales, payments] = await Promise.all([
      Sale.find({ customer: customer._id, type: { $in: ['invoice', 'estimate'] } }).select('invoiceNumber type total amountPaid amountDue createdAt status').sort({ createdAt: -1 }),
      CustomerPayment.find({ customer: customer._id }).populate('createdBy', 'name').sort({ createdAt: -1 }),
    ]);

    res.json({ success: true, data: { customer: mapDebtor(customer), sales, payments } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

function applyCashToSale(sale, method, amount, reference) {
  const { sumPayments } = require('../utils/salePayments');
  const dueBefore = Math.max(0, Number(sale.amountDue) || 0);
  const applied = Math.min(Math.max(0, Number(amount) || 0), dueBefore);
  if (applied <= 0.009) return 0;

  const payments = Array.isArray(sale.payments) ? [...sale.payments] : [];
  payments.push({ method, amount: applied, reference });

  // Keep a single credit marker for whatever is still unpaid after cash.
  const nonCredit = payments.filter((p) => p.method !== 'credit');
  const cashPaid = sumPayments(nonCredit, { excludeCredit: true });
  const safeTotal = Number(sale.total) || 0;
  const amountPaid = Math.min(safeTotal, cashPaid);
  const amountDue = Math.max(0, safeTotal - amountPaid);
  sale.payments = amountDue > 0.009
    ? [...nonCredit, { method: 'credit', amount: amountDue }]
    : nonCredit;
  sale.amountPaid = amountPaid;
  sale.amountDue = amountDue;
  return applied;
}

exports.receivePayment = async (req, res) => {
  try {
    const { amount, method, reference, saleId, notes } = req.body;
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    const payAmount = Math.round((Number(amount) || 0) * 100) / 100;
    if (payAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount.' });

    // Refresh balances before applying so we never collect more than true net debt by accident.
    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customer._id);
    const fresh = await Customer.findById(customer._id);
    const netDebt = Math.max(0, Number(fresh?.outstanding) || 0);

    const payment = await CustomerPayment.create({
      customer: customer._id,
      sale: saleId || undefined,
      amount: payAmount,
      type: 'payment',
      method: method || 'cash',
      reference,
      notes,
      createdBy: req.user._id,
    });

    let remaining = payAmount;
    const skipSaleId = saleId ? String(saleId) : null;

    if (saleId) {
      const sale = await Sale.findById(saleId);
      if (sale && String(sale.customer) === String(customer._id)) {
        const applied = applyCashToSale(sale, method || 'cash', remaining, reference);
        if (applied > 0) {
          await sale.save();
          remaining = Math.round((remaining - applied) * 100) / 100;
        }
      }
    }

    if (remaining > 0.009) {
      const unpaidSales = await Sale.find({
        customer: customer._id,
        type: { $in: ['invoice', 'estimate'] },
        status: { $nin: ['cancelled', 'draft'] },
        isHeld: { $ne: true },
        amountDue: { $gt: 0 },
        ...(skipSaleId ? { _id: { $ne: skipSaleId } } : {}),
      }).sort({ createdAt: 1 });

      for (const sale of unpaidSales) {
        if (remaining <= 0.009) break;
        const applied = applyCashToSale(sale, method || 'cash', remaining, reference);
        if (applied > 0) {
          await sale.save();
          remaining = Math.round((remaining - applied) * 100) / 100;
        }
      }
    }

    // Leftover after invoices is kept as CustomerPayment and netted against opening
    // debt / dues in reconcile (do not mutate openingDebt — that creates fake credit).

    const balances = await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customer._id);
    await invalidateShopCache(['dashboard', 'reports']);

    await createAuditLog(req.user._id, 'payment', 'customer', customer._id, null, { amount: payAmount, method }, req);
    const updated = await Customer.findById(customer._id).lean();
    res.status(201).json({
      success: true,
      data: payment,
      customer: mapDebtor(updated),
      balances,
      previousDebt: netDebt,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.refundCredit = async (req, res) => {
  try {
    const { amount, method, reference, notes } = req.body;
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    if (amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount.' });

    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customer._id);
    const refreshed = await Customer.findById(customer._id);
    if (amount > (refreshed.creditBalance || 0) + 0.009) {
      return res.status(400).json({
        success: false,
        message: `Refund exceeds credit balance. Available: ${(refreshed.creditBalance || 0).toFixed(2)}`,
      });
    }

    const refund = await CustomerPayment.create({
      customer: customer._id,
      amount,
      type: 'refund',
      method,
      reference,
      notes,
      createdBy: req.user._id,
    });

    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customer._id);
    await invalidateShopCache(['dashboard', 'reports']);
    await createAuditLog(req.user._id, 'refund', 'customer', customer._id, null, { amount, method }, req);
    res.status(201).json({ success: true, data: refund });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
