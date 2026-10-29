const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const shiftSchema = new mongoose.Schema({
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  openedAt: { type: Date, default: Date.now },
  openingFloat: { type: Number, default: 0, min: 0 },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: { type: Date },
  closingCash: { type: Number },
  expectedCash: { type: Number },
  difference: { type: Number },
  cashSales: { type: Number, default: 0 },
  cashRefunds: { type: Number, default: 0 },
  staffSales: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String },
    invoices: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  }],
  notes: { type: String },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
}, { timestamps: true });

applyTenantPlugin(shiftSchema);
shiftSchema.index({ tenantId: 1, status: 1, openedAt: -1 });

module.exports = mongoose.model('Shift', shiftSchema);
