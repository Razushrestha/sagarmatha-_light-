const PlatformSettings = require('../models/PlatformSettings');

const FALLBACK = {
  trialMonths: Number(process.env.TRIAL_MONTHS || 3),
  defaultPlan: process.env.DEFAULT_PLAN || 'starter',
  defaultStorageGb: Number(process.env.DEFAULT_STORAGE_GB || 10),
  imageMaxPx: Number(process.env.IMAGE_MAX_PX || 1280),
  imageThumbPx: Number(process.env.IMAGE_THUMB_PX || 320),
  imageWebpQuality: Number(process.env.IMAGE_WEBP_QUALITY || 78),
  signupEnabled: process.env.SIGNUP_ENABLED !== 'false',
};

let cache = { ...FALLBACK };

function publicSettings(doc) {
  const row = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    trialMonths: Number(row?.trialMonths || FALLBACK.trialMonths),
    defaultPlan: ['starter', 'business', 'enterprise'].includes(row?.defaultPlan) ? row.defaultPlan : FALLBACK.defaultPlan,
    defaultStorageGb: [10, 30, 50, 100].includes(Number(row?.defaultStorageGb)) ? Number(row.defaultStorageGb) : FALLBACK.defaultStorageGb,
    imageMaxPx: Number(row?.imageMaxPx || FALLBACK.imageMaxPx),
    imageThumbPx: Number(row?.imageThumbPx || FALLBACK.imageThumbPx),
    imageWebpQuality: Number(row?.imageWebpQuality || FALLBACK.imageWebpQuality),
    signupEnabled: row?.signupEnabled !== false,
  };
}

function getCached() {
  return { ...cache };
}

async function loadPlatformSettings() {
  const doc = await PlatformSettings.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', ...FALLBACK } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  cache = publicSettings(doc);
  return cache;
}

async function savePlatformSettings(patch) {
  const next = { ...getCached(), ...patch };
  if (next.trialMonths) next.trialMonths = Math.min(24, Math.max(1, Number(next.trialMonths)));
  if (next.imageWebpQuality) next.imageWebpQuality = Math.min(95, Math.max(40, Number(next.imageWebpQuality)));
  if (next.imageMaxPx) next.imageMaxPx = Math.min(4000, Math.max(400, Number(next.imageMaxPx)));
  if (next.imageThumbPx) next.imageThumbPx = Math.min(800, Math.max(80, Number(next.imageThumbPx)));
  const doc = await PlatformSettings.findOneAndUpdate(
    { key: 'global' },
    { $set: { key: 'global', ...next } },
    { upsert: true, new: true }
  );
  cache = publicSettings(doc);
  return cache;
}

module.exports = {
  FALLBACK,
  getCached,
  loadPlatformSettings,
  savePlatformSettings,
  publicSettings,
};
