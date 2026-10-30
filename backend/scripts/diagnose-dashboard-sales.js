require('dotenv').config();
const mongoose = require('mongoose');
const { mongoUri } = require('../src/config/env');
const {
  todayStartKathmandu,
  monthStartKathmandu,
  kathmanduYmd,
  netSaleAmount,
  revenueSaleMatch,
} = require('../src/utils/businessDates');
const { runWithTenant } = require('../src/utils/tenantContext');
const { scopedMatch } = require('../src/utils/tenantQuery');

async function main() {
  await mongoose.connect(mongoUri());
  const Sale = require('../src/models/Sale');
  const Tenant = require('../src/models/Tenant');
  const tenants = await Tenant.find({}).select('name status').lean();
  console.log('businessDate', kathmanduYmd());
  console.log('todayStart', todayStartKathmandu().toISOString());
  console.log('monthStart', monthStartKathmandu().toISOString());
  console.log('tenants', tenants.length);

  for (const t of tenants) {
    const tid = t._id;
    await runWithTenant(tid, async () => {
      const req = { tenantId: String(tid) };
      const todayStart = todayStartKathmandu();
      const monthStart = monthStartKathmandu();

      const recent = await Sale.find({ tenantId: tid })
        .sort({ createdAt: -1 })
        .limit(8)
        .select('invoiceNumber total status type isHeld createdAt returnedTotal')
        .lean();

      const [todayAgg, monthAgg, anyToday, monthBreakdown, noTenant] = await Promise.all([
        Sale.aggregate([
          scopedMatch(req, revenueSaleMatch({ createdAt: { $gte: todayStart } })),
          { $group: { _id: null, total: { $sum: netSaleAmount }, count: { $sum: 1 } } },
        ]),
        Sale.aggregate([
          scopedMatch(req, revenueSaleMatch({ createdAt: { $gte: monthStart } })),
          { $group: { _id: null, total: { $sum: netSaleAmount }, count: { $sum: 1 } } },
        ]),
        Sale.countDocuments({ tenantId: tid, createdAt: { $gte: todayStart } }),
        Sale.aggregate([
          { $match: { tenantId: tid, createdAt: { $gte: monthStart } } },
          {
            $group: {
              _id: { status: '$status', type: '$type', isHeld: '$isHeld' },
              n: { $sum: 1 },
              total: { $sum: '$total' },
            },
          },
        ]),
        Sale.countDocuments({
          $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
          createdAt: { $gte: monthStart },
        }),
      ]);

      console.log('\n===', t.name, String(tid), t.status);
      console.log('dashboard today', todayAgg[0] || { total: 0, count: 0 });
      console.log('dashboard month', monthAgg[0] || { total: 0, count: 0 });
      console.log('any docs created today', anyToday);
      console.log('month breakdown', monthBreakdown);
      console.log('sales missing tenantId this month (global)', noTenant);
      console.log(
        'recent',
        recent.map((r) => ({
          inv: r.invoiceNumber,
          total: r.total,
          status: r.status,
          type: r.type,
          held: r.isHeld,
          at: r.createdAt,
        }))
      );
    });
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
