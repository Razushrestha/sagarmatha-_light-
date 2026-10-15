const { AsyncLocalStorage } = require('async_hooks');

const tenantAls = new AsyncLocalStorage();

function getTenantId() {
  return tenantAls.getStore()?.tenantId || null;
}

function runWithTenant(tenantId, fn) {
  return tenantAls.run({ tenantId: tenantId ? String(tenantId) : null }, fn);
}

module.exports = { getTenantId, runWithTenant };
