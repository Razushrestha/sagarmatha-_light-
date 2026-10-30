const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const channelReservationSchema = new mongoose.Schema({
  channel: { type: String, required: true, trim: true },
  confirmation: { type: String, trim: true },
  guestName: { type: String, required: true, trim: true },
  guestPhone: { type: String },
  guestEmail: { type: String, trim: true, lowercase: true },
  roomType: { type: String },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'imported', 'cancelled'], default: 'pending' },
  stay: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay' },
  notes: { type: String },
}, { timestamps: true });

applyTenantPlugin(channelReservationSchema);
channelReservationSchema.index({ tenantId: 1, status: 1, checkIn: 1 });
channelReservationSchema.index({ tenantId: 1, status: 1, checkIn: 1, checkOut: 1 });

module.exports = mongoose.model('ChannelReservation', channelReservationSchema);
