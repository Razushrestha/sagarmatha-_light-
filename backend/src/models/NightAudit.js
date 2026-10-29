const mongoose = require('mongoose');
const { applyTenantPlugin } = require('./plugins/tenantPlugin');

const nightAuditSchema = new mongoose.Schema({
  date: { type: String, required: true },
  status: { type: String, enum: ['closed', 'reopened'], default: 'closed' },
  snapshot: { type: mongoose.Schema.Types.Mixed },
  noShows: [{
    stay: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay' },
    guestName: { type: String },
    room: { type: String },
  }],
  inHouse: [{
    stay: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay' },
    guestName: { type: String },
    room: { type: String },
    folioBalance: { type: Number },
  }],
  notes: { type: String },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: { type: Date },
  reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reopenedAt: { type: Date },
}, { timestamps: true });

applyTenantPlugin(nightAuditSchema);
nightAuditSchema.index({ tenantId: 1, date: 1 }, { unique: true, partialFilterExpression: { status: 'closed' } });
nightAuditSchema.index({ tenantId: 1, status: 1, date: -1 });

module.exports = mongoose.model('NightAudit', nightAuditSchema);
