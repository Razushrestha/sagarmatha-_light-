const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const stockLotSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  batchNo: { type: String, trim: true },
  qty: { type: Number, required: true, min: 0 },
  remaining: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, default: 0 },
  receivedAt: { type: Date, default: Date.now },
  expiry: { type: Date },
  sourceType: { type: String },
  sourceId: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true });

applyTenantPlugin(stockLotSchema);
stockLotSchema.index({ tenantId: 1, product: 1, remaining: 1, receivedAt: 1 });

module.exports = mongoose.model('StockLot', stockLotSchema);
