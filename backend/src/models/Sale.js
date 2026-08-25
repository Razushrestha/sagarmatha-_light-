const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  sku: { type: String },
  quantity: { type: Number, required: true, min: 0.01 },
  unit: { type: String },
  unitPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  vatRate: { type: Number, default: 13 },
  vatAmount: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  costPrice: { type: Number, default: 0 },
  categoryName: { type: String },
  commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
  commission: { type: Number, default: 0 },
  returnedQuantity: { type: Number, default: 0, min: 0 },
});

const paymentSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ['cash', 'bank', 'card', 'qr', 'esewa', 'khalti', 'fonepay', 'credit'],
    required: true,
  },
  amount: { type: Number, required: true },
  reference: { type: String },
  bankName: { type: String },
  cardLast4: { type: String },
  approvalCode: { type: String },
});

const saleSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  type: { type: String, enum: ['invoice', 'estimate', 'quotation', 'order'], default: 'invoice' },
  status: {
    type: String,
    enum: ['draft', 'pending', 'completed', 'cancelled', 'returned', 'partial_return'],
    default: 'completed',
  },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String },
  customerPhone: { type: String },
  customerAddress: { type: String },
  customerPan: { type: String },
  electrician: { type: mongoose.Schema.Types.ObjectId, ref: 'Electrician' },
  commissionRate: { type: Number, default: 5 },
  commissionTotal: { type: Number, default: 0 },
  returnedTotal: { type: Number, default: 0 },
  returnedVat: { type: Number, default: 0 },
  returnedCommission: { type: Number, default: 0 },
  refundedAmount: { type: Number, default: 0 },
  items: [saleItemSchema],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  vatAmount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  amountDue: { type: Number, default: 0 },
  payments: [paymentSchema],
  changeAmount: { type: Number, default: 0 },
  isVatBill: { type: Boolean, default: true },
  notes: { type: String },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  validityDate: { type: Date },
  terms: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  heldAt: { type: Date },
  isHeld: { type: Boolean, default: false },
}, { timestamps: true });

saleSchema.index({ invoiceNumber: 'text', customerName: 'text' });
saleSchema.index({ type: 1, status: 1, createdAt: -1 });
saleSchema.index({ customer: 1, type: 1, isHeld: 1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ electrician: 1, createdAt: -1 });

module.exports = mongoose.model('Sale', saleSchema);
