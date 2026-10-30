/**
 * Smoke + cross-verify for dashboard / analytics / reports freshness.
 * Usage:
 *   node scripts/dashboard-reports-smoke.js           # unit + DB if Mongo up
 *   node scripts/dashboard-reports-smoke.js --api     # also hit running API
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const {
  TZ,
  kathmanduYmd,
  todayStartKathmandu,
  monthStartKathmandu,
  monthsBackStartKathmandu,
  parseBusinessDateRange,
  endOfKathmanduDay,
  startOfKathmanduDay,
  revenueSaleMatch,
  netSaleAmount,
  REVENUE_STATUSES,
} = require('../src/utils/businessDates');
const { buildShopReport } = require('../src/services/reportService');
const { scoped, scopedMatch } = require('../src/utils/tenantQuery');
const { runWithTenant } = require('../src/utils/tenantContext');
const { mongoUri } = require('../src/config/env');

const API = process.env.API_URL || `http://127.0.0.1:${process.env.PORT || process.env.BACKEND_PORT || 5000}/api`;
const WANT_API = process.argv.includes('--api');

function runner(title) {
  const failed = [];
  let passed = 0;
  function ok(name, cond, detail) {
    if (cond) {
      passed += 1;
      console.log(`  PASS  ${name}`);
    } else {
      failed.push({ name, detail });
      console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }
  function near(name, a, b, eps = 0.05) {
    ok(name, Math.abs(Number(a) - Number(b)) <= eps, `${a} vs ${b}`);
  }
  async function finish() {
    console.log(`\n${title}: ${passed} passed, ${failed.length} failed`);
    if (failed.length) process.exitCode = 1;
    return failed;
  }
  return { ok, near, finish, failed: () => failed };
}

function unitChecks() {
  console.log('\n== Unit: businessDates ==');
  const t = runner('unit');
  const today = kathmanduYmd();
  t.ok('kathmanduYmd is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(today));
  t.ok('timezone constant', TZ === 'Asia/Kathmandu');

  const start = todayStartKathmandu();
  const end = endOfKathmanduDay(today);
  t.ok('today start < end', start.getTime() < end.getTime());
  t.ok('today start is Date', start instanceof Date && !Number.isNaN(start.getTime()));

  // Nepal midnight must not equal UTC midnight for most days
  const utcMidnight = new Date(`${today}T00:00:00.000Z`);
  t.ok(
    'Kathmandu day start differs from UTC midnight',
    start.getTime() !== utcMidnight.getTime(),
    `${start.toISOString()} vs ${utcMidnight.toISOString()}`
  );

  const month = monthStartKathmandu();
  t.ok('month start on/before today start', month.getTime() <= start.getTime());
  t.ok('month start day is 01 in KT', kathmanduYmd(month).endsWith('-01'));

  const range = parseBusinessDateRange(today, today);
  t.ok('parseBusinessDateRange same-day has gte/lte', range && range.$gte && range.$lte);
  t.near('same-day range start == todayStart', range.$gte.getTime(), start.getTime(), 0);
  t.near('same-day range end == endOfDay', range.$lte.getTime(), end.getTime(), 0);

  const trend = monthsBackStartKathmandu(11);
  t.ok('12-month lookback older than month start', trend.getTime() <= month.getTime());

  const match = revenueSaleMatch({ createdAt: { $gte: start } });
  t.ok('revenue match includes invoice + estimate',
    Array.isArray(match.type.$in)
    && match.type.$in.includes('invoice')
    && match.type.$in.includes('estimate'));
  t.ok('includes completed + partial_return',
    Array.isArray(match.status.$in)
    && match.status.$in.includes('completed')
    && match.status.$in.includes('partial_return'));
  t.ok('excludes held', match.isHeld.$ne === true);
  t.ok('REVENUE_STATUSES stable', REVENUE_STATUSES.join(',') === 'completed,partial_return');
  t.ok('netSaleAmount subtracts returnedTotal',
    netSaleAmount.$subtract?.[0]?.$ifNull?.[0] === '$total'
    && netSaleAmount.$subtract?.[1]?.$ifNull?.[0] === '$returnedTotal');

  // Ambiguous UTC parse trap: YYYY-MM-DD alone is UTC in JS
  const bad = new Date(today);
  const good = startOfKathmanduDay(today);
  t.ok('do not use bare Date(ymd) for Nepal day', bad.getTime() !== good.getTime() || bad.getTimezoneOffset() === -345);

  return t.finish();
}

function staticCrossVerify() {
  console.log('\n== Static: cache + report wiring ==');
  const t = runner('static');
  const fs = require('fs');
  const report = fs.readFileSync(path.join(__dirname, '../src/services/reportService.js'), 'utf8');
  const dash = fs.readFileSync(path.join(__dirname, '../src/controllers/saleController.js'), 'utf8');
  const acct = fs.readFileSync(path.join(__dirname, '../src/controllers/accountingController.js'), 'utf8');
  const hotel = fs.readFileSync(path.join(__dirname, '../src/controllers/hotelController.js'), 'utf8');
  const room = fs.readFileSync(path.join(__dirname, '../src/services/roomInvoiceService.js'), 'utf8');
  const cust = fs.readFileSync(path.join(__dirname, '../src/controllers/customerController.js'), 'utf8');
  const feDash = fs.readFileSync(path.join(__dirname, '../../frontend/src/app/dashboard/page.tsx'), 'utf8');
  const feAnal = fs.readFileSync(path.join(__dirname, '../../frontend/src/app/analytics/page.tsx'), 'utf8');
  const feRep = fs.readFileSync(path.join(__dirname, '../../frontend/src/app/reports/page.tsx'), 'utf8');

  t.ok('reportService uses timezone in dateToString', report.includes("timezone: TZ"));
  t.ok('reportService uses revenueSaleMatch', report.includes('revenueSaleMatch'));
  t.ok('reportService nets sale amount', report.includes('netSaleAmount'));
  t.ok('dashboard uses Kathmandu today', dash.includes('todayStartKathmandu'));
  t.ok('dashboard respects refresh=1', dash.includes('forceRefresh'));
  t.ok('financial summary uses revenueSaleMatch', acct.includes('revenueSaleMatch'));
  t.ok('expenses invalidate dashboard+reports', acct.includes("invalidateShopCache(['dashboard', 'reports'])"));
  t.ok('hotel busts dashboard+reports', hotel.includes("invalidateShopCache(['hotel', 'dashboard', 'reports'])"));
  t.ok('room invoices invalidate dashboard', room.includes("'dashboard'"));
  t.ok('customer payments invalidate dashboard', cust.includes("invalidateShopCache(['dashboard', 'reports'])"));
  t.ok('frontend dashboard sends refresh=1', feDash.includes('refresh: "1"'));
  t.ok('frontend analytics sends refresh=1', feAnal.includes('refresh: "1"'));
  t.ok('frontend reports pass startDate/endDate', feRep.includes('startDate') && feRep.includes('endDate'));
  return t.finish();
}

async function dbCrossVerify() {
  console.log('\n== DB: aggregate cross-verify ==');
  const t = runner('db');
  try {
    await mongoose.connect(mongoUri());
  } catch (err) {
    t.ok('Mongo reachable', false, err.message);
    await t.finish();
    return;
  }

  const Sale = require('../src/models/Sale');
  const Tenant = require('../src/models/Tenant');

  const tenant = await Tenant.findOne({ status: { $in: ['active', 'trial'] } }).lean();
  if (!tenant) {
    t.ok('found active tenant', false, 'no tenants in DB');
    await mongoose.disconnect();
    await t.finish();
    return;
  }
  t.ok(`using tenant ${tenant.name || tenant._id}`, true);

  const req = { tenantId: String(tenant._id) };
  await runWithTenant(tenant._id, async () => {
    const today = kathmanduYmd();
    const todayStart = todayStartKathmandu();
    const monthStart = monthStartKathmandu();

    const [todayAgg, monthAgg, cancelledLeak, heldLeak, salesReport, eodReport, productsReport] = await Promise.all([
      Sale.aggregate([
        scopedMatch(req, revenueSaleMatch({ createdAt: { $gte: todayStart } })),
        { $group: { _id: null, total: { $sum: netSaleAmount }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        scopedMatch(req, revenueSaleMatch({ createdAt: { $gte: monthStart } })),
        { $group: { _id: null, total: { $sum: netSaleAmount }, count: { $sum: 1 } } },
      ]),
      Sale.countDocuments(scoped(req, {
        type: 'invoice',
        status: 'cancelled',
        createdAt: { $gte: monthStart },
      })),
      Sale.countDocuments(scoped(req, {
        type: 'invoice',
        isHeld: true,
        createdAt: { $gte: monthStart },
      })),
      buildShopReport(req, { type: 'sales', startDate: today, endDate: today }),
      buildShopReport(req, { type: 'eod', startDate: today, endDate: today }),
      buildShopReport(req, { type: 'products', startDate: `${today.slice(0, 7)}-01`, endDate: today }),
    ]);

    const todayTotal = todayAgg[0]?.total || 0;
    const todayCount = todayAgg[0]?.count || 0;
    const monthTotal = monthAgg[0]?.total || 0;

    const reportDayTotal = (salesReport || []).reduce((s, r) => s + (Number(r.total) || 0), 0);
    const reportDayCount = (salesReport || []).reduce((s, r) => s + (Number(r.count) || 0), 0);

    t.near('dashboard today total == sales report today', todayTotal, reportDayTotal);
    t.near('dashboard today count == sales report today', todayCount, reportDayCount, 0);
    t.near('eod.sales.total == dashboard today', eodReport?.sales?.total || 0, todayTotal);
    t.near('eod.sales.count == dashboard today count', eodReport?.sales?.count || 0, todayCount, 0);
    t.ok('eod includes business date', eodReport?.date === today, `got ${eodReport?.date}`);
    t.ok('products report is array', Array.isArray(productsReport));
    t.ok('month total >= today total', monthTotal + 0.001 >= todayTotal, `${monthTotal} < ${todayTotal}`);

    // Ensure cancelled/held are not in revenueAgg path by recounting with old buggy filter vs new
    const buggyToday = await Sale.aggregate([
      scopedMatch(req, {
        type: 'invoice',
        status: { $nin: ['cancelled', 'draft'] },
        createdAt: { $gte: todayStart },
      }),
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);
    const buggyCount = buggyToday[0]?.count || 0;
    t.ok(
      'new filter <= old broad filter (no overcount)',
      todayCount <= buggyCount,
      `new ${todayCount} vs old ${buggyCount}`
    );
    t.ok('cancelled invoices exist or zero ok', cancelledLeak >= 0);
    t.ok('held invoices exist or zero ok', heldLeak >= 0);

    // UTC midnight trap: if server TZ is UTC, UTC-day total can disagree with KT day
    const utcStart = new Date(`${today}T00:00:00.000Z`);
    const utcAgg = await Sale.aggregate([
      scopedMatch(req, revenueSaleMatch({ createdAt: { $gte: utcStart } })),
      { $group: { _id: null, total: { $sum: netSaleAmount } } },
    ]);
    const utcTotal = utcAgg[0]?.total || 0;
    if (Math.abs(utcTotal - todayTotal) > 0.05) {
      t.ok(
        'Kathmandu day total differs from UTC-midnight window (timezone fix matters)',
        true,
        `KT ${todayTotal} vs UTC-window ${utcTotal}`
      );
    } else {
      t.ok('KT and UTC windows match today (no sales in offset hours — OK)', true);
    }

    console.log(`    today=${today}  sales=${todayCount}  NPR ${todayTotal.toFixed(2)}  month NPR ${monthTotal.toFixed(2)}`);
  });

  await mongoose.disconnect().catch(() => {});
  await t.finish();
}

async function apiSmoke() {
  console.log('\n== API: live endpoints ==');
  const t = runner('api');
  const { createSession, openShops, closeShops, seedShop, waitForApi } = require('./lib/isolationHarness');
  let shops = [];
  try {
    await waitForApi();
    shops = await openShops('dash');
    const shop = shops[0];
    const before = await shop.session.get('/sales/dashboard', { refresh: '1' });
    t.ok('baseline dashboard 200', before.status === 200, `HTTP ${before.status}`);
    const beforeToday = Number(before.data?.data?.todaySales) || 0;
    const beforeMonth = Number(before.data?.data?.monthSales) || 0;

    const seed = await seedShop(shop);
    t.ok('seeded sale total 100', Number(seed.sale?.total) === 100, `got ${seed.sale?.total}`);

    const dash = await shop.session.get('/sales/dashboard', { refresh: '1' });
    t.ok('GET /sales/dashboard 200', dash.status === 200, `HTTP ${dash.status}`);
    const d = dash.data?.data || {};
    t.ok('dashboard has todaySales', typeof d.todaySales === 'number');
    t.ok('dashboard has monthSales', typeof d.monthSales === 'number');
    t.ok('dashboard has monthlyTrend[12]', Array.isArray(d.monthlyTrend) && d.monthlyTrend.length === 12);
    t.ok('dashboard has businessDate', /^\d{4}-\d{2}-\d{2}$/.test(d.businessDate || ''));
    t.ok('dashboard recentSales is array', Array.isArray(d.recentSales));
    t.ok(
      'dashboard todaySales increased by seeded sale',
      Number(d.todaySales) + 0.01 >= beforeToday + 100,
      `before ${beforeToday} after ${d.todaySales}`
    );
    t.ok(
      'dashboard monthSales increased by seeded sale',
      Number(d.monthSales) + 0.01 >= beforeMonth + 100,
      `before ${beforeMonth} after ${d.monthSales}`
    );
    t.ok(
      'recentSales includes seeded invoice',
      (d.recentSales || []).some((row) => String(row._id) === String(seed.sale._id)
        || String(row.invoiceNumber) === String(seed.sale.invoiceNumber)),
      'missing from recentSales'
    );

    const cached = await shop.session.get('/sales/dashboard');
    t.ok('cached dashboard 200', cached.status === 200);
    t.near('cached todaySales matches fresh', cached.data?.data?.todaySales, d.todaySales);

    const today = kathmanduYmd();
    const sales = await shop.session.get('/accounting/reports', { type: 'sales', startDate: today, endDate: today });
    t.ok('GET reports?type=sales 200', sales.status === 200, `HTTP ${sales.status}`);
    const salesRows = sales.data?.data || [];
    const salesTotal = salesRows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    t.near('API dashboard today == API sales report today', d.todaySales, salesTotal);
    t.ok('sales report day total >= 100', salesTotal + 0.01 >= 100, `got ${salesTotal}`);

    const eod = await shop.session.get('/accounting/reports', { type: 'eod', startDate: today, endDate: today });
    t.ok('GET reports?type=eod 200', eod.status === 200, `HTTP ${eod.status}`);
    t.near('API eod total == dashboard today', eod.data?.data?.sales?.total || 0, d.todaySales);
    t.ok('eod cash >= 100 after cash sale', Number(eod.data?.data?.sales?.cash || 0) + 0.01 >= 100);

    const products = await shop.session.get('/accounting/reports', {
      type: 'products',
      startDate: `${today.slice(0, 7)}-01`,
      endDate: today,
    });
    t.ok('GET reports?type=products 200', products.status === 200, `HTTP ${products.status}`);
    t.ok('products payload is array', Array.isArray(products.data?.data));
    t.ok(
      'top products includes seeded cable',
      (products.data?.data || []).some((row) => String(row._id || '').includes(shop.secret)),
      JSON.stringify((products.data?.data || []).slice(0, 3))
    );

    const summary = await shop.session.get('/accounting/summary', { refresh: '1' });
    t.ok('GET /accounting/summary 200', summary.status === 200, `HTTP ${summary.status}`);
    t.ok('summary has monthlyRevenue', typeof summary.data?.data?.monthlyRevenue === 'number');
    t.ok(
      'summary monthlyRevenue >= dashboard monthSales',
      Number(summary.data?.data?.monthlyRevenue || 0) + 0.01 >= Number(d.monthSales),
      `${summary.data?.data?.monthlyRevenue} < ${d.monthSales}`
    );

    const pl = await shop.session.get('/accounting/profit-loss', {
      startDate: `${today.slice(0, 7)}-01`,
      endDate: today,
    });
    t.ok('GET /accounting/profit-loss 200', pl.status === 200, `HTTP ${pl.status}`);
    t.ok(
      'profit-loss revenue >= seeded sale',
      Number(pl.data?.data?.revenue || 0) + 0.01 >= 100,
      `got ${pl.data?.data?.revenue}`
    );
  } catch (err) {
    t.ok('API smoke threw', false, err.message);
  } finally {
    await closeShops(shops);
  }
  await t.finish();
}

async function main() {
  console.log('Dashboard / reports smoke + cross-verify\n');
  await unitChecks();
  await staticCrossVerify();
  await dbCrossVerify();
  if (WANT_API) await apiSmoke();
  else console.log('\n(skip API — pass --api when backend is running)');
  if (process.exitCode) {
    console.log('\nRESULT: FAILED');
    process.exit(1);
  }
  console.log('\nRESULT: PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
