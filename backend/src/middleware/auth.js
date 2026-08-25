const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { DEFAULT_ROLES } = require('../config/permissions');

const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized. Please login.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id)
      .select('-password -loginHistory -twoFactorSecret')
      .lean();

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

const authorize = (...permissions) => {
  return (req, res, next) => {
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

module.exports = { protect, authorize };
