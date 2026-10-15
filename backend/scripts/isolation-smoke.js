/**
 * Production isolation smoke: every shop list/detail API, plus platform/auth walls.
 * Requires a running API (npm run dev in backend).
 */
const jwt = require('jsonwebtoken');
const {
  API, runner, waitForApi, openShops, closeShops, seedShop, createSession, ids,
} = require('./lib/isolationHarness');

const LIST_PATHS = [
  '/products',
  '/customers',
  '/sales',
  '/sales/dashboard',
  '/sales/held',
  '/sales/returns',
  '/suppliers',
  '/suppliers/purchases',
  '/suppliers/payments',
  '/suppliers/returns',
  '/electricians',
  '/categories',
  '/brands',
  '/units',
  '/warehouses',
  '/stock-movements',
  '/settings',
  '/notifications',
  '/accounting/accounts',
  '/accounting/journal',
  '/accounting/summary',
  '/accounting/profit-loss',
  '/accounting/balance-sheet',
  '/accounting/expenses',
  '/accounting/reports',
  '/auth/users',
  '/auth/me',
  '/inventory/audit-logs',
];

async function main() {
  console.log('Isolation smoke test\n');
  await waitForApi();
  const t = runner('isolation-smoke');
  let shops = [];
  try {
    shops = await openShops('smoke');
    const [a, b] = shops;
    await seedShop(a);
    await seedShop(b);
    const secretsA = [a.secret, a.email, String(a.tenant._id)];
    const secretsB = [b.secret, b.email, String(b.tenant._id)];

    t.ok('alpha login is shop A', a.me.tenantId === String(a.tenant._id) && a.me.email === a.email);
    t.ok('bravo login is shop B', b.me.tenantId === String(b.tenant._id) && b.me.email === b.email);
    t.ok('shops have different tenant ids', String(a.tenant._id) !== String(b.tenant._id));

    const anon = createSession(API);
    const unauth = await anon.get('/products');
    t.ok('unauthenticated products blocked', unauth.status === 401, `HTTP ${unauth.status}`);

    const platform = await a.session.get('/platform/tenants');
    t.ok('shop user cannot list platform tenants', platform.status === 403, `HTTP ${platform.status}`);

    for (const path of LIST_PATHS) {
      const resA = await a.session.get(path);
      const resB = await b.session.get(path);
      t.noSecrets(`A GET ${path} hides B`, resA, secretsB);
      t.noSecrets(`B GET ${path} hides A`, resB, secretsA);
    }

    const searchA = await a.session.get('/search', { q: b.secret });
    t.noSecrets('A global search cannot find B secret', searchA, [b.secret]);
    const searchB = await b.session.get('/search', { q: a.secret });
    t.noSecrets('B global search cannot find A secret', searchB, [a.secret]);

    const crossGets = [
      ['/products', a.seed.product._id, b.seed.product._id],
      ['/customers', a.seed.customer._id, b.seed.customer._id],
      ['/sales', a.seed.sale._id, b.seed.sale._id],
      ['/suppliers', a.seed.supplier?._id, b.seed.supplier?._id],
      ['/electricians', a.seed.electrician?._id, b.seed.electrician?._id],
      ['/accounting/expenses', a.seed.expense?._id, b.seed.expense?._id],
      ['/auth/users', a.owner._id, b.owner._id],
    ];
    for (const [base, idA, idB] of crossGets) {
      if (!idA || !idB) continue;
      t.hidden(`A cannot GET ${base}/B`, await a.session.get(`${base}/${idB}`), secretsB);
      t.hidden(`B cannot GET ${base}/A`, await b.session.get(`${base}/${idA}`), secretsA);
    }

    t.hidden('A cannot PUT B product', await a.session.put(`/products/${b.seed.product._id}`, {
      name: 'HACKED-BY-A',
      sellingPrice: 1,
      tenantId: String(a.tenant._id),
    }), ['HACKED-BY-A', ...secretsB]);
    const stillB = await b.session.get(`/products/${b.seed.product._id}`);
    t.ok('B product name unchanged after A PUT', stillB.status === 200 && stillB.data?.data?.name === `${b.secret}-cable`);

    t.hidden('A cannot DELETE B product', await a.session.del(`/products/${b.seed.product._id}`), secretsB);
    const stillThere = await b.session.get(`/products/${b.seed.product._id}`);
    t.ok('B product still exists after A DELETE', stillThere.status === 200 && stillThere.data?.data?.isActive !== false);

    const stolen = await a.session.post('/products', {
      name: `${a.secret}-stolen-into-B`,
      sellingPrice: 9,
      tenantId: String(b.tenant._id),
      warehouse: a.seed.warehouse,
    });
    t.ok('create with foreign tenantId still 201 in caller shop', stolen.status === 201, `HTTP ${stolen.status}`);
    if (stolen.status === 201) {
      t.ok(
        'created product stays in A',
        String(stolen.data.data.tenantId) === String(a.tenant._id),
        `tenantId=${stolen.data.data.tenantId}`
      );
      const bList = await b.session.get('/products');
      t.noSecrets('B product list does not include A steal-create', bList, [`${a.secret}-stolen-into-B`]);
    }

    const forged = jwt.sign(
      { id: a.owner._id, tenantId: b.tenant._id, role: 'super_admin' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    const forgedRes = await createSession(API).request({
      method: 'GET',
      path: '/products',
      headers: { Authorization: `Bearer ${forged}` },
    });
    t.ok('JWT with swapped tenantId is rejected', forgedRes.status === 401, `HTTP ${forgedRes.status}`);
    t.ok('forged JWT body has no B secret', !String(forgedRes.raw || '').includes(b.secret));

    const aProducts = ids((await a.session.get('/products')).data?.data);
    const bProducts = ids((await b.session.get('/products')).data?.data);
    t.ok('product id sets are disjoint', aProducts.every((id) => !bProducts.includes(id)));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeShops(shops);
  }
  await t.finish();
}

main();
