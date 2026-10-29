const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');
const { PACK_LITRES } = require('../config/paintPacks');

const colorantLineSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  millilitres: { type: Number, required: true, min: 0.01 },
}, { _id: false });

const formulaSchema = new mongoose.Schema({
  packLitres: { type: Number, required: true, enum: PACK_LITRES },
  baseProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  sellingPrice: { type: Number, min: 0 },
  colorants: { type: [colorantLineSchema], default: [] },
}, { _id: false });

const paintShadeSchema = new mongoose.Schema({
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  swatch: { type: String, default: '#c4a574', trim: true },
  isActive: { type: Boolean, default: true },
  formulas: { type: [formulaSchema], default: [] },
}, { timestamps: true });

applyTenantPlugin(paintShadeSchema, { uniqueFields: ['code'] });
paintShadeSchema.index({ tenantId: 1, isActive: 1, name: 1 });
paintShadeSchema.index({ tenantId: 1, brand: 1, isActive: 1 });

module.exports = mongoose.model('PaintShade', paintShadeSchema);
