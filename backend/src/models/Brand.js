const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String },
  logo: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

applyTenantPlugin(brandSchema, { uniqueFields: ['name'] });

module.exports = mongoose.model('Brand', brandSchema);
