const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const diningTableSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  seats: { type: Number, default: 4, min: 1 },
  status: { type: String, enum: ['free', 'occupied'], default: 'free' },
  sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

applyTenantPlugin(diningTableSchema, { uniqueFields: ['name'] });
diningTableSchema.index({ tenantId: 1, status: 1, name: 1 });

module.exports = mongoose.model('DiningTable', diningTableSchema);
