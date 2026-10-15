const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String },
  permissions: [{ type: String }],
  landingPage: { type: String, default: '/dashboard' },
  isSystem: { type: Boolean, default: false },
}, { timestamps: true });

applyTenantPlugin(roleSchema, { uniqueFields: ['name'] });

module.exports = mongoose.model('Role', roleSchema);
