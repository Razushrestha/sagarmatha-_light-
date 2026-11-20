const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { Warehouse } = require('../models/Warehouse');
const { Unit } = require('../models/Unit');
const { Account } = require('../models/Account');
const { runWithTenant } = require('../utils/tenantContext');
const { trialPeriodEnd, PLAN_LIMITS } = require('./planService');
const { normalizeIndustry, modulesFor } = require('../config/industry');

/** Electrical / hardware shop units */
const HARDWARE_UNITS = [
  { name: 'Piece', shortName: 'Pcs' },
  { name: 'Meter', shortName: 'M' },
  { name: 'Feet', shortName: 'Ft' },
  { name: 'Box', shortName: 'Box' },
  { name: 'Roll', shortName: 'Roll' },
  { name: 'Coil', shortName: 'Coil' },
  { name: 'Set', shortName: 'Set' },
  { name: 'Pair', shortName: 'Pair' },
  { name: 'Kilogram', shortName: 'Kg' },
];

/** Paint shop units */
const PAINT_UNITS = [
  { name: 'Piece', shortName: 'Pcs' },
  { name: 'Litre', shortName: 'L' },
  { name: 'Millilitre', shortName: 'ml' },
  { name: 'Gallon', shortName: 'Gal' },
  { name: 'Tin', shortName: 'Tin' },
  { name: 'Can', shortName: 'Can' },
  { name: 'Drum', shortName: 'Drum' },
  { name: 'Box', shortName: 'Box' },
  { name: 'Kilogram', shortName: 'Kg' },
  { name: 'Gram', shortName: 'g' },
  { name: 'Set', shortName: 'Set' },
];

/** Cafe / F&B stock and menu units */
const CAFE_UNITS = [
  { name: 'Piece', shortName: 'Pcs' },
  { name: 'Portion', shortName: 'Port' },
  { name: 'Serving', shortName: 'Srv' },
  { name: 'Cup', shortName: 'Cup' },
  { name: 'Glass', shortName: 'Gl' },
  { name: 'Plate', shortName: 'Plt' },
  { name: 'Bowl', shortName: 'Bowl' },
  { name: 'Shot', shortName: 'Shot' },
  { name: 'Scoop', shortName: 'Scoop' },
  { name: 'Slice', shortName: 'Slice' },
  { name: 'Dozen', shortName: 'Dzn' },
  { name: 'Packet', shortName: 'Pkt' },
  { name: 'Bottle', shortName: 'Btl' },
  { name: 'Can', shortName: 'Can' },
  { name: 'Gram', shortName: 'g' },
  { name: 'Kilogram', shortName: 'Kg' },
  { name: 'Millilitre', shortName: 'ml' },
  { name: 'Litre', shortName: 'L' },
];

/** Hotel inventory (F&B + rooms amenities) */
const HOTEL_UNITS = [
  { name: 'Piece', shortName: 'Pcs' },
  { name: 'Portion', shortName: 'Port' },
  { name: 'Serving', shortName: 'Srv' },
  { name: 'Cup', shortName: 'Cup' },
  { name: 'Glass', shortName: 'Gl' },
  { name: 'Plate', shortName: 'Plt' },
  { name: 'Bowl', shortName: 'Bowl' },
  { name: 'Bottle', shortName: 'Btl' },
  { name: 'Can', shortName: 'Can' },
  { name: 'Packet', shortName: 'Pkt' },
  { name: 'Dozen', shortName: 'Dzn' },
  { name: 'Set', shortName: 'Set' },
  { name: 'Pair', shortName: 'Pair' },
  { name: 'Roll', shortName: 'Roll' },
  { name: 'Gram', shortName: 'g' },
  { name: 'Kilogram', shortName: 'Kg' },
  { name: 'Millilitre', shortName: 'ml' },
  { name: 'Litre', shortName: 'L' },
];

/** @deprecated use HARDWARE_UNITS */
const DEFAULT_UNITS = HARDWARE_UNITS;

const INDUSTRY_UNITS = {
  hardware: HARDWARE_UNITS,
  paint: PAINT_UNITS,
  cafe: CAFE_UNITS,
  hotel: HOTEL_UNITS,
};

function unitsForIndustry(industry) {
  return INDUSTRY_UNITS[normalizeIndustry(industry)] || HARDWARE_UNITS;
}

function unitIdentityKeys(unit) {
  return [String(unit.name || '').trim().toLowerCase(), String(unit.shortName || '').trim().toLowerCase()]
    .filter(Boolean);
}

function catalogKeySet(list) {
  const keys = new Set();
  for (const unit of list) {
    for (const key of unitIdentityKeys(unit)) keys.add(key);
  }
  return keys;
}

function allCatalogKeys() {
  const keys = new Set();
  for (const list of Object.values(INDUSTRY_UNITS)) {
    for (const key of catalogKeySet(list)) keys.add(key);
  }
  return keys;
}

function isCatalogUnit(unit) {
  const catalog = allCatalogKeys();
  return unitIdentityKeys(unit).some((key) => catalog.has(key));
}

function unitAllowedForIndustry(unit, industry) {
  const allowed = catalogKeySet(unitsForIndustry(industry));
  const keys = unitIdentityKeys(unit);
  if (keys.some((key) => allowed.has(key))) return true;
  // Custom (shop-added) units stay visible for that shop
  return !isCatalogUnit(unit);
}

function sortUnitsForIndustry(units, industry) {
  const order = unitsForIndustry(industry);
  const rank = new Map();
  order.forEach((unit, index) => {
    for (const key of unitIdentityKeys(unit)) rank.set(key, index);
  });
  return [...units].sort((a, b) => {
    const aRank = Math.min(...unitIdentityKeys(a).map((k) => (rank.has(k) ? rank.get(k) : 999)));
    const bRank = Math.min(...unitIdentityKeys(b).map((k) => (rank.has(k) ? rank.get(k) : 999)));
    if (aRank !== bRank) return aRank - bRank;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

async function syncTenantUnits(industry) {
  const wanted = unitsForIndustry(industry);
  const allowed = catalogKeySet(wanted);
  let ensured = 0;
  let deactivated = 0;

  for (const unit of wanted) {
    const existing = await Unit.findOne({
      $or: [
        { name: new RegExp(`^${unit.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        { shortName: new RegExp(`^${unit.shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      ],
    });
    if (!existing) {
      await Unit.create({ ...unit, isActive: true });
      ensured += 1;
    } else if (!existing.isActive) {
      existing.isActive = true;
      existing.name = unit.name;
      existing.shortName = unit.shortName;
      await existing.save();
      ensured += 1;
    }
  }

  const active = await Unit.find({ isActive: true });
  for (const unit of active) {
    if (!isCatalogUnit(unit)) continue; // keep custom
    if (unitIdentityKeys(unit).some((key) => allowed.has(key))) continue;
    unit.isActive = false;
    await unit.save();
    deactivated += 1;
  }

  return { ensured, deactivated };
}

const DEFAULT_ACCOUNTS = [
  { code: '1001', name: 'Cash', type: 'asset', isSystem: true },
  { code: '1002', name: 'Bank', type: 'asset', isSystem: true },
  { code: '1101', name: 'Accounts Receivable', type: 'asset', isSystem: true },
  { code: '1201', name: 'Inventory', type: 'asset', isSystem: true },
  { code: '2001', name: 'Accounts Payable', type: 'liability', isSystem: true },
  { code: '2101', name: 'VAT Payable', type: 'tax', isSystem: true },
  { code: '2102', name: 'VAT Input', type: 'tax', isSystem: true },
  { code: '3001', name: 'Owner Capital', type: 'equity', isSystem: true },
  { code: '4001', name: 'Sales Revenue', type: 'income', isSystem: true },
  { code: '4002', name: 'Service Charge', type: 'income', isSystem: true },
  { code: '5001', name: 'Cost of Goods Sold', type: 'cogs', isSystem: true },
  { code: '6001', name: 'Rent Expense', type: 'expense', isSystem: true },
  { code: '6002', name: 'Salary Expense', type: 'expense', isSystem: true },
];

function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'shop';
  return base;
}

async function uniqueSlug(name) {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await Tenant.findOne({ slug })) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

async function provisionTenant({
  name,
  slug,
  ownerName,
  email,
  password,
  phone,
  status = 'trial',
  plan = 'starter',
  storageGb,
  company,
  industry = 'hardware',
}) {
  const planDefaults = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
  const quota = [10, 30, 50, 100].includes(Number(storageGb)) ? Number(storageGb) : planDefaults.storageGb;
  const shopIndustry = normalizeIndustry(industry);
  const tenant = await Tenant.create({
    name,
    slug: slug || await uniqueSlug(name),
    status,
    plan,
    industry: shopIndustry,
    modules: modulesFor(shopIndustry),
    storageGb: quota,
    trialEndsAt: status === 'trial' ? trialPeriodEnd() : undefined,
  });

  return runWithTenant(tenant._id, async () => {
    const owner = await User.create({
      name: ownerName,
      email,
      password,
      phone,
      role: 'super_admin',
      tenantId: tenant._id,
    });

    await Settings.create({
      companyName: company?.companyName || name,
      address: company?.address || '',
      phone: company?.phone || phone || '',
      email: company?.email || email,
      vatNumber: company?.vatNumber || '',
      vatEnabled: true,
      vatRate: 13,
      serviceChargePercent: 10,
      calendarType: 'bs',
      paymentMethods: [
        { name: 'Cash', enabled: true },
        { name: 'Bank Transfer', enabled: true },
        { name: 'eSewa', enabled: true },
        { name: 'Khalti', enabled: true },
        { name: 'Fonepay', enabled: true },
        { name: 'Credit', enabled: true },
      ],
    });

    await Warehouse.create({
      name: 'Main Warehouse',
      code: 'WH-001',
      address: company?.address || 'Main Store',
      isDefault: true,
      isActive: true,
    });

    await Unit.insertMany(unitsForIndustry(shopIndustry));
    await Account.insertMany(DEFAULT_ACCOUNTS);

    tenant.owner = owner._id;
    await tenant.save();

    return { tenant, owner };
  });
}

module.exports = {
  provisionTenant,
  uniqueSlug,
  slugify,
  DEFAULT_UNITS,
  HARDWARE_UNITS,
  PAINT_UNITS,
  CAFE_UNITS,
  HOTEL_UNITS,
  INDUSTRY_UNITS,
  unitsForIndustry,
  unitAllowedForIndustry,
  sortUnitsForIndustry,
  syncTenantUnits,
  DEFAULT_ACCOUNTS,
};
