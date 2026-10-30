const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { DEFAULT_ROLES } = require('../config/permissions');
const { runWithTenant } = require('../utils/tenantContext');
const { shopLoginBlocked, impersonateBlocked } = require('../services/planService');
const { cacheGet, cacheSet } = require('../utils/cache');

const AUTH_CACHE_TTL = 30;

async function loadUserCached(userId) {
  const key = `erp:auth:user:${userId}`;
  const cached = await cacheGet(key);
  if (cached) return cached;
  const user = await User.findById(userId)
    .select('-password -loginHistory -twoFactorSecret')
    .lean();
  if (user) await cacheSet(key, user, AUTH_CACHE_TTL);
  return user;
}

async function loadTenantCached(tenantId) {
  const key = `erp:auth:tenant:${tenantId}`;
  const cached = await cacheGet(key);
  if (cached) return cached;
  const tenant = await Tenant.findById(tenantId).lean();
  if (tenant) await cacheSet(key, tenant, AUTH_CACHE_TTL);
  return tenant;
}

const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized. Please login.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await loadUserCached(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive.' });
    }

    if (
      user.role !== 'platform_admin'
      && decoded.tenantId
      && user.tenantId
      && String(decoded.tenantId) !== String(user.tenantId)
    ) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }

    req.user = user;

    if (user.role === 'platform_admin') {
      req.isPlatformAdmin = true;
      const impersonate = req.cookies?.impersonateTenantId;
      const until = Number(req.cookies?.impersonateUntil || 0);
      if (impersonate && (!until || until <= Date.now())) {
        const { cookieOptions } = require('../config/env');
        res.cookie('impersonateTenantId', '', { ...cookieOptions(), maxAge: 0 });
        res.cookie('impersonateUntil', '', { ...cookieOptions(), maxAge: 0 });
      } else if (impersonate && until && until > Date.now()) {
        const tenant = await loadTenantCached(impersonate);
        if (!tenant) {
          return res.status(403).json({ success: false, message: 'Shop not found.' });
        }
        const blocked = impersonateBlocked(tenant);
        if (blocked.blocked) {
          return res.status(403).json({ success: false, message: blocked.message });
        }
        req.tenantId = String(tenant._id);
        req.tenant = tenant;
        req.impersonating = true;
        req.impersonateUntil = until;
        return runWithTenant(tenant._id, () => next());
      }
      return next();
    }

    if (!user.tenantId) {
      return res.status(403).json({ success: false, message: 'Account is not linked to a shop.' });
    }

    const tenant = await loadTenantCached(user.tenantId);
    if (!tenant) {
      return res.status(403).json({ success: false, message: 'Shop not found.' });
    }
    const blocked = shopLoginBlocked(tenant);
    if (blocked.blocked) {
      return res.status(403).json({ success: false, message: blocked.message });
    }

    req.tenantId = String(tenant._id);
    req.tenant = tenant;
    return runWithTenant(tenant._id, () => next());
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

const requireShopTenant = (req, res, next) => {
  if (req.user?.role === 'platform_admin' && !req.tenantId) {
    return res.status(403).json({
      success: false,
      message: 'Open a shop from the platform panel before accessing shop data.',
    });
  }
  if (!req.tenantId) {
    return res.status(403).json({ success: false, message: 'Account is not linked to a shop.' });
  }
  next();
};

const requirePlatformAdmin = (req, res, next) => {
  if (req.user?.role !== 'platform_admin') {
    return res.status(403).json({ success: false, message: 'Platform admin access required.' });
  }
  next();
};

const authorize = (...permissions) => {
  return (req, res, next) => {
    if (req.user.role === 'platform_admin') {
      if (req.tenantId) return next();
      return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
    }

    const roleConfig = DEFAULT_ROLES[req.user.role];
    const userPermissions = req.user.permissions?.length
      ? req.user.permissions
      : roleConfig?.permissions || [];

    if (req.user.role === 'super_admin') return next();

    const hasPermission = permissions.some(p => userPermissions.includes(p));
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { protect, authorize, requireShopTenant, requirePlatformAdmin };
