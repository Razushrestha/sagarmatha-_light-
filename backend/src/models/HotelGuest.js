const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const hotelGuestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  idType: { type: String, enum: ['citizenship', 'passport', 'license', 'voter', 'other'], default: 'citizenship' },
  idNumber: { type: String, trim: true, default: '' },
  nationality: { type: String, trim: true, default: 'Nepal' },
  address: { type: String, trim: true, default: '' },
  stayCount: { type: Number, default: 0, min: 0 },
  lastStayAt: { type: Date },
  notes: { type: String },
}, { timestamps: true });

applyTenantPlugin(hotelGuestSchema, { uniqueFields: ['phone'] });
hotelGuestSchema.index({ tenantId: 1, idNumber: 1 });
hotelGuestSchema.index({ tenantId: 1, name: 1 });

module.exports = mongoose.model('HotelGuest', hotelGuestSchema);
