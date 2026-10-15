const mongoose = require('mongoose');
const User = require('../models/User');
const { getTenantId } = require('../utils/tenantContext');
const { usedStorageBytes } = require('../utils/storageUsage');

const TRIAL_MONTHS = Number(process.env.TRIAL_MONTHS || 3);
const ARCHIVE_DAYS = 90;
const STORAGE_OPTIONS_GB = [10, 30, 50, 100];
const BYTES_PER_GB = 1024 * 1024 * 1024;

const PLAN_LIMITS = {
  starter: { users: 3, storageGb: 10 },
  business: { users: 10, storageGb: 30 },
  enterprise: { users: 50, storageGb: 50 },
};

function addMonths(from, months) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

function trialMonths() {
  try {
    const { getCached } = require('./platformSettings');
    return Number(getCached().trialMonths || TRIAL_MONTHS);
  } catch {
    return TRIAL_MONTHS;
  }
}

function trialPeriodEnd(from = new Date()) {
  return addMonths(from, trialMonths());
}

function limitsFor(tenant) {
  const plan = PLAN_LIMITS[tenant?.plan] || PLAN_LIMITS.starter;
  const configured = Number(tenant?.storageGb);
  const storageGb = STORAGE_OPTIONS_GB.includes(configured) ? configured : plan.storageGb;
  return { users: plan.users, storageGb };
}

function trialEndsAt(tenant) {
  if (tenant.trialEndsAt) return new Date(tenant.trialEndsAt);
  if (tenant.status !== 'trial') return null;
  const created = tenant.createdAt ? new Date(tenant.createdAt) : new Date();
  return trialPeriodEnd(created);
}

function isTrialExpired(tenant) {
  if (!tenant || tenant.status !== 'trial') return false;
  const ends = trialEndsAt(tenant);
  return Boolean(ends && ends.getTime() < Date.now());
}

function isPaidExpired(tenant) {
  if (!tenant || tenant.status !== 'active' || !tenant.paidUntil) return false;
  return new Date(tenant.paidUntil).getTime() < Date.now();
}

function isTrialEndingSoon(tenant, days = 7) {
  if (!tenant || tenant.status !== 'trial' || isTrialExpired(tenant)) return false;
  const ends = trialEndsAt(tenant);
  if (!ends) return false;
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  const t = ends.getTime();
  return t >= Date.now() && t <= until;
}

function isOverdue(tenant) {
  if (!tenant) return false;
  if (tenant.status === 'archived' || tenant.status === 'suspended') return false;
  return isTrialExpired(tenant) || isPaidExpired(tenant);
}

function billingBucket(tenant) {
  if (!tenant) return 'unknown';
  if (tenant.status === 'archived') return 'archived';
  if (tenant.status === 'suspended') return 'suspended';
  if (isOverdue(tenant)) return 'overdue';
  if (isTrialEndingSoon(tenant)) return 'trial_ending';
  return 'ok';
}

function shopLoginBlocked(tenant) {
  if (!tenant) return { blocked: true, message: 'Shop not found.' };
  if (tenant.status === 'archived') {
    return { blocked: true, message: 'This shop is closed. Contact Nepatronix support.' };
  }
  if (tenant.status === 'suspended') {
    return { blocked: true, message: 'This shop is suspended. Contact Nepatronix support.' };
  }
  if (isPaidExpired(tenant)) {
    return {
      blocked: true,
      message: 'This shop subscription has ended. Ask Nepatronix to renew access.',
    };
  }
  if (isTrialExpired(tenant)) {
    return {
      blocked: true,
      message: 'Your 3-month trial has ended. Ask Nepatronix to activate this shop.',
    };
  }
  return { blocked: false, message: null };
}

function impersonateBlocked(tenant) {
  if (!tenant) return { blocked: true, message: 'Shop not found.' };
  if (tenant.status === 'archived') {
    return { blocked: true, message: 'Shop is archived. Restore it before opening.' };
  }
  return { blocked: false, message: null };
}

function asObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return null;
}

async function usageForTenant(tenantId) {
  const tid = asObjectId(tenantId || getTenantId());
  const userFilter = { role: { $ne: 'platform_admin' }, isActive: { $ne: false } };
  if (tid) userFilter.tenantId = tid;
  const users = await User.countDocuments(userFilter);
  const storageBytes = tid ? await usedStorageBytes(tid) : 0;
  return { users, storageBytes };
}

async function assertUserLimit(tenant) {
  const limits = limitsFor(tenant);
  const { users } = await usageForTenant(tenant._id);
  if (users >= limits.users) {
    const error = new Error(`This ${tenant.plan} plan allows ${limits.users} users. Upgrade the shop plan to add more.`);
    error.statusCode = 403;
    throw error;
  }
}

async function assertStorageLimit(tenant, incomingBytes = 0) {
  const limits = limitsFor(tenant);
  const cap = limits.storageGb * BYTES_PER_GB;
  const { storageBytes } = await usageForTenant(tenant._id);
  if (storageBytes + Number(incomingBytes || 0) > cap) {
    const usedGb = (storageBytes / BYTES_PER_GB).toFixed(2);
    const error = new Error(
      `Storage limit reached (${usedGb} GB of ${limits.storageGb} GB). Ask Nepatronix to increase this shop's storage.`
    );
    error.statusCode = 403;
    throw error;
  }
}

async function subscriptionSnapshot(tenant) {
  if (!tenant) return null;
  const limits = limitsFor(tenant);
  let usage = { users: 0, storageBytes: 0 };
  try {
    usage = await usageForTenant(tenant._id);
  } catch {
    // keep zeros
  }
  const ends = trialEndsAt(tenant);
  return {
    plan: tenant.plan,
    status: tenant.status,
    trialEndsAt: ends,
    trialExpired: isTrialExpired(tenant),
    paidUntil: tenant.paidUntil || null,
    paidExpired: isPaidExpired(tenant),
    lastPaymentAt: tenant.lastPaymentAt || null,
    paymentNote: tenant.paymentNote || null,
    paymentNotes: tenant.paymentNote || null,
    billing: billingBucket(tenant),
    trialEndingSoon: isTrialEndingSoon(tenant),
    overdue: isOverdue(tenant),
    archiveUntil: tenant.archiveUntil || null,
    limits,
    usage,
    storageOptionsGb: STORAGE_OPTIONS_GB,
  };
}

module.exports = {
  TRIAL_MONTHS,
  ARCHIVE_DAYS,
  STORAGE_OPTIONS_GB,
  BYTES_PER_GB,
  PLAN_LIMITS,
  limitsFor,
  trialPeriodEnd,
  trialEndsAt,
  isTrialExpired,
  isPaidExpired,
  isTrialEndingSoon,
  isOverdue,
  billingBucket,
  shopLoginBlocked,
  impersonateBlocked,
  usageForTenant,
  assertUserLimit,
  assertStorageLimit,
  subscriptionSnapshot,
};
