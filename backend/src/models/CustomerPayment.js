const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const customerPaymentSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['payment', 'refund', 'store_credit'], default: 'payment' },
  method: { type: String, enum: ['cash', 'bank', 'esewa', 'khalti', 'fonepay', 'cheque', 'credit_note'], default: 'cash' },
  reference: { type: String },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

customerPaymentSchema.index({ customer: 1, createdAt: -1 });

applyTenantPlugin(customerPaymentSchema);
customerPaymentSchema.index({ tenantId: 1, customer: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerPayment', customerPaymentSchema);
