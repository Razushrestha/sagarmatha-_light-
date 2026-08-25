const { Warehouse } = require('../models/Warehouse');

let cachedDefaultId = null;

async function ensureDefaultWarehouse() {
  const existing = await Warehouse.findOne({ isActive: true }).sort({ isDefault: -1, createdAt: 1 });
  if (existing) {
    cachedDefaultId = existing._id.toString();
    return existing;
  }

  const created = await Warehouse.create({
    name: 'Main Warehouse',
    code: 'WH-MAIN',
    address: 'Main Store',
    isDefault: true,
    isActive: true,
  });

  cachedDefaultId = created._id.toString();
  return created;
}

async function getDefaultWarehouseId() {
  if (cachedDefaultId) {
    const exists = await Warehouse.findById(cachedDefaultId).select('_id');
    if (exists) return cachedDefaultId;
    cachedDefaultId = null;
  }

  const wh = await Warehouse.findOne({ isActive: true, isDefault: true }).select('_id')
    || await Warehouse.findOne({ isActive: true }).sort({ createdAt: 1 }).select('_id');

  if (wh) {
    cachedDefaultId = wh._id.toString();
    return cachedDefaultId;
  }

  const created = await ensureDefaultWarehouse();
  return created._id.toString();
}

async function resolveWarehouseId(explicit) {
  if (explicit) return explicit;
  return getDefaultWarehouseId();
}

module.exports = { ensureDefaultWarehouse, getDefaultWarehouseId, resolveWarehouseId };
