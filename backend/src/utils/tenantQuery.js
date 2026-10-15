const mongoose = require('mongoose');
const { getTenantId } = require('./tenantContext');

function shopTenantId(req) {
  const raw = req?.tenantId || getTenantId();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) {
    const err = new Error('Shop context required.');
    err.statusCode = 403;
    throw err;
  }
  return new mongoose.Types.ObjectId(raw);
}

function scoped(req, filter = {}) {
  return { ...filter, tenantId: shopTenantId(req) };
}

function scopedMatch(req, extra = {}) {
  return { $match: scoped(req, extra) };
}

function parsePaging(query, { defaultLimit = 50, max = 200 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const raw = query.limit;
  let limit;
  if (raw === '0' || String(raw || '').toLowerCase() === 'all') {
    limit = max;
  } else {
    limit = parseInt(raw, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  }
  limit = Math.min(max, limit);
  return { page, limit, skip: (page - 1) * limit };
}

function mustBelongToShop(doc, req, message = 'Not found.') {
  if (!doc) {
    const err = new Error(message);
    err.statusCode = 404;
    throw err;
  }
  const tid = String(shopTenantId(req));
  if (doc.tenantId && String(doc.tenantId) !== tid) {
    const err = new Error(message);
    err.statusCode = 404;
    throw err;
  }
  return doc;
}

module.exports = { shopTenantId, scoped, scopedMatch, parsePaging, mustBelongToShop };
