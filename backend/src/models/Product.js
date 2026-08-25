const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true },
  barcode: { type: String, trim: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  model: { type: String, trim: true },
  description: { type: String },
  images: [{ type: String }],
  purchasePrice: { type: Number, default: 0 },
  sellingPrice: { type: Number, required: true },
  commissionPercent: { type: Number, default: 5, min: 0, max: 100 },
  wholesalePrice: { type: Number },
  dealerPrice: { type: Number },
  projectPrice: { type: Number },
  minSellingPrice: { type: Number },
  vatInclusive: { type: Boolean, default: true },
  vatRate: { type: Number, default: 13 },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  purchaseUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  conversionFactor: { type: Number, default: 1 },
  currentStock: { type: Number, default: 0 },
  minStock: { type: Number, default: 5 },
  maxStock: { type: Number },
  rack: { type: String },
  shelf: { type: String },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  trackSerial: { type: Boolean, default: false },
  warrantyMonths: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  priceHistory: [{
    price: Number,
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['purchase', 'selling'] },
  }],
}, { timestamps: true });

productSchema.index({ name: 'text', sku: 'text', barcode: 'text' });
productSchema.index({ isActive: 1, name: 1 });
productSchema.index({ barcode: 1 });
productSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('Product', productSchema);
