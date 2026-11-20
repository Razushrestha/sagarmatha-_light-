require('dotenv').config();
const mongoose = require('mongoose');
const { mongoUri } = require('../src/config/env');
const Tenant = require('../src/models/Tenant');
const { runWithTenant } = require('../src/utils/tenantContext');
const { syncTenantUnits } = require('../src/services/tenantService');

(async () => {
  await mongoose.connect(mongoUri());
  const shops = await Tenant.find().select('name industry');
  for (const shop of shops) {
    const result = await runWithTenant(shop._id, () => syncTenantUnits(shop.industry || 'hardware'));
    console.log(
      `${shop.name} (${shop.industry || 'hardware'}): ensured ${result.ensured}, deactivated ${result.deactivated}`
    );
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
