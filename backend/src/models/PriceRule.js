const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const priceRuleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  percentOff: { type: Number, required: true, min: 0, max: 100 },
  days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  startTime: { type: String, default: '17:00' },
  endTime: { type: String, default: '19:00' },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

applyTenantPlugin(priceRuleSchema);
priceRuleSchema.index({ tenantId: 1, isActive: 1 });

module.exports = mongoose.model('PriceRule', priceRuleSchema);
