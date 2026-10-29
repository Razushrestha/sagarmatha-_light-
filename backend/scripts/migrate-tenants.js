require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Tenant = require('../src/models/Tenant');
const User = require('../src/models/User');
const company = require('../src/config/company');
const { runWithTenant } = require('../src/utils/tenantContext');

const SHOP_COLLECTIONS = [
  'categories',
  'brands',
  'units',
  'unitconversions',
  'warehouses',
  'stockmovements',
  'products',
  'customers',
  'suppliers',
  'settings',
  'accounts',
  'journalentries',
  'electricians',
  'notifications',
  'auditlogs',
  'purchasereturns',
  'sales',
  'purchases',
  'expenses',
  'salereturns',
  'supplierpayments',
  'customerpayments',
  'roles',
  'paintshades',
];

const OLD_UNIQUE = [
  ['products', 'sku_1'],
  ['sales', 'invoiceNumber_1'],
  ['purchases', 'invoiceNumber_1'],
  ['brands', 'name_1'],
  ['roles', 'name_1'],
  ['accounts', 'code_1'],
  ['warehouses', 'code_1'],
  ['salereturns', 'returnNumber_1'],
  ['purchasereturns', 'returnNumber_1'],
  ['supplierpayments', 'paymentNumber_1'],
];

async function dropIfExists(collection, indexName) {
  try {
    await collection.dropIndex(indexName);
    console.log(`Dropped index ${collection.collectionName}.${indexName}`);
  } catch (err) {
    if (err.code !== 27 && err.codeName !== 'IndexNotFound') {
      console.warn(`Could not drop ${collection.collectionName}.${indexName}: ${err.message}`);
    }
  }
}

const migrate = async () => {
  await connectDB();
  const db = mongoose.connection.db;

  let tenant = await Tenant.findOne({ slug: 'sagarmatha' });
  if (!tenant) {
    tenant = await Tenant.create({
      name: company.companyName,
      slug: 'sagarmatha',
      status: 'active',
      plan: 'business',
    });
    console.log('Created tenant', tenant.slug);
  }

  const names = (await db.listCollections().toArray()).map((c) => c.name);

  for (const name of names) {
    if (!SHOP_COLLECTIONS.includes(name) && !SHOP_COLLECTIONS.includes(name.toLowerCase())) continue;
    const col = db.collection(name);
    const result = await col.updateMany(
      { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] },
      { $set: { tenantId: tenant._id } }
    );
    if (result.modifiedCount) {
      console.log(`Tagged ${result.modifiedCount} docs in ${name}`);
    }
  }

  const usersCol = names.includes('users') ? db.collection('users') : null;
  if (usersCol) {
    await usersCol.updateMany(
      { role: { $ne: 'platform_admin' }, $or: [{ tenantId: { $exists: false } }, { tenantId: null }] },
      { $set: { tenantId: tenant._id } }
    );
    await usersCol.updateMany({ role: 'platform_admin' }, { $unset: { tenantId: 1 } });
  }

  const shopAdmin = await User.findOne({ email: 'admin@nepatronix.com', role: { $ne: 'platform_admin' } });
  if (shopAdmin && !tenant.owner) {
    tenant.owner = shopAdmin._id;
    await tenant.save();
  }

  const platformEmail = (process.env.PLATFORM_ADMIN_EMAIL || 'platform@nepatronix.com').toLowerCase();
  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'admin123';
  const existingPlatform = await User.findOne({ role: 'platform_admin' });
  if (!existingPlatform) {
    await User.create({
      name: 'Nepatronix Platform',
      email: platformEmail,
      password: platformPassword,
      role: 'platform_admin',
      mustChangePassword: true,
    });
    console.log(`Created platform admin ${platformEmail} (must change password)`);
  } else {
    await User.updateMany(
      { role: 'platform_admin', mustChangePassword: { $exists: false } },
      { $set: { mustChangePassword: true } }
    );
  }

  for (const [collName, indexName] of OLD_UNIQUE) {
    const match = names.find((n) => n.toLowerCase() === collName);
    if (!match) continue;
    await dropIfExists(db.collection(match), indexName);
  }

  const { modulesFor } = require('../src/config/industry');
  const tenants = await Tenant.find();
  for (const shop of tenants) {
    if (!shop.industry) shop.industry = shop.slug === 'sagarmatha' ? 'hardware' : (shop.industry || 'hardware');
    shop.industry = shop.industry || 'hardware';
    shop.modules = modulesFor(shop.industry, shop.modules);
    await shop.save();
  }
  console.log(`Set industry/modules on ${tenants.length} shop(s)`);

  const { Unit } = require('../src/models/Unit');
  const extraUnits = [
    { name: 'Gram', shortName: 'g' },
    { name: 'Litre', shortName: 'L' },
    { name: 'Millilitre', shortName: 'ml' },
  ];
  for (const shop of tenants) {
    await runWithTenant(shop._id, async () => {
      for (const unit of extraUnits) {
        const exists = await Unit.findOne({ shortName: unit.shortName });
        if (!exists) await Unit.create(unit);
      }
    });
  }

  console.log('\nTenant migration complete. Shop slug: sagarmatha');
  process.exit(0);
};

migrate().catch((err) => {
  console.error('Migrate error:', err);
  process.exit(1);
});
