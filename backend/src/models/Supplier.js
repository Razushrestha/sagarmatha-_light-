const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  company: { type: String, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: { type: String },
  contactPerson: { type: String },
  pan: { type: String, trim: true },
  vatNumber: { type: String, trim: true },
  creditLimit: { type: Number, default: 0 },
  paymentTerms: { type: String, enum: ['cash', 'net7', 'net15', 'net30'], default: 'net30' },
  openingBalance: { type: Number, default: 0 },
  totalPurchases: { type: Number, default: 0 },
  totalPaid: { type: Number, default: 0 },
  outstanding: { type: Number, default: 0 },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Supplier', supplierSchema);
