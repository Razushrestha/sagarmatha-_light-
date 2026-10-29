const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const hotelRatePlanSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['company', 'travel_agent', 'group'], required: true },
  mode: { type: String, enum: ['fixed', 'percent_off'], default: 'fixed' },
  nightlyRate: { type: Number, default: 0, min: 0 },
  percentOff: { type: Number, default: 0, min: 0, max: 100 },
  roomType: { type: String, trim: true, default: '' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

applyTenantPlugin(hotelRatePlanSchema, { uniqueFields: ['name'] });
hotelRatePlanSchema.index({ tenantId: 1, isActive: 1, kind: 1 });

module.exports = mongoose.model('HotelRatePlan', hotelRatePlanSchema);
