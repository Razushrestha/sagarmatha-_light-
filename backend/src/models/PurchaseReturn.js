const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.01 },
  unitPrice: { type: Number, required: true },
  subtotal: { type: Number, required: true },
});

const purchaseReturnSchema = new mongoose.Schema({
  returnNumber: { type: String, required: true, unique: true },
  originalPurchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  items: [returnItemSchema],
  subtotal: { type: Number, default: 0 },
  vatAmount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  refundMethod: { type: String, enum: ['cash', 'bank', 'credit_note'], default: 'credit_note' },
  reason: { type: String },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);
