const StockLot = require('../models/StockLot');
const { sessionOpts, sessionQuery } = require('../utils/mongoTransaction');

const INBOUND = new Set(['purchase', 'mix_in', 'adjustment_plus', 'opening', 'sale_return', 'transfer_in']);

async function applyLots({
  productId,
  warehouseId,
  delta,
  type,
  unitCost = 0,
  batchNo,
  expiry,
  sourceId,
  session,
}) {
  const qty = Number(delta) || 0;
  if (!productId || qty === 0) return;

  if (qty > 0 && INBOUND.has(type)) {
    await StockLot.create([{
      product: productId,
      warehouse: warehouseId,
      batchNo: batchNo || undefined,
      qty,
      remaining: qty,
      unitCost: Number(unitCost) || 0,
      expiry: expiry || undefined,
      sourceType: type,
      sourceId,
      receivedAt: new Date(),
    }], sessionOpts(session));
    return;
  }

  if (qty >= 0) return;

  let query = StockLot.find({ product: productId, remaining: { $gt: 0 } }).sort({ receivedAt: 1, _id: 1 });
  const lots = await sessionQuery(query, session);
  if (!lots.length) return;

  let need = -qty;
  for (const lot of lots) {
    if (need <= 0) break;
    const take = Math.min(Number(lot.remaining) || 0, need);
    lot.remaining = Math.round((lot.remaining - take) * 1000) / 1000;
    await lot.save(sessionOpts(session));
    need -= take;
  }
}

module.exports = { applyLots, INBOUND };
