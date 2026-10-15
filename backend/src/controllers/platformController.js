const crypto = require('crypto');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const SupportEvent = require('../models/SupportEvent');
const { provisionTenant } = require('../services/tenantService');
const { wipeTenantData } = require('../services/tenantWipe');
const { usedStorageBytes } = require('../utils/storageUsage');
const { cookieOptions, impersonateMs, frontendPort } = require('../config/env');
const {
  impersonateBlocked,
  shopLoginBlocked,
  subscriptionSnapshot,
  trialPeriodEnd,
  billingBucket,
  STORAGE_OPTIONS_GB,
  ARCHIVE_DAYS,
} = require('../services/planService');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function appOrigin() {
  return String(process.env.FRONTEND_URL || `http://localhost:${frontendPort()}`).replace(/\/$/, '');
}

function logSupport(req, { action, tenant, note }) {
  return SupportEvent.create({
    action,
    tenantId: tenant?._id,
    tenantName: tenant?.name,
    tenantSlug: tenant?.slug,
    actor: req.user?._id,
    actorEmail: req.user?.email,
    note: note || '',
    ip: req.ip,
  }).catch(() => null);
}

function pushLifecycle(tenant, req, action, note) {
  tenant.lifecycle = tenant.lifecycle || [];
  tenant.lifecycle.unshift({
    at: new Date(),
    action,
    note: note || '',
    by: req.user._id,
    byEmail: req.user.email,
  });
  tenant.lifecycle = tenant.lifecycle.slice(0, 50);
}

async function shopActivity(tenantId) {
  const [lastUser, lastSale] = await Promise.all([
    User.findOne({ tenantId, lastLogin: { $ne: null } }).sort({ lastLogin: -1 }).select('lastLogin').lean(),
    Sale.findOne({ tenantId }).sort({ createdAt: -1 }).select('createdAt invoiceNumber').lean(),
  ]);
  return {
    lastLoginAt: lastUser?.lastLogin || null,
    lastInvoiceAt: lastSale?.createdAt || null,
    lastInvoiceNumber: lastSale?.invoiceNumber || null,
  };
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isoDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

async function tenantSearchFilter(req) {
  const includeArchived = req.query.includeArchived === 'true';
  const q = String(req.query.q || '').trim();
  const filter = includeArchived ? {} : { status: { $ne: 'archived' } };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const owners = await User.find({
      $or: [{ email: rx }, { phone: rx }, { name: rx }],
      role: { $ne: 'platform_admin' },
    }).select('_id').lean();
    filter.$or = [
      { name: rx },
      { slug: rx },
      { owner: { $in: owners.map((row) => row._id) } },
    ];
  }
  return filter;
}

function withMoney(tenant, subscription) {
  return {
    ...tenant,
    paymentNotes: tenant.paymentNote || '',
    lastPaymentAt: tenant.lastPaymentAt || null,
    paidUntil: tenant.paidUntil || null,
    subscription,
    billing: subscription?.billing || billingBucket(tenant),
  };
}

async function loadShopRows(req) {
  const filter = await tenantSearchFilter(req);
  const billing = String(req.query.billing || '').trim();
  const tenants = await Tenant.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('owner', 'name email phone')
    .lean();
  const rows = await Promise.all(tenants.map(async (tenant) => {
    const subscription = await subscriptionSnapshot(tenant);
    const activity = await shopActivity(tenant._id);
    return { ...withMoney(tenant, subscription), activity };
  }));
  const counts = {
    all: rows.length,
    trial_ending: rows.filter((row) => row.billing === 'trial_ending').length,
    overdue: rows.filter((row) => row.billing === 'overdue').length,
    suspended: rows.filter((row) => row.billing === 'suspended').length,
  };
  const data = billing ? rows.filter((row) => row.billing === billing) : rows;
  return { data, counts };
}

function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
  };
}

exports.signup = async (req, res) => {
  try {
    const { shopName, name, email, password, phone } = req.body;
    if (!shopName || !name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Shop name, your name, email and password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const { getCached } = require('../services/platformSettings');
    const defaults = getCached();
    if (!defaults.signupEnabled) {
      return res.status(403).json({ success: false, message: 'Public signup is turned off. Ask Nepatronix to create your shop.' });
    }
    const { tenant, owner } = await provisionTenant({
      name: String(shopName).trim(),
      ownerName: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password,
      phone,
      status: 'trial',
      plan: defaults.defaultPlan || 'starter',
      storageGb: defaults.defaultStorageGb || 10,
    });

    res.status(201).json({
      success: true,
      message: 'Shop created. You can sign in now.',
      data: {
        tenant: { _id: tenant._id, name: tenant.name, slug: tenant.slug, status: tenant.status },
        owner: publicUser(owner),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listTenants = async (req, res) => {
  try {
    const { data, counts } = await loadShopRows(req);
    res.json({ success: true, data, counts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportTenants = async (req, res) => {
  try {
    const { data } = await loadShopRows(req);
    const header = [
      'Shop', 'Slug', 'Status', 'Billing', 'Plan', 'Owner name', 'Owner email', 'Owner phone',
      'Trial ends', 'Paid until', 'Last payment', 'Payment notes',
      'Last login', 'Last invoice', 'Last invoice no', 'Storage GB used', 'Storage GB limit', 'Created',
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const row of data) {
      const used = Number(row.subscription?.usage?.storageBytes || 0) / (1024 * 1024 * 1024);
      lines.push([
        row.name,
        row.slug,
        row.status,
        row.billing,
        row.plan,
        row.owner?.name || '',
        row.owner?.email || '',
        row.owner?.phone || '',
        isoDay(row.subscription?.trialEndsAt),
        isoDay(row.paidUntil),
        isoDay(row.lastPaymentAt),
        row.paymentNotes || row.paymentNote || '',
        isoDay(row.activity?.lastLoginAt),
        isoDay(row.activity?.lastInvoiceAt),
        row.activity?.lastInvoiceNumber || '',
        used ? used.toFixed(3) : '0',
        row.subscription?.limits?.storageGb || row.storageGb || '',
        isoDay(row.createdAt),
      ].map(csvCell).join(','));
    }
    const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nepatronix-shops-${stamp}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id).populate('owner', 'name email phone').lean();
    if (!tenant) return res.status(404).json({ success: false, message: 'Shop not found.' });
    const users = await User.find({ tenantId: tenant._id }).select('name email role isActive lastLogin').lean();
    res.json({
      success: true,
      data: {
        ...tenant,
        paymentNotes: tenant.paymentNote || '',
        users,
        subscription: await subscriptionSnapshot(tenant),
        activity: await shopActivity(tenant._id),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTenant = async (req, res) => {
  try {
    const { shopName, name, email, password, phone, plan, status, storageGb } = req.body;
    if (!shopName || !name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Shop name, owner name, email and password are required.' });
    }
    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }
    const defaults = require('../services/platformSettings').getCached();
    const { tenant, owner } = await provisionTenant({
      name: String(shopName).trim(),
      ownerName: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password,
      phone,
      status: status || 'active',
      plan: plan || defaults.defaultPlan || 'business',
      storageGb: storageGb || defaults.defaultStorageGb,
    });
    res.status(201).json({ success: true, data: { tenant, owner: publicUser(owner) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: 'Shop not found.' });
    const { name, status, plan, notes, storageGb } = req.body;
    if (name) tenant.name = String(name).trim();
    if (status && ['trial', 'active', 'suspended', 'archived'].includes(status)) {
      tenant.status = status;
      if (status === 'trial' && !tenant.trialEndsAt) {
        tenant.trialEndsAt = trialPeriodEnd();
      }
    }
    if (plan && ['starter', 'business', 'enterprise'].includes(plan)) tenant.plan = plan;
    if (STORAGE_OPTIONS_GB.includes(Number(storageGb))) tenant.storageGb = Number(storageGb);
    if (notes != null) tenant.notes = notes;
    if (req.body.trialEndsAt) tenant.trialEndsAt = new Date(req.body.trialEndsAt);
    if (req.body.paidUntil) tenant.paidUntil = new Date(req.body.paidUntil);
    if (req.body.lastPaymentAt) tenant.lastPaymentAt = new Date(req.body.lastPaymentAt);
    const paymentNotes = req.body.paymentNotes != null ? req.body.paymentNotes : req.body.paymentNote;
    if (paymentNotes != null) tenant.paymentNote = paymentNotes;
    await tenant.save();
    res.json({ success: true, data: tenant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.impersonate = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: 'Shop not found.' });
    const blocked = impersonateBlocked(tenant);
    if (blocked.blocked) {
      return res.status(403).json({ success: false, message: blocked.message });
    }
    const requested = Number(req.body.minutes);
    const ttl = Number.isFinite(requested)
      ? Math.min(60, Math.max(15, requested)) * 60 * 1000
      : impersonateMs();
    const until = Date.now() + ttl;
    const opts = { ...cookieOptions(), maxAge: ttl };
    res.cookie('impersonateTenantId', String(tenant._id), opts);
    res.cookie('impersonateUntil', String(until), opts);
    await logSupport(req, { action: 'impersonate', tenant, note: `${Math.round(ttl / 60000)} min` });
    res.json({
      success: true,
      data: {
        tenantId: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        until,
        minutes: Math.round(ttl / 60000),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.stopImpersonate = async (req, res) => {
  res.cookie('impersonateTenantId', '', { ...cookieOptions(), maxAge: 0 });
  res.cookie('impersonateUntil', '', { ...cookieOptions(), maxAge: 0 });
  res.json({ success: true, message: 'Stopped viewing shop.' });
};

exports.listSupportLog = async (req, res) => {
  try {
    const filter = {};
    if (req.query.tenantId) filter.tenantId = req.query.tenantId;
    if (req.query.action) filter.action = req.query.action;
    const rows = await SupportEvent.find(filter).sort({ createdAt: -1 }).limit(80).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSnapshot = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id).populate('owner', 'name email phone lastLogin').lean();
    if (!tenant) return res.status(404).json({ success: false, message: 'Shop not found.' });
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [users, products, salesAgg, storageBytes] = await Promise.all([
      User.find({ tenantId: tenant._id }).select('name email role isActive lastLogin phone').lean(),
      Product.countDocuments({ tenantId: tenant._id }),
      Sale.aggregate([
        {
          $match: {
            tenantId: tenant._id,
            createdAt: { $gte: since },
            isHeld: { $ne: true },
            type: { $in: ['invoice', null] },
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$total' } } },
      ]),
      usedStorageBytes(tenant._id),
    ]);
    const { redisStatus, redisErrors } = require('../config/redis');
    const { jobsStatus } = require('../utils/jobs');
    const jobs = jobsStatus();
    const tenantId = String(tenant._id);
    res.json({
      success: true,
      data: {
        users: {
          count: users.length,
          rows: users,
        },
        products,
        salesLast7Days: {
          count: salesAgg[0]?.count || 0,
          total: salesAgg[0]?.total || 0,
        },
        storage: {
          bytes: storageBytes,
          gb: Number((storageBytes / (1024 * 1024 * 1024)).toFixed(3)),
          limitGb: tenant.storageGb,
        },
        redis: {
          status: redisStatus(),
          errors: redisErrors(),
        },
        jobs: {
          ...jobs,
          errors: (jobs.errors || []).filter((row) => !row.tenantId || row.tenantId === tenantId),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.inviteOwner = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: 'Shop not found.' });
    const blocked = shopLoginBlocked(tenant);
    if (blocked.blocked) {
      return res.status(403).json({ success: false, message: blocked.message });
    }
    const owner = await User.findById(tenant.owner);
    if (!owner) return res.status(404).json({ success: false, message: 'Shop owner not found.' });
    const token = crypto.randomBytes(32).toString('hex');
    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const inviteUpdate = {
      inviteTokenHash: hashToken(token),
      inviteExpiresAt,
    };
    if (!owner.lastLogin) inviteUpdate.mustChangePassword = true;
    await User.updateOne({ _id: owner._id }, { $set: inviteUpdate });
    const url = `${appOrigin()}/login?invite=${token}`;
    await logSupport(req, { action: 'invite', tenant, note: owner.email });
    res.json({
      success: true,
      message: 'Copy this link and send it to the owner (WhatsApp, email). It expires in 24 hours.',
      data: {
        email: owner.email,
        phone: owner.phone,
        url,
        expiresAt: inviteExpiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.resetOwnerPassword = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: 'Shop not found.' });
    const owner = await User.findById(tenant.owner).select('+password');
    if (!owner) return res.status(404).json({ success: false, message: 'Shop owner not found.' });
    const password = String(req.body.password || '').trim()
      || `Nepa-${crypto.randomBytes(4).toString('hex')}`;
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    owner.password = password;
    owner.mustChangePassword = true;
    owner.failedLoginAttempts = 0;
    owner.lockUntil = undefined;
    await owner.save();
    pushLifecycle(tenant, req, 'password_reset', 'Owner password reset; must change on next login.');
    await tenant.save();
    res.json({
      success: true,
      message: 'Owner must change this password at next login.',
      data: { email: owner.email, temporaryPassword: password },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.lifecycle = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: 'Shop not found.' });
    const action = String(req.body.action || '');
    const note = String(req.body.note || req.body.reason || req.body.paymentNotes || '').trim();

    if (action === 'extend-trial') {
      if (!req.body.trialEndsAt) {
        return res.status(400).json({ success: false, message: 'Choose a new trial end date.' });
      }
      tenant.status = 'trial';
      tenant.trialEndsAt = new Date(req.body.trialEndsAt);
      if (note) tenant.paymentNote = note;
      pushLifecycle(tenant, req, 'extend-trial', note || `Trial extended to ${tenant.trialEndsAt.toISOString().slice(0, 10)}`);
    } else if (action === 'convert' || action === 'record-payment') {
      if (!req.body.paidUntil) {
        return res.status(400).json({ success: false, message: 'Set paid-until date (e.g. 12 months).' });
      }
      tenant.status = 'active';
      tenant.paidUntil = new Date(req.body.paidUntil);
      tenant.lastPaymentAt = req.body.lastPaymentAt ? new Date(req.body.lastPaymentAt) : new Date();
      tenant.paymentNote = note || tenant.paymentNote;
      if (req.body.plan && ['starter', 'business', 'enterprise'].includes(req.body.plan)) {
        tenant.plan = req.body.plan;
      }
      const label = action === 'record-payment' ? 'record-payment' : 'convert';
      pushLifecycle(tenant, req, label, note || `Paid until ${tenant.paidUntil.toISOString().slice(0, 10)}`);
    } else if (action === 'suspend') {
      if (!note) {
        return res.status(400).json({ success: false, message: 'Give a reason for suspending this shop.' });
      }
      tenant.status = 'suspended';
      tenant.suspendedReason = note;
      tenant.suspendedAt = new Date();
      tenant.suspendedBy = req.user._id;
      tenant.suspendedByEmail = req.user.email;
      pushLifecycle(tenant, req, 'suspend', note);
    } else if (action === 'unsuspend') {
      tenant.status = tenant.paidUntil ? 'active' : 'trial';
      tenant.suspendedReason = undefined;
      tenant.suspendedAt = undefined;
      tenant.suspendedBy = undefined;
      tenant.suspendedByEmail = undefined;
      pushLifecycle(tenant, req, 'unsuspend', note);
    } else if (action === 'archive') {
      const until = new Date();
      until.setDate(until.getDate() + ARCHIVE_DAYS);
      tenant.status = 'archived';
      tenant.archivedAt = new Date();
      tenant.archiveUntil = until;
      tenant.archivedBy = req.user._id;
      tenant.archivedByEmail = req.user.email;
      tenant.archiveReason = note || 'Archived by platform admin';
      pushLifecycle(tenant, req, 'archive', tenant.archiveReason);
    } else if (action === 'restore') {
      tenant.status = tenant.paidUntil ? 'active' : 'trial';
      tenant.archivedAt = undefined;
      tenant.archiveUntil = undefined;
      tenant.archivedBy = undefined;
      tenant.archivedByEmail = undefined;
      tenant.archiveReason = undefined;
      pushLifecycle(tenant, req, 'restore', note || 'Restored from archive');
    } else if (action === 'wipe') {
      const slug = String(req.body.confirmSlug || '').trim().toLowerCase();
      if (slug !== tenant.slug) {
        return res.status(400).json({ success: false, message: 'Type the shop slug to confirm permanent wipe.' });
      }
      if (tenant.status !== 'archived') {
        return res.status(400).json({ success: false, message: 'Archive the shop first. Wipe is permanent.' });
      }
      await wipeTenantData(tenant._id);
      return res.json({ success: true, message: 'Shop data permanently deleted.' });
    } else {
      return res.status(400).json({ success: false, message: 'Unknown lifecycle action.' });
    }

    await tenant.save();
    const fresh = await Tenant.findById(tenant._id).populate('owner', 'name email phone').lean();
    res.json({
      success: true,
      data: {
        ...fresh,
        subscription: await subscriptionSnapshot(fresh),
        activity: await shopActivity(fresh._id),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMetrics = async (req, res) => {
  try {
    const { snapshot } = require('../utils/metrics');
    const { jobsStatus } = require('../utils/jobs');
    const { status: healthStatus } = require('../utils/healthWatch');
    const data = await snapshot();
    data.jobs = { ...data.jobs, ...jobsStatus() };
    data.alerts = healthStatus();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.publicConfig = async (req, res) => {
  try {
    const { getCached } = require('../services/platformSettings');
    res.json({ success: true, data: { signupEnabled: getCached().signupEnabled !== false } });
  } catch (error) {
    res.json({ success: true, data: { signupEnabled: true } });
  }
};

function dirSizeBytes(dir) {
  const fs = require('fs');
  const path = require('path');
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else {
      try { total += fs.statSync(full).size; } catch { /* skip */ }
    }
  }
  return total;
}

exports.listBackups = async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const root = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
    let lastOk = null;
    try {
      if (fs.existsSync(path.join(root, 'LAST_OK'))) {
        lastOk = fs.readFileSync(path.join(root, 'LAST_OK'), 'utf8').trim();
      }
    } catch { /* ignore */ }
    const items = fs.existsSync(root)
      ? fs.readdirSync(root)
        .filter((name) => name.startsWith('dump-'))
        .map((name) => {
          const full = path.join(root, name);
          const st = fs.statSync(full);
          return { name, at: st.mtime, bytes: dirSizeBytes(full) };
        })
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, 20)
      : [];
    res.json({ success: true, data: { dir: root, lastOk, items } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.runBackup = async (req, res) => {
  try {
    const { execFile } = require('child_process');
    const path = require('path');
    const script = path.join(__dirname, '../../scripts/backup-mongo.js');
    execFile(process.execPath, [script], { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: error.message.includes('mongodump')
            ? 'mongodump is not installed or not on PATH.'
            : error.message,
          detail: String(stderr || '').slice(-400),
        });
      }
      res.json({ success: true, message: 'Backup finished.', log: String(stdout || '').slice(-400) });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const { loadPlatformSettings } = require('../services/platformSettings');
    res.json({ success: true, data: await loadPlatformSettings() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { savePlatformSettings } = require('../services/platformSettings');
    const allowed = [
      'trialMonths', 'defaultPlan', 'defaultStorageGb',
      'imageMaxPx', 'imageThumbPx', 'imageWebpQuality', 'signupEnabled',
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] != null) patch[key] = req.body[key];
    }
    const data = await savePlatformSettings(patch);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAdmins = async (req, res) => {
  try {
    const users = await User.find({ role: 'platform_admin' })
      .setOptions({ skipTenant: true })
      .select('name email phone isActive lastLogin createdAt')
      .sort({ createdAt: 1 })
      .lean();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '').trim()
      || `Nepa-${crypto.randomBytes(4).toString('hex')}`;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    const existing = await User.findOne({ email }).setOptions({ skipTenant: true });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }
    const user = await User.create({
      name,
      email,
      password,
      phone: req.body.phone,
      role: 'platform_admin',
      mustChangePassword: true,
    });
    res.status(201).json({
      success: true,
      data: { ...publicUser(user), temporaryPassword: password },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateAdmin = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'platform_admin' })
      .setOptions({ skipTenant: true })
      .select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'Admin not found.' });
    if (req.body.name) user.name = String(req.body.name).trim();
    if (req.body.phone != null) user.phone = req.body.phone;
    if (req.body.isActive === false) {
      const active = await User.countDocuments({ role: 'platform_admin', isActive: { $ne: false } })
        .setOptions({ skipTenant: true });
      if (active <= 1) {
        return res.status(400).json({ success: false, message: 'Keep at least one active platform admin.' });
      }
      user.isActive = false;
    }
    if (req.body.isActive === true) user.isActive = true;
    let temporaryPassword;
    if (req.body.resetPassword) {
      temporaryPassword = String(req.body.password || '').trim()
        || `Nepa-${crypto.randomBytes(4).toString('hex')}`;
      user.password = temporaryPassword;
      user.mustChangePassword = true;
    }
    await user.save();
    res.json({
      success: true,
      data: { ...publicUser(user), ...(temporaryPassword ? { temporaryPassword } : {}) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.testAlert = async (req, res) => {
  try {
    const { pageOps, channelsConfigured } = require('../utils/alerter');
    const channels = channelsConfigured();
    if (!channels.telegram && !channels.email) {
      return res.status(400).json({
        success: false,
        message: 'Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and/or SMTP_HOST + ALERT_EMAIL_TO first.',
      });
    }
    const sent = await pageOps({
      key: 'test',
      title: 'Test page from platform admin',
      body: `${req.user.email} sent a test alert. If you got this, paging works without looking at the dashboard.`,
    });
    res.json({ success: true, data: { sent, channels } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
