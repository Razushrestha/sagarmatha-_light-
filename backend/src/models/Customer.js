const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  company: { type: String, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: { type: String },
  pan: { type: String, trim: true },
  vatNumber: { type: String, trim: true },
  creditLimit: { type: Number, default: 0 },
  paymentTerms: { type: String, enum: ['cash', 'net7', 'net15', 'net30'], default: 'cash' },
  openingBalance: { type: Number, default: 0 },
  openingDebt: { type: Number, default: 0 },
  openingCredit: { type: Number, default: 0 },
  openingBalanceDate: { type: Date },
  totalPurchases: { type: Number, default: 0 },
  totalPaid: { type: Number, default: 0 },
  outstanding: { type: Number, default: 0 },
  creditBalance: { type: Number, default: 0 },
  customerType: { type: String, enum: ['retail', 'wholesale', 'dealer', 'project'], default: 'retail' },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

customerSchema.index({ name: 'text', phone: 'text', company: 'text' });
customerSchema.index({ isActive: 1, outstanding: -1 });
customerSchema.index({ isActive: 1, creditBalance: -1 });

module.exports = mongoose.model('Customer', customerSchema);
