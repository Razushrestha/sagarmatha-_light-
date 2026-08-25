const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema({
  purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
  amount: { type: Number, required: true, min: 0 },
});

const supplierPaymentSchema = new mongoose.Schema({
  paymentNumber: { type: String, required: true, unique: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  voucherDate: { type: Date, default: Date.now },
  paidFromAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  bankName: { type: String, trim: true },
  amount: { type: Number, required: true, min: 0.01 },
  discount: { type: Number, default: 0 },
  taxDeducted: { type: Number, default: 0 },
  total: { type: Number, required: true },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  narration: { type: String },
  purchaseAllocations: [allocationSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('SupplierPayment', supplierPaymentSchema);
