const mongoose = require('mongoose');
const company = require('../config/company');

const settingsSchema = new mongoose.Schema({
  companyName: { type: String, default: company.companyName },
  companyLogo: { type: String },
  address: { type: String, default: company.address },
  phone: { type: String, default: company.phone },
  email: { type: String },
  pan: { type: String },
  vatNumber: { type: String, default: company.vatNumber },
  vatRate: { type: Number, default: 13 },
  vatInclusive: { type: Boolean, default: true },
  currency: { type: String, default: 'NPR' },
  invoicePrefix: { type: String, default: 'INV' },
  invoiceStartNumber: { type: Number, default: 1 },
  purchasePrefix: { type: String, default: 'PO' },
  quotationPrefix: { type: String, default: 'QT' },
  termsAndConditions: { type: String },
  footerText: { type: String },
  paymentMethods: [{
    name: String,
    enabled: { type: Boolean, default: true },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
