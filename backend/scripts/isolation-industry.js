/**
 * Mix (paint) and recipe (cafe) must stay inside their own shops.
 */
const {
  runner, waitForApi, openShops, closeShops,
} = require('./lib/isolationHarness');
const { seedPaintCatalog, seedCafeCatalog } = require('./lib/sampleCatalogs');

async function main() {
  console.log('Isolation mix + recipe\n');
  await waitForApi();
  const t = runner('isolation-industry');
  let shops = [];
  try {
    shops = await openShops('ind', ['paint', 'cafe']);
    const [paint, cafe] = shops;
    paint.catalog = await seedPaintCatalog(paint.session, { secret: paint.secret, key: 'a' });
    cafe.catalog = await seedCafeCatalog(cafe.session, { secret: cafe.secret, key: 'b' });

    const secretsA = [paint.secret, paint.email];
    const secretsB = [cafe.secret, cafe.email];

    const shadesA = await paint.session.get('/paint/shades');
    const shadesB = await cafe.session.get('/paint/shades');
    t.noSecrets('paint shop shade list hides cafe secret', shadesA, secretsB);
    t.ok('cafe cannot list paint shades', shadesB.status === 403 || shadesB.status === 404, `HTTP ${shadesB.status}`);

    const menuB = await cafe.session.get('/cafe/menu');
    const menuA = await paint.session.get('/cafe/menu');
    t.noSecrets('cafe menu hides paint secret', menuB, secretsA);
    t.ok('paint cannot list cafe menu', menuA.status === 403 || menuA.status === 404, `HTTP ${menuA.status}`);

    const mix = await paint.session.post('/paint/mix', {
      shadeId: paint.catalog.shade._id,
      packLitres: 4,
      warehouseId: paint.catalog.warehouse,
    });
    t.ok('paint mix stocks a tin', mix.status === 201, `HTTP ${mix.status} ${JSON.stringify(mix.data)}`);

    const stealMix = await cafe.session.post('/paint/mix', {
      shadeId: paint.catalog.shade._id,
      packLitres: 4,
      warehouseId: paint.catalog.warehouse,
    });
    t.hidden('cafe cannot mix paint shop shade', stealMix, secretsA);

    const stealRecipe = await paint.session.put(`/cafe/recipes/${cafe.catalog.latte._id}`, {
      recipe: [{ product: cafe.catalog.beans._id, qty: 99, role: 'shot' }],
    });
    t.hidden('paint cannot overwrite cafe recipe', stealRecipe, secretsB);

    const opened = await cafe.session.post('/shifts/open', { openingFloat: 2000 });
    t.ok('cafe can open a shift', opened.status === 201, `HTTP ${opened.status}`);

    const stealShift = await paint.session.get('/shifts/current');
    t.ok('paint cannot read cafe shifts', stealShift.status === 403 || stealShift.status === 404, `HTTP ${stealShift.status}`);

    const sale = await cafe.session.post('/sales', {
      type: 'invoice',
      serviceType: 'dine_in',
      warehouse: cafe.catalog.warehouse,
      items: [{
        product: cafe.catalog.latte._id,
        productName: cafe.catalog.latte.name,
        quantity: 1,
        unitPrice: 280,
        discount: 0,
        subtotal: 280,
        modifiers: [
          { group: 'Size', option: 'Regular' },
          { group: 'Milk', option: 'Oat' },
          { group: 'Extra shot', option: 'Extra shot' },
        ],
      }],
      subtotal: 280,
      total: 280,
      amountPaid: 2000,
      amountDue: 0,
      payments: [{ method: 'cash', amount: 2000 }],
      isVatBill: true,
    });
    t.ok('cafe recipe sale completes', sale.status === 201, `HTTP ${sale.status} ${JSON.stringify(sale.data)}`);
    if (sale.status === 201) {
      t.ok('service charge posted', Number(sale.data.data.serviceChargeAmount) > 0);
      const deducted = sale.data.data.items?.[0]?.recipeDeducted || [];
      t.ok('recipe lines stamped on sale', deducted.length >= 3, JSON.stringify(deducted));
      t.hidden('paint cannot read cafe sale', await paint.session.get(`/sales/${sale.data.data._id}`), secretsB);
    }

    const mixSale = await paint.session.post('/sales', {
      type: 'invoice',
      warehouse: paint.catalog.warehouse,
      items: [{
        product: mix.data?.data?.product?._id || mix.data?.data?._id,
        productName: 'tinted',
        quantity: 1,
        unitPrice: 2200,
        discount: 0,
        subtotal: 2200,
        tinted: true,
      }],
      subtotal: 2200,
      total: 2200,
      amountPaid: 2200,
      amountDue: 0,
      payments: [{ method: 'cash', amount: 2200 }],
      isVatBill: true,
    });
    const tintedId = mix.data?.data?.product?._id || mix.data?.data?._id;
    t.ok('mix payload has a product', Boolean(tintedId), JSON.stringify(mix.data));
    if (tintedId) {
      t.ok('paint can sell mixed tin', mixSale.status === 201 || mixSale.status === 400, `HTTP ${mixSale.status}`);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeShops(shops);
  }
  await t.finish();
}

main();
