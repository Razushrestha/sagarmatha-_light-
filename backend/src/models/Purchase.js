const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  quantityReceived: { type: Number, default: 0 },
  unitPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  vatRate: { type: Number, default: 13 },
  vatAmount: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
});

const purchaseSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  type: { type: String, enum: ['order', 'grn', 'invoice'], default: 'invoice' },
  status: {
    type: String,
    enum: ['draft', 'ordered', 'partial', 'received', 'completed', 'cancelled', 'returned'],
    default: 'completed',
  },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  items: [purchaseItemSchema],
  subtotal: { type: Number, default: 0 },
  freightCost: { type: Number, default: 0 },
  otherCosts: { type: Number, default: 0 },
  vatAmount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  amountDue: { type: Number, default: 0 },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  payments: [{
    method: { type: String, enum: ['cash', 'bank', 'cheque', 'credit'] },
    amount: { type: Number },
    reference: { type: String },
    date: { type: Date, default: Date.now },
  }],
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  attachment: { type: String },
  notes: { type: String },
  terms: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

purchaseSchema.index({ supplier: 1, type: 1, createdAt: -1 });
purchaseSchema.index({ type: 1, createdAt: -1 });
purchaseSchema.index({ supplier: 1, amountDue: 1 });

module.exports = mongoose.model('Purchase', purchaseSchema);
