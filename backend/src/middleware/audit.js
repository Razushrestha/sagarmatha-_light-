const AuditLog = require('../models/AuditLog');

const createAuditLog = async (userId, action, resource, resourceId, oldValue, newValue, req, reason) => {
  try {
    await AuditLog.create({
      user: userId,
      action,
      resource,
      resourceId,
      oldValue,
      newValue,
      ip: req?.ip || req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent'],
      reason,
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

module.exports = { createAuditLog };
