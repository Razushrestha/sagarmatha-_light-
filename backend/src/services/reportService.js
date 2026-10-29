const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { scoped, scopedMatch, parsePaging } = require('../utils/tenantQuery');

async function buildShopReport(reqLike, { type = 'sales', startDate, endDate, page, limit } = {}) {
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateFilter.$lte = end;
  }
  const matchDate = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};
  const req = reqLike;

  if (type === 'sales') {
    return Sale.aggregate([
      scopedMatch(req, { type: 'invoice', status: 'completed', ...matchDate }),
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  if (type === 'products') {
    return Sale.aggregate([
      scopedMatch(req, { type: 'invoice', status: 'completed', ...matchDate }),
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
  }

  if (type === 'inventory') {
    const paging = parsePaging({ page, limit }, { defaultLimit: 100, max: 200 });
    return Product.find(scoped(req, { isActive: true }))
      .select('name sku currentStock minStock purchasePrice sellingPrice')
      .sort({ currentStock: 1 })
      .skip(paging.skip)
      .limit(paging.limit)
      .lean();
  }

  if (type === 'paint-mix') {
    const kindExpr = {
      $cond: [
        { $eq: ['$items.tinted', true] },
        'mix',
        {
          $cond: [
            {
              $or: [
                { $eq: ['$prod.attrs.role', 'paint_base'] },
                { $gt: [{ $ifNull: ['$prod.attrs.packLitres', 0] }, 0] },
              ],
            },
            'ready',
            'other',
          ],
        },
      ],
    };

    const pipeline = [
      scopedMatch(req, { type: 'invoice', status: 'completed', isHeld: { $ne: true }, ...matchDate }),
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'prod',
        },
      },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      { $addFields: { kind: kindExpr } },
    ];

    const [byKind, daily] = await Promise.all([
      Sale.aggregate([
        ...pipeline,
        {
          $group: {
            _id: '$kind',
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' },
            litres: {
              $sum: {
                $multiply: ['$items.quantity', { $ifNull: ['$prod.attrs.packLitres', 0] }],
              },
            },
            invoices: { $addToSet: '$_id' },
          },
        },
      ]),
      Sale.aggregate([
        ...pipeline,
        { $match: { kind: { $in: ['mix', 'ready'] } } },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              kind: '$kind',
            },
            revenue: { $sum: '$items.subtotal' },
            litres: {
              $sum: {
                $multiply: ['$items.quantity', { $ifNull: ['$prod.attrs.packLitres', 0] }],
              },
            },
          },
        },
        { $sort: { '_id.day': 1 } },
      ]),
    ]);

    const empty = { quantity: 0, revenue: 0, litres: 0, invoices: 0 };
    const summary = { mix: { ...empty }, ready: { ...empty }, other: { ...empty } };
    for (const row of byKind) {
      if (!summary[row._id]) continue;
      summary[row._id] = {
        quantity: row.quantity || 0,
        revenue: row.revenue || 0,
        litres: row.litres || 0,
        invoices: (row.invoices || []).length,
      };
    }
    const paintRevenue = summary.mix.revenue + summary.ready.revenue;
    const days = {};
    for (const row of daily) {
      const day = row._id.day;
      if (!days[day]) days[day] = { date: day, mixRevenue: 0, readyRevenue: 0, mixLitres: 0, readyLitres: 0 };
      if (row._id.kind === 'mix') {
        days[day].mixRevenue = row.revenue;
        days[day].mixLitres = row.litres;
      } else {
        days[day].readyRevenue = row.revenue;
        days[day].readyLitres = row.litres;
      }
    }
    return {
      ...summary,
      mixShare: paintRevenue > 0 ? summary.mix.revenue / paintRevenue : 0,
      daily: Object.values(days),
    };
  }

  if (type === 'lowstock') {
    return Product.aggregate([
      scopedMatch(req, { isActive: true }),
      { $match: { $expr: { $lte: ['$currentStock', '$minStock'] } } },
      { $project: { name: 1, sku: 1, currentStock: 1, minStock: 1 } },
      { $limit: 200 },
    ]);
  }

  if (type === 'margin' || type === 'profit-by-item') {
    return Sale.aggregate([
      scopedMatch(req, { type: 'invoice', status: { $in: ['completed', 'partial_return'] }, isHeld: { $ne: true }, ...matchDate }),
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productName',
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.subtotal' },
          cost: { $sum: { $multiply: [{ $ifNull: ['$items.costPrice', 0] }, '$items.quantity'] } },
        },
      },
      {
        $addFields: {
          profit: { $subtract: ['$revenue', '$cost'] },
        },
      },
      { $sort: { profit: -1 } },
      { $limit: 50 },
    ]);
  }

  if (type === 'credit') {
    return Customer.find(scoped(req, { isActive: true, outstanding: { $gt: 0 } }))
      .select('name phone outstanding')
      .sort({ outstanding: -1 })
      .limit(200)
      .lean();
  }

  if (type === 'eod') {
    const saleMatch = scoped(req, {
      type: 'invoice',
      status: { $in: ['completed', 'partial_return'] },
      isHeld: { $ne: true },
      ...matchDate,
    });
    const [salesAgg, cashAgg, profitByItem, creditDue, lowStock] = await Promise.all([
      Sale.aggregate([
        { $match: saleMatch },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: { $sum: '$total' },
            vat: { $sum: { $ifNull: ['$vatAmount', 0] } },
            serviceCharge: { $sum: { $ifNull: ['$serviceChargeAmount', 0] } },
            credit: { $sum: { $ifNull: ['$amountDue', 0] } },
          },
        },
      ]),
      Sale.aggregate([
        { $match: saleMatch },
        { $unwind: { path: '$payments', preserveNullAndEmptyArrays: true } },
        { $match: { 'payments.method': 'cash' } },
        { $group: { _id: null, cash: { $sum: '$payments.amount' } } },
      ]),
      Sale.aggregate([
        { $match: saleMatch },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productName',
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' },
            cost: { $sum: { $multiply: [{ $ifNull: ['$items.costPrice', 0] }, '$items.quantity'] } },
          },
        },
        { $addFields: { profit: { $subtract: ['$revenue', '$cost'] } } },
        { $sort: { profit: -1 } },
        { $limit: 30 },
      ]),
      Customer.find(scoped(req, { isActive: true, outstanding: { $gt: 0 } }))
        .select('name phone outstanding')
        .sort({ outstanding: -1 })
        .limit(50)
        .lean(),
      Product.aggregate([
        scopedMatch(req, { isActive: true }),
        { $match: { $expr: { $lte: ['$currentStock', '$minStock'] } } },
        { $project: { name: 1, sku: 1, currentStock: 1, minStock: 1 } },
        { $limit: 50 },
      ]),
    ]);
    const sales = salesAgg[0] || { count: 0, total: 0, vat: 0, serviceCharge: 0, credit: 0 };
    return {
      sales: {
        count: sales.count || 0,
        total: sales.total || 0,
        vat: sales.vat || 0,
        serviceCharge: sales.serviceCharge || 0,
        cash: cashAgg[0]?.cash || 0,
        credit: sales.credit || 0,
      },
      profitByItem,
      creditDue,
      creditTotal: creditDue.reduce((s, row) => s + (Number(row.outstanding) || 0), 0),
      lowStock,
    };
  }

  throw new Error('Unknown report type.');
}

module.exports = { buildShopReport };
