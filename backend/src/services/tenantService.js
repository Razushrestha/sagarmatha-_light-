const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { Warehouse } = require('../models/Warehouse');
const { Unit } = require('../models/Unit');
const { Account } = require('../models/Account');
const { runWithTenant } = require('../utils/tenantContext');
const { trialPeriodEnd, PLAN_LIMITS } = require('./planService');

const DEFAULT_UNITS = [
  { name: 'Piece', shortName: 'Pcs' },
  { name: 'Meter', shortName: 'M' },
  { name: 'Feet', shortName: 'Ft' },
  { name: 'Box', shortName: 'Box' },
  { name: 'Roll', shortName: 'Roll' },
  { name: 'Kilogram', shortName: 'Kg' },
  { name: 'Set', shortName: 'Set' },
  { name: 'Pair', shortName: 'Pair' },
];

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
}) {
  const planDefaults = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
  const quota = [10, 30, 50, 100].includes(Number(storageGb)) ? Number(storageGb) : planDefaults.storageGb;
  const tenant = await Tenant.create({
    name,
    slug: slug || await uniqueSlug(name),
    status,
    plan,
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
      vatRate: 13,
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

    await Unit.insertMany(DEFAULT_UNITS);
    await Account.insertMany(DEFAULT_ACCOUNTS);

    tenant.owner = owner._id;
    await tenant.save();

    return { tenant, owner };
  });
}

module.exports = { provisionTenant, uniqueSlug, slugify, DEFAULT_UNITS, DEFAULT_ACCOUNTS };
