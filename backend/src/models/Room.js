const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const roomSchema = new mongoose.Schema({
  number: { type: String, required: true, trim: true },
  type: { type: String, default: 'Standard', trim: true },
  rate: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['vacant', 'occupied', 'dirty', 'cleaning', 'inspected', 'ooo'], default: 'vacant' },
  stay: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

applyTenantPlugin(roomSchema, { uniqueFields: ['number'] });
roomSchema.index({ tenantId: 1, status: 1, number: 1 });

module.exports = mongoose.model('Room', roomSchema);
