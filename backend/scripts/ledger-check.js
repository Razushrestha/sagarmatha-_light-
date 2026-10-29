/**
 * VAT / ledger checks for mix, waste, service charge, and modifiers.
 */
const {
  runner, waitForApi, openShops, closeShops,
} = require('./lib/isolationHarness');
const { seedPaintCatalog, seedCafeCatalog } = require('./lib/sampleCatalogs');
const { cafeBillTotals } = require('../src/utils/cafeBill');

function accountCredit(journal, code) {
  const rows = journal.data?.data || [];
  let sum = 0;
  for (const entry of rows) {
    for (const line of entry.entries || []) {
      if (String(line.account?.code) === code) sum += Number(line.credit) || 0;
    }
  }
  return Math.round(sum * 100) / 100;
}

async function main() {
  console.log('VAT / ledger checks\n');
  await waitForApi();
  const t = runner('ledger-check');
  let shops = [];
  try {
    shops = await openShops('led', ['paint', 'cafe']);
    const [paint, cafe] = shops;
    paint.catalog = await seedPaintCatalog(paint.session, { secret: paint.secret, key: 'p' });
    cafe.catalog = await seedCafeCatalog(cafe.session, { secret: cafe.secret, key: 'c' });

    const beansBefore = (await cafe.session.get(`/products/${cafe.catalog.beans._id}`)).data.data.currentStock;
    const milkBefore = (await cafe.session.get(`/products/${cafe.catalog.milk._id}`)).data.data.currentStock;
    const oatBefore = (await cafe.session.get(`/products/${cafe.catalog.oat._id}`)).data.data.currentStock;
    const colorantBefore = (await paint.session.get(`/products/${paint.catalog.colorant._id}`)).data.data.currentStock;
    const baseBefore = (await paint.session.get(`/products/${paint.catalog.base._id}`)).data.data.currentStock;

    const mix = await paint.session.post('/paint/mix', {
      shadeId: paint.catalog.shade._id,
      packLitres: 4,
      warehouseId: paint.catalog.warehouse,
    });
    t.ok('mix succeeds', mix.status === 201, JSON.stringify(mix.data));
    const colorantAfter = (await paint.session.get(`/products/${paint.catalog.colorant._id}`)).data.data.currentStock;
    const baseAfter = (await paint.session.get(`/products/${paint.catalog.base._id}`)).data.data.currentStock;
    t.ok('mix deducts 1 base tin', baseAfter === baseBefore - 1, `${baseBefore} → ${baseAfter}`);
    t.ok('mix deducts 40ml colorant', colorantAfter === colorantBefore - 40, `${colorantBefore} → ${colorantAfter}`);

    const opened = await cafe.session.post('/shifts/open', { openingFloat: 1000 });
    t.ok('shift opened', opened.status === 201, JSON.stringify(opened.data));

    const food = 280;
    const expected = cafeBillTotals({ food, serviceChargePercent: 10, vatRate: 13, includeVat: true, serviceType: 'dine_in' });
    const folioId = '64aaaaaaaaaaaaaaaaaaaaaa';
    const sale = await cafe.session.post('/sales', {
      type: 'invoice',
      serviceType: 'dine_in',
      folioId,
      warehouse: cafe.catalog.warehouse,
      items: [{
        product: cafe.catalog.latte._id,
        productName: cafe.catalog.latte.name,
        quantity: 1,
        unitPrice: food,
        discount: 0,
        subtotal: food,
        modifiers: [
          { group: 'Size', option: 'Regular' },
          { group: 'Milk', option: 'Oat' },
          { group: 'Extra shot', option: 'Extra shot' },
        ],
      }],
      subtotal: food,
      total: food,
      amountPaid: expected.total,
      amountDue: 0,
      payments: [{ method: 'cash', amount: expected.total }],
      isVatBill: true,
    });
    t.ok('dine-in sale saved', sale.status === 201, JSON.stringify(sale.data));
    const doc = sale.data?.data || {};
    t.ok('cafe sale keeps unused folioId', String(doc.folioId) === folioId, `${doc.folioId}`);
    t.ok('SC amount matches 10% food', Number(doc.serviceChargeAmount) === expected.serviceCharge, `${doc.serviceChargeAmount}`);
    t.ok('VAT on food+SC', Number(doc.vatAmount) === expected.vatAmount, `${doc.vatAmount}`);
    t.ok('total includes SC+VAT', Number(doc.total) === expected.total, `${doc.total}`);

    const beansAfter = (await cafe.session.get(`/products/${cafe.catalog.beans._id}`)).data.data.currentStock;
    const milkAfter = (await cafe.session.get(`/products/${cafe.catalog.milk._id}`)).data.data.currentStock;
    const oatAfter = (await cafe.session.get(`/products/${cafe.catalog.oat._id}`)).data.data.currentStock;
    t.ok('extra shot deducts 36g beans', beansAfter === beansBefore - 36, `${beansBefore} → ${beansAfter}`);
    t.ok('oat modifier deducts oat not dairy', oatAfter === oatBefore - 200 && milkAfter === milkBefore, `oat ${oatBefore}→${oatAfter} milk ${milkBefore}→${milkAfter}`);

    const journal = await cafe.session.get('/accounting/journal');
    t.ok('journal lists cafe sale', journal.status === 200);
    const cafeEntry = (journal.data?.data || []).find((row) => String(row.referenceId) === String(doc._id) || row.reference === doc.invoiceNumber);
    t.ok('journal source is cafe_ticket', cafeEntry?.source === 'cafe_ticket', JSON.stringify(cafeEntry));
    t.ok('journal keeps unused folioId', String(cafeEntry?.folioId || '') === folioId, JSON.stringify(cafeEntry));
    t.ok('4002 service charge credited', accountCredit(journal, '4002') >= expected.serviceCharge, `credit=${accountCredit(journal, '4002')}`);
    t.ok('2101 VAT credited', accountCredit(journal, '2101') >= expected.vatAmount, `credit=${accountCredit(journal, '2101')}`);

    const takeaway = await cafe.session.post('/sales', {
      type: 'invoice',
      serviceType: 'takeaway',
      warehouse: cafe.catalog.warehouse,
      items: [{
        product: cafe.catalog.latte._id,
        productName: cafe.catalog.latte.name,
        quantity: 1,
        unitPrice: food,
        discount: 0,
        subtotal: food,
      }],
      subtotal: food,
      total: food,
      amountPaid: 316.4,
      amountDue: 0,
      payments: [{ method: 'cash', amount: 316.4 }],
      isVatBill: true,
    });
    t.ok('takeaway has zero SC', takeaway.status === 201 && Number(takeaway.data.data.serviceChargeAmount) === 0, JSON.stringify(takeaway.data));

    const waste = await cafe.session.post('/cafe/waste', {
      productId: cafe.catalog.latte._id,
      quantity: 1,
      reason: 'spilled shot',
      warehouseId: cafe.catalog.warehouse,
    });
    t.ok('waste books ingredient stock', waste.status === 201, JSON.stringify(waste.data));
    const beansWaste = (await cafe.session.get(`/products/${cafe.catalog.beans._id}`)).data.data.currentStock;
    t.ok('waste deducts recipe beans', beansWaste < beansAfter, `${beansAfter} → ${beansWaste}`);

    const movements = await cafe.session.get('/stock-movements');
    const types = JSON.stringify(movements.data || '');
    t.ok('waste movement recorded', types.includes('waste'), types.slice(0, 200));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeShops(shops);
  }
  await t.finish();
}

main();
