const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Settings = require('../models/Settings');
const { DEFAULT_ROLES } = require('../config/permissions');
const { createAuditLog } = require('../middleware/audit');
const { cookieOptions } = require('../config/env');
const { runWithTenant } = require('../utils/tenantContext');
const { shopLoginBlocked, assertUserLimit, subscriptionSnapshot } = require('../services/planService');
const { industryProfile } = require('../config/industry');

const WEAK_PASSWORDS = new Set(['admin123', 'password', '123456', 'nepatronix', 'changeme']);

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, tenantId: user.tenantId || null, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

function isWeakPassword(password) {
  const value = String(password || '').trim().toLowerCase();
  return WEAK_PASSWORDS.has(value);
}

async function authPayload(user, tenant) {
  const roleConfig = DEFAULT_ROLES[user.role];
  const mustChangePassword = Boolean(user.mustChangePassword);
  let companyName = tenant?.name || null;
  if (user.role !== 'platform_admin' || tenant) {
    try {
      const settings = await Settings.findOne().select('companyName').lean();
      if (settings?.companyName) companyName = settings.companyName;
    } catch {
      // keep tenant name
    }
  }
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId || tenant?._id || null,
    tenantName: tenant?.name || null,
    tenantSlug: tenant?.slug || null,
    tenantStatus: tenant?.status || null,
    companyName,
    mustChangePassword,
    permissions: user.permissions?.length ? user.permissions : roleConfig?.permissions || [],
    landingPage: mustChangePassword ? '/change-password' : (roleConfig?.landingPage || '/dashboard'),
    subscription: tenant ? await subscriptionSnapshot(tenant) : null,
    ...industryProfile(tenant),
  };
}

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    if (role === 'platform_admin') {
      return res.status(403).json({ success: false, message: 'Cannot assign platform admin from a shop.' });
    }

    if (req.tenant) {
      await assertUserLimit(req.tenant);
    }

    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: role || 'sales_staff',
      tenantId: req.tenantId,
    });

    res.status(201).json({
      success: true,
      message: 'User created.',
      data: await authPayload(user, req.tenant),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email })
      .select('+password name email role permissions isActive failedLoginAttempts lockUntil tenantId mustChangePassword');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive.' });
    }

    if (user.isLocked()) {
      return res.status(423).json({ success: false, message: 'Account locked. Try again later.' });
    }

    let tenant = null;
    if (user.role !== 'platform_admin') {
      if (!user.tenantId) {
        return res.status(403).json({ success: false, message: 'Account is not linked to a shop.' });
      }
      tenant = await Tenant.findById(user.tenantId).lean();
      const blocked = shopLoginBlocked(tenant);
      if (blocked.blocked) {
        return res.status(403).json({ success: false, message: blocked.message });
      }
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      const failedUpdate = { failedLoginAttempts };
      if (failedLoginAttempts >= 5) {
        failedUpdate.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
      }
      User.updateOne({ _id: user._id }, { $set: failedUpdate }).catch(() => {});
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = generateToken(user);
    const now = new Date();
    const storedHash = user.password;

    User.updateOne(
      { _id: user._id },
      {
        $set: { failedLoginAttempts: 0, lastLogin: now },
        $unset: { lockUntil: 1 },
        $push: {
          loginHistory: {
            $each: [{ ip: req.ip, device: req.headers['user-agent'], timestamp: now }],
            $slice: -20,
          },
        },
      }
    ).catch(() => {});

    createAuditLog(user._id, 'login', 'user', user._id, null, null, req);

    setImmediate(async () => {
      try {
        const bcrypt = require('bcryptjs');
        if (storedHash && bcrypt.getRounds(storedHash) > 10) {
          const hashed = await bcrypt.hash(password, 10);
          await User.updateOne({ _id: user._id }, { $set: { password: hashed } });
        }
      } catch {
        // keep existing hash
      }
    });

    res.cookie('token', token, cookieOptions());
    res.json({
      success: true,
      data: await authPayload(user, tenant),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.magicLogin = async (req, res) => {
  try {
    const token = String(req.body.token || req.query.token || '').trim();
    if (!token || token.length < 20) {
      return res.status(400).json({ success: false, message: 'Invite link is missing or invalid.' });
    }
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      inviteTokenHash: hash,
      inviteExpiresAt: { $gt: new Date() },
    }).select('+inviteTokenHash name email role permissions isActive tenantId mustChangePassword');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invite link expired or already used. Ask Nepatronix to send a new one.' });
    }
    if (user.role === 'platform_admin') {
      return res.status(403).json({ success: false, message: 'Invalid invite.' });
    }
    const tenant = await Tenant.findById(user.tenantId).lean();
    const blocked = shopLoginBlocked(tenant);
    if (blocked.blocked) {
      return res.status(403).json({ success: false, message: blocked.message });
    }
    const now = new Date();
    await User.updateOne(
      { _id: user._id },
      {
        $set: { failedLoginAttempts: 0, lastLogin: now },
        $unset: { inviteTokenHash: 1, inviteExpiresAt: 1, lockUntil: 1 },
      }
    );

    const jwtToken = generateToken(user);
    createAuditLog(user._id, 'login', 'user', user._id, { method: 'invite' }, null, req);
    res.cookie('token', jwtToken, cookieOptions());
    res.json({
      success: true,
      data: await authPayload(user, tenant),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.logout = async (req, res) => {
  res.cookie('token', '', { ...cookieOptions(), maxAge: 0 });
  res.cookie('impersonateTenantId', '', { ...cookieOptions(), maxAge: 0 });
  res.cookie('impersonateUntil', '', { ...cookieOptions(), maxAge: 0 });
  res.json({ success: true, message: 'Logged out successfully.' });
};

exports.getMe = async (req, res) => {
  const user = req.user.toObject ? req.user.toObject() : req.user;
  res.json({
    success: true,
    data: {
      ...(await authPayload(user, req.tenant)),
      impersonating: Boolean(req.impersonating),
      impersonatingUntil: req.impersonateUntil || null,
    },
  });
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }
    if (isWeakPassword(newPassword)) {
      return res.status(400).json({ success: false, message: 'Choose a stronger password. Common passwords are not allowed.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from the current password.' });
    }

    const account = await runWithTenant(null, () =>
      User.findById(req.user._id).select('+password mustChangePassword role tenantId name email permissions')
    );
    if (!account) return res.status(404).json({ success: false, message: 'User not found.' });

    const ok = await account.comparePassword(currentPassword);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    account.password = newPassword;
    account.mustChangePassword = false;
    await runWithTenant(null, () => account.save());

    await createAuditLog(account._id, 'update', 'user', account._id, null, { passwordChanged: true }, req);

    res.json({
      success: true,
      message: 'Password updated.',
      data: await authPayload(account, req.tenant),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password -loginHistory').sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRoles = async (_req, res) => {
  try {
    const roles = Object.entries(DEFAULT_ROLES)
      .filter(([key]) => key !== 'platform_admin')
      .map(([key, config]) => ({
      key,
      name: config.name,
      description: config.description,
      landingPage: config.landingPage,
    }));
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    const actor = req.user;
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const actorRole = actor.role;
    const canManageAll = actorRole === 'super_admin';
    const canManageLogins = canManageAll || actorRole === 'admin';

    if (!canManageLogins) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (!canManageAll) {
      if (user.role === 'super_admin') {
        return res.status(403).json({ success: false, message: 'Admin cannot change the Super Admin account.' });
      }
      if (role && role === 'super_admin') {
        return res.status(403).json({ success: false, message: 'Cannot assign Super Admin role.' });
      }
    }

    if (user.role === 'super_admin' && role && role !== 'super_admin') {
      const remaining = await User.countDocuments({ role: 'super_admin', isActive: true, _id: { $ne: user._id } });
      if (remaining < 1) {
        return res.status(400).json({ success: false, message: 'Keep at least one Super Admin.' });
      }
    }

    if (email != null) {
      const nextEmail = String(email).toLowerCase().trim();
      if (!nextEmail) return res.status(400).json({ success: false, message: 'Email is required.' });
      const taken = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
      if (taken) return res.status(400).json({ success: false, message: 'That email is already in use.' });
      user.email = nextEmail;
    }
    if (name != null && String(name).trim()) user.name = String(name).trim();
    if (phone != null) user.phone = String(phone).trim();
    if (role && DEFAULT_ROLES[role] && role !== 'platform_admin') user.role = role;
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
      }
      user.password = password;
    }

    await user.save();
    await createAuditLog(
      actor._id,
      'update',
      'user',
      user._id,
      null,
      { email: user.email, role: user.role, passwordChanged: Boolean(password) },
      req
    );

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
