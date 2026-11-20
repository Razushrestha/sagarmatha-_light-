require('dotenv').config();
const mongoose = require('mongoose');
const { mongoUri } = require('../src/config/env');
const Tenant = require('../src/models/Tenant');
const { Unit } = require('../src/models/Unit');
const { runWithTenant } = require('../src/utils/tenantContext');
const { CAFE_UNITS } = require('../src/services/tenantService');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

(async () => {
  await mongoose.connect(mongoUri());
  const shops = await Tenant.find({ industry: { $in: ['cafe', 'hotel'] } }).select('name industry');
  for (const shop of shops) {
    let added = 0;
    await runWithTenant(shop._id, async () => {
      for (const unit of CAFE_UNITS) {
        const exists = await Unit.findOne({
          $or: [
            { name: new RegExp(`^${escapeRegex(unit.name)}$`, 'i') },
            { shortName: new RegExp(`^${escapeRegex(unit.shortName)}$`, 'i') },
          ],
        });
        if (!exists) {
          await Unit.create(unit);
          added += 1;
        } else if (!exists.isActive) {
          exists.isActive = true;
          await exists.save();
          added += 1;
        }
      }
    });
    console.log(`${shop.name} (${shop.industry}): added/reactivated ${added}`);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
