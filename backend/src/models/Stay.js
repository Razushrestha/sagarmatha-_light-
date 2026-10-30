const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const staySchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  folio: { type: mongoose.Schema.Types.ObjectId, ref: 'Folio' },
  roomSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  roomSales: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sale' }],
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  ratePlan: { type: mongoose.Schema.Types.ObjectId, ref: 'HotelRatePlan' },
  rateKind: { type: String, enum: ['rack', 'company', 'travel_agent', 'group'], default: 'rack' },
  guestName: { type: String, required: true, trim: true },
  guestPhone: { type: String, trim: true },
  guestEmail: { type: String, trim: true, lowercase: true },
  guestIdType: {
    type: String,
    enum: ['citizenship', 'passport', 'license', 'voter', 'other'],
    default: 'citizenship',
  },
  guestIdNumber: { type: String, trim: true },
  guestNationality: { type: String, trim: true, default: 'Nepal' },
  guestAddress: { type: String, trim: true },
  secondGuestName: { type: String, trim: true },
  secondGuestPhone: { type: String, trim: true },
  checkIn: { type: Date, default: Date.now },
  checkOut: { type: Date },
  nights: { type: Number, default: 1, min: 1 },
  rate: { type: Number, default: 0 },
  guestProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'HotelGuest' },
  mealPlan: { type: String, enum: ['room_only', 'bb', 'map', 'ap'], default: 'room_only' },
  mealRate: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show'],
    default: 'checked_in',
  },
  channel: { type: String },
  notes: { type: String },
  arrivedAt: { type: Date },
  cancelledAt: { type: Date },
  noShowAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

applyTenantPlugin(staySchema);
staySchema.index({ tenantId: 1, status: 1, checkIn: -1 });
staySchema.index({ tenantId: 1, room: 1, status: 1, checkIn: 1 });
staySchema.index({ tenantId: 1, status: 1, checkIn: 1, checkOut: 1 });

module.exports = mongoose.model('Stay', staySchema);
