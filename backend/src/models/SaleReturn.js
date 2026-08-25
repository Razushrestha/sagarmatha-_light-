const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  sku: { type: String },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  subtotal: { type: Number, required: true },
  originalSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  invoiceNumber: { type: String },
});

const saleReturnSchema = new mongoose.Schema({
  returnNumber: { type: String, required: true, unique: true },
  originalSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
  originalSales: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sale' }],
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  items: [returnItemSchema],
  subtotal: { type: Number, default: 0 },
  vatAmount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  commissionReversed: { type: Number, default: 0 },
  refundMethod: { type: String, enum: ['cash', 'bank', 'credit_note'], default: 'cash' },
  reason: { type: String },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('SaleReturn', saleReturnSchema);
