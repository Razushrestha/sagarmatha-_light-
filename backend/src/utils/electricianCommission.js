const { netItemValues, saleNetTotal } = require('./saleReturn');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isWireText(value) {
  const text = String(value || '');
  if (!text.trim()) return false;
  if (/wire/i.test(text)) return true;
  if (/\bcables?\b/i.test(text) && !/cable\s*ties?/i.test(text)) return true;
  return false;
}

function isWireCategory(name) {
  return isWireText(name);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthsAgoStart(date, months) {
  return new Date(date.getFullYear(), date.getMonth() - (months - 1), 1);
}

function categoryFromItem(item) {
  if (item.categoryName) return item.categoryName;
  const product = item.product;
  if (product && typeof product === 'object') {
    return product.category?.name || '';
  }
  return '';
}

function isWireItem(item = {}) {
  const product = item.product && typeof item.product === 'object' ? item.product : {};
  const nestedCategory = product.category && typeof product.category === 'object'
    ? product.category.name
    : product.category;
  return isWireText(categoryFromItem(item))
    || isWireText(item.productName)
    || isWireText(item.sku)
    || isWireText(product.name)
    || isWireText(product.sku)
    || isWireText(nestedCategory);
}

function itemRate(item) {
  if (isWireItem(item)) return 0;
  const product = item.product && typeof item.product === 'object' ? item.product : {};
  const rate = item.commissionPercent ?? product.commissionPercent;
  return Number.isFinite(Number(rate)) ? Number(rate) : 0;
}

function itemCommission(item, fallbackRate) {
  if (isWireItem(item)) return 0;
  if (typeof item.commission === 'number' && Number.isFinite(item.commission)) {
    return round2(Math.max(0, item.commission));
  }
  const lineTotal = Number(item.subtotal) || 0;
  const rate = itemRate(item) || fallbackRate || 0;
  return round2(lineTotal * (rate / 100));
}

function commissionForSale(sale, ratePercent) {
  let commission = 0;
  let eligibleSales = 0;
  let wireSales = 0;
  let usedReturnedQty = false;

  for (const item of sale.items || []) {
    if ((Number(item.returnedQuantity) || 0) > 0) usedReturnedQty = true;
    const net = netItemValues(item);
    if (isWireItem(item)) {
      wireSales += net.subtotal;
      continue;
    }
    eligibleSales += net.subtotal;
    if (typeof item.commission === 'number' && Number.isFinite(item.commission)) {
      commission += net.commission;
    } else {
      commission += itemCommission({ ...item, subtotal: net.subtotal, commission: undefined }, ratePercent);
    }
  }

  if (!usedReturnedQty && Number(sale.returnedCommission) > 0) {
    commission = Math.max(0, commission - Number(sale.returnedCommission));
  }

  return { commission: round2(commission), eligibleSales, wireSales };
}

function summarizeElectricianCommission(sales, electrician) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const threeStart = monthsAgoStart(now, 3);
  const sixStart = monthsAgoStart(now, 6);
  const yearStart = monthsAgoStart(now, 12);
  const rate = electrician.commissionPercent ?? 5;

  const totals = {
    total: 0,
    totalBill: 0,
    month: 0,
    threeMonths: 0,
    sixMonths: 0,
    year: 0,
    eligibleSales: 0,
    wireSales: 0,
  };
  const monthlyMap = new Map();
  const saleRows = [];

  for (const sale of sales) {
    const { commission, eligibleSales, wireSales } = commissionForSale(sale, rate);
    const created = new Date(sale.createdAt);
    totals.total += commission;
    totals.totalBill += saleNetTotal(sale);
    totals.eligibleSales += eligibleSales;
    totals.wireSales += wireSales;
    if (created >= monthStart) totals.month += commission;
    if (created >= threeStart) totals.threeMonths += commission;
    if (created >= sixStart) totals.sixMonths += commission;
    if (created >= yearStart) totals.year += commission;

    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + commission);

    saleRows.push({
      _id: sale._id,
      invoiceNumber: sale.invoiceNumber,
      type: sale.type,
      customerName: sale.customerName || '',
      createdAt: sale.createdAt,
      total: saleNetTotal(sale),
      originalTotal: sale.total,
      returnedTotal: sale.returnedTotal || 0,
      commission,
    });
  }

  const monthly = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly.push({
      month: d.toLocaleString('en-US', { month: 'short' }),
      year: d.getFullYear(),
      commission: monthlyMap.get(key) || 0,
    });
  }

  const received = (electrician.commissionReceived || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const toTake = Math.max(0, totals.total - received);

  return {
    rate,
    ...totals,
    received,
    toTake,
    monthly,
    sales: saleRows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100),
    payments: [...(electrician.commissionReceived || [])].sort((a, b) => new Date(b.date) - new Date(a.date)),
  };
}

async function applyCommissionToSaleBody(body) {
  const Electrician = require('../models/Electrician');
  const mongoose = require('mongoose');

  const electricianId = body.electrician;
  if (electricianId && mongoose.Types.ObjectId.isValid(String(electricianId))) {
    const electrician = await Electrician.findById(electricianId).select('isActive').lean();
    if (!electrician || electrician.isActive === false) {
      body.electrician = undefined;
    }
  } else {
    body.electrician = undefined;
  }

  if (Array.isArray(body.items)) {
    let total = 0;
    body.items = body.items.map((item) => {
      const categoryName = item.categoryName || item.categoryName || '';
      const normalized = { ...item, categoryName };
      const commissionPercent = isWireItem(normalized) ? 0 : itemRate(normalized);
      const commission = itemCommission({ ...normalized, commissionPercent }, 0);
      total += commission;
      return { ...normalized, commissionPercent, commission };
    });
    body.commissionTotal = round2(total);
  }
  return body;
}

module.exports = {
  isWireCategory,
  isWireItem,
  itemCommission,
  applyCommissionToSaleBody,
  summarizeElectricianCommission,
};
