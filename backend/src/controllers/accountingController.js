const { Account, JournalEntry } = require('../models/Account');
const Expense = require('../models/Expense');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');

exports.getAccounts = async (req, res) => {
  try {
    const accounts = await Account.find({ isActive: true }).sort({ code: 1 }).lean();
    res.json({ success: true, data: accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getJournalEntries = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      JournalEntry.find()
        .populate('entries.account', 'code name type')
        .populate('createdBy', 'name')
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      JournalEntry.countDocuments(),
    ]);
    res.json({ success: true, data: entries, pagination: { total, page: Number(page) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFinancialSummary = async (req, res) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [salesRevenue, purchaseCost, expenses, receivables, payables, inventoryValue, accounts] = await Promise.all([
      Sale.aggregate([
        { $match: { type: 'invoice', status: 'completed', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Purchase.aggregate([
        { $match: { status: { $in: ['completed', 'received'] }, createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Expense.aggregate([
        { $match: { status: 'approved', date: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Customer.aggregate([{ $group: { _id: null, total: { $sum: '$outstanding' } } }]),
      Supplier.aggregate([{ $group: { _id: null, total: { $sum: '$outstanding' } } }]),
      Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } } } },
      ]),
      Account.find({ isActive: true }).sort({ code: 1 }).lean(),
    ]);

    const revenue = salesRevenue[0]?.total || 0;
    const cogs = purchaseCost[0]?.total || 0;
    const expenseTotal = expenses[0]?.total || 0;

    res.json({
      success: true,
      data: {
        monthlyRevenue: revenue,
        monthlyCOGS: cogs,
        grossProfit: revenue - cogs,
        monthlyExpenses: expenseTotal,
        netProfit: revenue - cogs - expenseTotal,
        receivables: receivables[0]?.total || 0,
        payables: payables[0]?.total || 0,
        inventoryValue: inventoryValue[0]?.total || 0,
        accounts: accounts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProfitLoss = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }
    const matchDate = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};
    const expenseDate = Object.keys(dateFilter).length ? { date: dateFilter } : {};

    const [salesRevenue, purchaseCost, expenses, incomeAccounts, expenseAccounts] = await Promise.all([
      Sale.aggregate([
        { $match: { type: 'invoice', status: 'completed', ...matchDate } },
        { $group: { _id: null, total: { $sum: '$total' }, vat: { $sum: '$vatAmount' } } },
      ]),
      Purchase.aggregate([
        { $match: { status: { $in: ['completed', 'received'] }, ...matchDate } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Expense.aggregate([
        { $match: { status: 'approved', ...expenseDate } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]),
      Account.find({ type: 'income', isActive: true }).sort({ code: 1 }).lean(),
      Account.find({ type: 'expense', isActive: true }).sort({ code: 1 }).lean(),
    ]);

    const revenue = salesRevenue[0]?.total || 0;
    const vatCollected = salesRevenue[0]?.vat || 0;
    const cogs = purchaseCost[0]?.total || 0;
    const expenseTotal = expenses.reduce((s, e) => s + e.total, 0);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenseTotal;

    res.json({
      success: true,
      data: {
        revenue,
        vatCollected,
        cogs,
        grossProfit,
        expenses: expenses.map((e) => ({ category: e._id || 'Other', amount: e.total })),
        expenseTotal,
        netProfit,
        incomeAccounts,
        expenseAccounts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBalanceSheet = async (req, res) => {
  try {
    const accounts = await Account.find({ isActive: true }).sort({ code: 1 }).lean();
    const grouped = { asset: [], liability: [], equity: [] };
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const acc of accounts) {
      if (grouped[acc.type]) {
        grouped[acc.type].push(acc);
        if (acc.type === 'asset') totalAssets += acc.balance;
        if (acc.type === 'liability') totalLiabilities += acc.balance;
        if (acc.type === 'equity') totalEquity += acc.balance;
      }
    }

    const [receivables, payables, inventoryValue] = await Promise.all([
      Customer.aggregate([{ $group: { _id: null, total: { $sum: '$outstanding' } } }]),
      Supplier.aggregate([{ $group: { _id: null, total: { $sum: '$outstanding' } } }]),
      Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        assets: grouped.asset,
        liabilities: grouped.liability,
        equity: grouped.equity,
        totalAssets,
        totalLiabilities,
        totalEquity,
        receivables: receivables[0]?.total || 0,
        payables: payables[0]?.total || 0,
        inventoryValue: inventoryValue[0]?.total || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const { page = 1, limit = 30, category } = req.query;
    const query = category ? { category } : {};
    const skip = (page - 1) * limit;
    const [expenses, total] = await Promise.all([
      Expense.find(query).populate('createdBy', 'name').sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
      Expense.countDocuments(query),
    ]);
    res.json({ success: true, data: expenses, pagination: { total, page: Number(page) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createExpense = async (req, res) => {
  try {
    const expense = await Expense.create({ ...req.body, createdBy: req.user._id });
    const populated = await Expense.findById(expense._id).populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getReports = async (req, res) => {
  try {
    const { type = 'sales', startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    const matchDate = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    let data = {};

    if (type === 'sales') {
      data = await Sale.aggregate([
        { $match: { type: 'invoice', status: 'completed', ...matchDate } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: '$total' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    } else if (type === 'products') {
      data = await Sale.aggregate([
        { $match: { type: 'invoice', status: 'completed', ...matchDate } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productName',
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 20 },
      ]);
    } else if (type === 'inventory') {
      data = await Product.find({ isActive: true })
        .select('name sku currentStock minStock purchasePrice sellingPrice')
        .sort({ currentStock: 1 })
        .lean();
    } else if (type === 'lowstock') {
      data = await Product.find({ isActive: true, $expr: { $lte: ['$currentStock', '$minStock'] } })
        .select('name sku currentStock minStock')
        .lean();
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
