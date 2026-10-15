const mongoose = require('mongoose');

const lifecycleSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  action: { type: String, required: true },
  note: { type: String },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  byEmail: { type: String },
}, { _id: false });

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  status: {
    type: String,
    enum: ['trial', 'active', 'suspended', 'archived'],
    default: 'trial',
  },
  plan: { type: String, enum: ['starter', 'business', 'enterprise'], default: 'business' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  storageGb: { type: Number, enum: [10, 30, 50, 100], default: 10 },
  trialEndsAt: { type: Date },
  paidUntil: { type: Date },
  lastPaymentAt: { type: Date },
  paymentNote: { type: String },
  notes: { type: String },
  suspendedReason: { type: String },
  suspendedAt: { type: Date },
  suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  suspendedByEmail: { type: String },
  archivedAt: { type: Date },
  archiveUntil: { type: Date },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  archivedByEmail: { type: String },
  archiveReason: { type: String },
  lifecycle: { type: [lifecycleSchema], default: [] },
}, { timestamps: true });

tenantSchema.index({ status: 1, createdAt: -1 });
tenantSchema.index({ status: 1, trialEndsAt: 1 });
tenantSchema.index({ status: 1, paidUntil: 1 });

module.exports = mongoose.model('Tenant', tenantSchema);
