const { Warehouse } = require('../models/Warehouse');
const { getTenantId } = require('./tenantContext');

const cachedDefaultByTenant = new Map();

function cacheKey() {
  return getTenantId() || '_none';
}

async function ensureDefaultWarehouse() {
  const existing = await Warehouse.findOne({ isActive: true }).sort({ isDefault: -1, createdAt: 1 });
  if (existing) {
    cachedDefaultByTenant.set(cacheKey(), existing._id.toString());
    return existing;
  }

  if (!getTenantId()) return null;

  const created = await Warehouse.create({
    name: 'Main Warehouse',
    code: 'WH-MAIN',
    address: 'Main Store',
    isDefault: true,
    isActive: true,
  });

  cachedDefaultByTenant.set(cacheKey(), created._id.toString());
  return created;
}

async function getDefaultWarehouseId() {
  const key = cacheKey();
  const cached = cachedDefaultByTenant.get(key);
  if (cached) {
    const exists = await Warehouse.findById(cached).select('_id');
    if (exists) return cached;
    cachedDefaultByTenant.delete(key);
  }

  const wh = await Warehouse.findOne({ isActive: true, isDefault: true }).select('_id')
    || await Warehouse.findOne({ isActive: true }).sort({ createdAt: 1 }).select('_id');

  if (wh) {
    cachedDefaultByTenant.set(key, wh._id.toString());
    return cachedDefaultByTenant.get(key);
  }

  const created = await ensureDefaultWarehouse();
  return created ? created._id.toString() : null;
}

async function resolveWarehouseId(explicit) {
  if (explicit) return explicit;
  return getDefaultWarehouseId();
}

module.exports = { ensureDefaultWarehouse, getDefaultWarehouseId, resolveWarehouseId };
