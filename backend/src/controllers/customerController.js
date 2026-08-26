const Customer = require('../models/Customer');
const CustomerPayment = require('../models/CustomerPayment');
const Sale = require('../models/Sale');
const { createAuditLog } = require('../middleware/audit');
const {
  reconcileCustomerOutstanding,
  normalizeSalePaymentFields,
} = require('../utils/salePayments');

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
    const { search, page = 1, limit = 20 } = req.query;
    const query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [customers, total] = await Promise.all([
      Customer.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
      Customer.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: customers.map(mapDebtor),
      pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, data: mapDebtor(customer) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    const debtors = await Customer.find({ isActive: true, outstanding: { $gt: 0 } })
      .select('name phone company customerType outstanding creditBalance creditLimit totalPurchases totalPaid')
      .sort({ outstanding: -1 })
      .lean();

    // Fallback: include customers with unpaid invoices even if balance sync lagged
    if (debtors.length === 0) {
      const unpaid = await Sale.aggregate([
        { $match: { type: { $in: ['invoice', 'estimate'] }, amountDue: { $gt: 0 }, customer: { $ne: null }, isHeld: { $ne: true } } },
        { $group: { _id: '$customer', debtAmount: { $sum: '$amountDue' } } },
      ]);
      if (unpaid.length > 0) {
        for (const row of unpaid) {
          await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, row._id);
        }
        const retried = await Customer.find({ isActive: true, outstanding: { $gt: 0 } })
          .select('name phone company customerType outstanding creditBalance creditLimit totalPurchases totalPaid')
          .sort({ outstanding: -1 });
        return res.json({ success: true, data: retried.map(mapDebtor) });
      }
    }

    res.json({ success: true, data: debtors.map(mapDebtor) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCreditCustomers = async (req, res) => {
  try {
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

exports.receivePayment = async (req, res) => {
  try {
    const { amount, method, reference, saleId, notes } = req.body;
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    if (amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount.' });

    const payment = await CustomerPayment.create({
      customer: customer._id,
      sale: saleId,
      amount,
      type: 'payment',
      method,
      reference,
      notes,
      createdBy: req.user._id,
    });

    let remaining = amount;

    if (saleId) {
      const sale = await Sale.findById(saleId);
      if (sale) {
        const applied = Math.min(remaining, sale.amountDue);
        sale.payments.push({ method, amount: applied, reference });
        const normalized = normalizeSalePaymentFields(sale.total, sale.payments);
        sale.amountPaid = normalized.amountPaid;
        sale.amountDue = normalized.amountDue;
        await sale.save();
        remaining -= applied;
      }
    }

    if (remaining > 0) {
      const unpaidSales = await Sale.find({
        customer: customer._id,
        type: { $in: ['invoice', 'estimate'] },
        amountDue: { $gt: 0 },
      }).sort({ createdAt: 1 });

      for (const sale of unpaidSales) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, sale.amountDue);
        sale.payments.push({ method, amount: applied, reference });
        const normalized = normalizeSalePaymentFields(sale.total, sale.payments);
        sale.amountPaid = normalized.amountPaid;
        sale.amountDue = normalized.amountDue;
        await sale.save();
        remaining -= applied;
      }
    }

    await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, customer._id);

    await createAuditLog(req.user._id, 'payment', 'customer', customer._id, null, { amount, method }, req);
    res.status(201).json({ success: true, data: payment });
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
    await createAuditLog(req.user._id, 'refund', 'customer', customer._id, null, { amount, method }, req);
    res.status(201).json({ success: true, data: refund });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
