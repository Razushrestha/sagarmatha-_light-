const mongoose = require('mongoose');

const supportEventSchema = new mongoose.Schema({
  action: { type: String, required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  tenantName: { type: String },
  tenantSlug: { type: String },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorEmail: { type: String },
  note: { type: String },
  ip: { type: String },
}, { timestamps: true });

supportEventSchema.index({ createdAt: -1 });
supportEventSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('SupportEvent', supportEventSchema);
