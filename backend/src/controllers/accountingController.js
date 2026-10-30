const { scoped, scopedMatch, parsePaging } = require('../utils/tenantQuery');
const { tenantKey, cacheGet, cacheSet, invalidateShopCache } = require('../utils/cache');
const { buildShopReport } = require('../services/reportService');
const { parseBusinessDateRange, netSaleAmount, revenueSaleMatch } = require('../utils/businessDates');
const { enqueue, jobResultKey, setJobResult, getJobResult } = require('../utils/jobs');
const { Account, JournalEntry } = require('../models/Account');
const Expense = require('../models/Expense');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');

exports.getAccounts = async (req, res) => {
  try {
    const accounts = await Account.find(scoped(req, { isActive: true })).sort({ code: 1 }).lean();
    res.json({ success: true, data: accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getJournalEntries = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaging(req.query, { defaultLimit: 30, max: 100 });
    const filter = scoped(req);
    const [entries, total] = await Promise.all([
      JournalEntry.find(filter)
        .populate('entries.account', 'code name type')
        .populate('createdBy', 'name')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      JournalEntry.countDocuments(filter),
    ]);
    res.json({ success: true, data: entries, pagination: { total, page, pages: Math.ceil(total / limit) || 1, limit } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFinancialSummary = async (req, res) => {
  try {
    const {
      monthStartKathmandu,
      kathmanduYmd,
      netSaleAmount,
      revenueSaleMatch,
    } = require('../utils/businessDates');
    const cacheKey = tenantKey(['reports', 'summary', kathmanduYmd()]);
    const forceRefresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
    if (!forceRefresh) {
      const cached = await cacheGet(cacheKey);
      if (cached) return res.json({ success: true, data: cached });
    }

    const monthStart = monthStartKathmandu();

    const [salesRevenue, purchaseCost, expenses, receivables, payables, inventoryValue, accounts] = await Promise.all([
      Sale.aggregate([
        scopedMatch(req, revenueSaleMatch({ createdAt: { $gte: monthStart } })),
        { $group: { _id: null, total: { $sum: netSaleAmount } } },
      ]),
      Purchase.aggregate([
        scopedMatch(req, { status: { $in: ['completed', 'received'] }, createdAt: { $gte: monthStart } }),
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Expense.aggregate([
        scopedMatch(req, {
          $or: [{ status: 'approved' }, { status: { $exists: false } }],
          date: { $gte: monthStart },
        }),
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Customer.aggregate([
        scopedMatch(req, { isActive: { $ne: false } }),
        { $group: { _id: null, total: { $sum: { $ifNull: ['$outstanding', 0] } } } },
      ]),
      Supplier.aggregate([
        scopedMatch(req, { isActive: { $ne: false } }),
        { $group: { _id: null, total: { $sum: { $ifNull: ['$outstanding', 0] } } } },
      ]),
      Product.aggregate([
        scopedMatch(req, { isActive: true }),
        { $group: { _id: null, total: { $sum: { $multiply: ['$currentStock', { $ifNull: ['$purchasePrice', 0] }] } } } },
      ]),
      Account.find(scoped(req, { isActive: true })).sort({ code: 1 }).lean(),
    ]);

    const revenue = salesRevenue[0]?.total || 0;
    const cogs = purchaseCost[0]?.total || 0;
    const expenseTotal = expenses[0]?.total || 0;

    const data = {
      monthlyRevenue: revenue,
      monthlyCOGS: cogs,
      grossProfit: revenue - cogs,
      monthlyExpenses: expenseTotal,
      netProfit: revenue - cogs - expenseTotal,
      receivables: receivables[0]?.total || 0,
      payables: payables[0]?.total || 0,
      inventoryValue: inventoryValue[0]?.total || 0,
      accounts,
      asOf: new Date().toISOString(),
      businessDate: kathmanduYmd(),
    };
    await cacheSet(cacheKey, data, 30);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProfitLoss = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = parseBusinessDateRange(startDate, endDate) || {};
    const matchDate = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};
    const expenseDate = Object.keys(dateFilter).length ? { date: dateFilter } : {};

    const [salesRevenue, purchaseCost, expenses, incomeAccounts, expenseAccounts] = await Promise.all([
      Sale.aggregate([
        scopedMatch(req, revenueSaleMatch(matchDate)),
        { $group: { _id: null, total: { $sum: netSaleAmount }, vat: { $sum: { $ifNull: ['$vatAmount', 0] } } } },
      ]),
      Purchase.aggregate([
        scopedMatch(req, { status: { $in: ['completed', 'received'] }, ...matchDate }),
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Expense.aggregate([
        scopedMatch(req, {
          $or: [{ status: 'approved' }, { status: { $exists: false } }],
          ...expenseDate,
        }),
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]),
      Account.find(scoped(req, { type: 'income', isActive: true })).sort({ code: 1 }).lean(),
      Account.find(scoped(req, { type: 'expense', isActive: true })).sort({ code: 1 }).lean(),
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
    const accounts = await Account.find(scoped(req, { isActive: true })).sort({ code: 1 }).lean();
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
      Customer.aggregate([scopedMatch(req), { $group: { _id: null, total: { $sum: '$outstanding' } } }]),
      Supplier.aggregate([scopedMatch(req), { $group: { _id: null, total: { $sum: '$outstanding' } } }]),
      Product.aggregate([
        scopedMatch(req, { isActive: true }),
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
    const { category } = req.query;
    const { page, limit, skip } = parsePaging(req.query, { defaultLimit: 30, max: 100 });
    const query = scoped(req, category ? { category } : {});
    const [expenses, total] = await Promise.all([
      Expense.find(query).populate('createdBy', 'name').sort({ date: -1 }).skip(skip).limit(limit).lean(),
      Expense.countDocuments(query),
    ]);
    res.json({ success: true, data: expenses, pagination: { total, page, pages: Math.ceil(total / limit) || 1, limit } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createExpense = async (req, res) => {
  try {
    const expense = await Expense.create({ ...req.body, createdBy: req.user._id });
    const populated = await Expense.findById(expense._id).populate('createdBy', 'name');
    await invalidateShopCache(['dashboard', 'reports']);
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateExpense = async (req, res) => {
  try {
    const { category, amount, paymentMethod, description, date } = req.body;
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { category, amount, paymentMethod, description, ...(date ? { date } : {}) },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name');
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    await invalidateShopCache(['dashboard', 'reports']);
    res.json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    await invalidateShopCache(['dashboard', 'reports']);
    res.json({ success: true, message: 'Expense deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getReports = async (req, res) => {
  try {
    const { type = 'sales', startDate, endDate, page, limit } = req.query;
    const data = await buildShopReport(req, { type, startDate, endDate, page, limit });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.enqueueReport = async (req, res) => {
  try {
    const { type = 'products', startDate, endDate } = req.body || {};
    const tenantId = String(req.tenantId);
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setJobResult(jobResultKey(tenantId, jobId), { status: 'queued', type });
    await enqueue('shop-report', { tenantId, jobId, type, startDate, endDate });
    res.status(202).json({ success: true, data: { jobId, status: 'queued' } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getReportJob = async (req, res) => {
  try {
    const stored = await getJobResult(jobResultKey(String(req.tenantId), req.params.jobId));
    if (!stored) {
      return res.status(404).json({ success: false, message: 'Report job not found or expired.' });
    }
    res.json({ success: true, data: stored });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
