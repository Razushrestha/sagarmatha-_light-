const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  trialMonths: { type: Number, default: 3, min: 1, max: 24 },
  defaultPlan: { type: String, enum: ['starter', 'business', 'enterprise'], default: 'starter' },
  defaultStorageGb: { type: Number, enum: [10, 30, 50, 100], default: 10 },
  imageMaxPx: { type: Number, default: 1280, min: 400, max: 4000 },
  imageThumbPx: { type: Number, default: 320, min: 80, max: 800 },
  imageWebpQuality: { type: Number, default: 78, min: 40, max: 95 },
  signupEnabled: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
