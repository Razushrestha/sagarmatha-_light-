const Sale = require('../models/Sale');
const Product = require('../models/Product');
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

  if (type === 'lowstock') {
    return Product.aggregate([
      scopedMatch(req, { isActive: true }),
      { $match: { $expr: { $lte: ['$currentStock', '$minStock'] } } },
      { $project: { name: 1, sku: 1, currentStock: 1, minStock: 1 } },
      { $limit: 200 },
    ]);
  }

  throw new Error('Unknown report type.');
}

module.exports = { buildShopReport };
