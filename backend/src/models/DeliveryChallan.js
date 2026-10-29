const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const challanSchema = new mongoose.Schema({
  challanNumber: { type: String, required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String },
  customerPhone: { type: String },
  customerAddress: { type: String },
  sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String },
    sku: { type: String },
    quantity: { type: Number, required: true, min: 0.01 },
    unit: { type: String },
  }],
  vehicle: { type: String },
  driver: { type: String },
  notes: { type: String },
  status: { type: String, enum: ['draft', 'dispatched', 'delivered'], default: 'draft' },
  dispatchedAt: { type: Date },
  deliveredAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

applyTenantPlugin(challanSchema, { uniqueFields: ['challanNumber'] });
challanSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('DeliveryChallan', challanSchema);
