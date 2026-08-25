const mongoose = require('mongoose');

const customerPaymentSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['payment', 'refund'], default: 'payment' },
  method: { type: String, enum: ['cash', 'bank', 'esewa', 'khalti', 'fonepay', 'cheque'], default: 'cash' },
  reference: { type: String },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

customerPaymentSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerPayment', customerPaymentSchema);
