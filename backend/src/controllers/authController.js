const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { DEFAULT_ROLES } = require('../config/permissions');
const { createAuditLog } = require('../middleware/audit');
const { cookieOptions } = require('../config/env');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const user = await User.create({ name, email, password, phone, role: role || 'sales_staff' });
    const token = generateToken(user._id);

    res.cookie('token', token, cookieOptions());
    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        landingPage: DEFAULT_ROLES[user.role]?.landingPage || '/dashboard',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email })
      .select('+password name email role permissions isActive failedLoginAttempts lockUntil');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive.' });
    }

    if (user.isLocked()) {
      return res.status(423).json({ success: false, message: 'Account locked. Try again later.' });
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

    const token = generateToken(user._id);
    const roleConfig = DEFAULT_ROLES[user.role];
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
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions?.length ? user.permissions : roleConfig?.permissions || [],
        landingPage: roleConfig?.landingPage || '/dashboard',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.logout = async (req, res) => {
  res.cookie('token', '', { ...cookieOptions(), maxAge: 0 });
  res.json({ success: true, message: 'Logged out successfully.' });
};

exports.getMe = async (req, res) => {
  const roleConfig = DEFAULT_ROLES[req.user.role];
  const user = req.user.toObject ? req.user.toObject() : req.user;
  res.json({
    success: true,
    data: {
      ...user,
      permissions: user.permissions?.length ? user.permissions : roleConfig?.permissions || [],
      landingPage: roleConfig?.landingPage || '/dashboard',
    },
  });
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
    const roles = Object.entries(DEFAULT_ROLES).map(([key, config]) => ({
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
    if (role && DEFAULT_ROLES[role]) user.role = role;
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
