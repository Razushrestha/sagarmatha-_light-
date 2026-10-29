const mongoose = require('mongoose');
const company = require('../config/company');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

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
  serviceChargePercent: { type: Number, default: 10, min: 0, max: 100 },
  loyaltyStampsNeeded: { type: Number, default: 10, min: 1 },
  fiscalYear: { type: String },
  cbmsEnabled: { type: Boolean, default: false },
  cbmsUrl: { type: String, trim: true },
  currency: { type: String, default: 'NPR' },
  calendarType: { type: String, enum: ['bs', 'ad'], default: 'bs' },
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

applyTenantPlugin(settingsSchema, { uniqueTenant: true });

module.exports = mongoose.model('Settings', settingsSchema);
