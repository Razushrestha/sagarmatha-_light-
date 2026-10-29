const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const folioSchema = new mongoose.Schema({
  stay: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay' },
  guestName: { type: String },
  guestBName: { type: String },
  guestBPhone: { type: String },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  splitMode: { type: String, enum: ['none', 'room_extras', 'two_guests'], default: 'none' },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  charges: [{
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    description: { type: String },
    source: { type: String },
    kind: { type: String, enum: ['charge', 'payment', 'deposit', 'city_ledger', 'credit'], default: 'charge' },
    method: { type: String },
    bucket: { type: String, default: 'main' },
    amount: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    at: { type: Date, default: Date.now },
  }],
  balance: { type: Number, default: 0 },
  closedAt: { type: Date },
}, { timestamps: true });

applyTenantPlugin(folioSchema);
folioSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Folio', folioSchema);
