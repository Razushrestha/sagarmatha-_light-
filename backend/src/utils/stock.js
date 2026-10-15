const Product = require('../models/Product');
const { StockMovement } = require('../models/Warehouse');
const { sessionOpts } = require('./mongoTransaction');
const { getTenantId } = require('./tenantContext');
const mongoose = require('mongoose');

function tenantFilter(id) {
  const filter = { _id: id };
  const tid = getTenantId();
  if (tid && mongoose.Types.ObjectId.isValid(tid)) {
    filter.tenantId = new mongoose.Types.ObjectId(tid);
  }
  return filter;
}

async function changeStock({
  productId,
  productName,
  delta,
  session,
  warehouseId,
  type,
  reference,
  referenceId,
  userId,
  notes,
  extraUpdate,
}) {
  const qty = Number(delta) || 0;
  const filter = tenantFilter(productId);
  if (qty < 0) {
    filter.currentStock = { $gte: Math.abs(qty) };
  }

  const update = { $inc: { currentStock: qty } };
  if (extraUpdate?.$set) update.$set = extraUpdate.$set;
  if (extraUpdate?.$push) update.$push = extraUpdate.$push;

  const product = await Product.findOneAndUpdate(filter, update, {
    new: true,
    ...sessionOpts(session),
  });

  if (!product) {
    const exists = await Product.findOne(tenantFilter(productId)).select('_id').lean();
    if (!exists) {
      throw new Error(`Product not found: ${productName || productId}`);
    }
    throw new Error(`Insufficient stock for ${productName || 'item'}.`);
  }

  await StockMovement.create([{
    product: product._id,
    warehouse: warehouseId,
    type,
    quantity: qty,
    balanceAfter: product.currentStock,
    reference,
    referenceId,
    notes,
    createdBy: userId,
  }], sessionOpts(session));

  return product;
}

module.exports = { changeStock };
