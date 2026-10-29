const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  image: { type: String },
  relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

applyTenantPlugin(categorySchema);

module.exports = mongoose.model('Category', categorySchema);
