require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Product = require('../src/models/Product');
const { Account } = require('../src/models/Account');

const KEEP = new Set([
  'products',
  'categories',
  'brands',
  'units',
  'unitconversions',
  'warehouses',
  'users',
  'roles',
  'settings',
  'accounts',
  'tenants',
]);

(async () => {
  if (process.env.WIPE_EXCEPT_INVENTORY !== 'YES') {
    console.error('Refusing to run. Set WIPE_EXCEPT_INVENTORY=YES to delete all non-inventory data.');
    process.exit(1);
  }

  await connectDB();
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  console.log(`Database: ${db.databaseName}`);
  console.log('Keeping inventory/setup collections:', [...KEEP].join(', '));

  for (const { name } of collections) {
    const count = await db.collection(name).countDocuments();
    if (KEEP.has(name)) {
      console.log(`KEEP  ${name} (${count})`);
      continue;
    }
    await db.collection(name).deleteMany({});
    console.log(`WIPED ${name} (${count} documents)`);
  }

  const supplierClear = await Product.updateMany(
    { supplier: { $exists: true } },
    { $unset: { supplier: 1 } }
  );
  const accountReset = await Account.updateMany({}, { $set: { balance: 0 } });
  console.log(`Cleared supplier refs on ${supplierClear.modifiedCount} products`);
  console.log(`Reset ${accountReset.modifiedCount} account balances to 0`);

  const kept = await Product.countDocuments();
  console.log(`Done. Products remaining: ${kept}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
