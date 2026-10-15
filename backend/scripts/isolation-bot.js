/**
 * Isolation bot: full shop flow (catalog → customer → POS sale → expense),
 * then attack the other shop on every mutating path.
 */
const {
  runner, waitForApi, openShops, closeShops, seedShop,
} = require('./lib/isolationHarness');

async function main() {
  console.log('Isolation bot test\n');
  await waitForApi();
  const t = runner('isolation-bot');
  let shops = [];
  try {
    shops = await openShops('bot');
    const [a, b] = shops;
    await seedShop(a);
    await seedShop(b);
    const secretsA = [a.secret, a.email];
    const secretsB = [b.secret, b.email];

    t.ok('A sale exists', Boolean(a.seed.sale?._id));
    t.ok('B sale exists', Boolean(b.seed.sale?._id));
    t.ok('sales are different', String(a.seed.sale._id) !== String(b.seed.sale._id));

    const aDash = await a.session.get('/sales/dashboard');
    const bDash = await b.session.get('/sales/dashboard');
    t.noSecrets('A dashboard hides B', aDash, secretsB);
    t.noSecrets('B dashboard hides A', bDash, secretsA);

    t.hidden('A cannot convert B sale', await a.session.post(`/sales/${b.seed.sale._id}/convert`, {}), secretsB);
    t.hidden('A cannot complete B sale', await a.session.put(`/sales/${b.seed.sale._id}/complete`, {}), secretsB);
    t.hidden('A cannot return B sale', await a.session.post(`/sales/${b.seed.sale._id}/return`, {
      items: [{ product: b.seed.product._id, quantity: 1 }],
    }), secretsB);
    t.hidden('A cannot update B sale', await a.session.put(`/sales/${b.seed.sale._id}`, { notes: 'intrusion' }), secretsB);
    t.hidden('A cannot delete B sale', await a.session.del(`/sales/${b.seed.sale._id}`), secretsB);

    t.hidden('A cannot pay B customer', await a.session.post(`/customers/${b.seed.customer._id}/payments`, {
      amount: 1, method: 'cash',
    }), secretsB);
    t.hidden('A cannot edit B customer', await a.session.put(`/customers/${b.seed.customer._id}`, {
      name: 'HACKED-CUSTOMER',
    }), ['HACKED-CUSTOMER', ...secretsB]);
    t.hidden('A cannot delete B customer', await a.session.del(`/customers/${b.seed.customer._id}`), secretsB);
    t.hidden('A cannot read B customer ledger', await a.session.get(`/customers/${b.seed.customer._id}/ledger`), secretsB);

    t.hidden('A cannot edit B supplier', await a.session.put(`/suppliers/${b.seed.supplier._id}`, {
      name: 'HACKED-SUPPLIER',
    }), ['HACKED-SUPPLIER']);
    t.hidden('A cannot buy as B supplier', await a.session.post('/suppliers/purchases', {
      supplier: b.seed.supplier._id,
      items: [{ product: b.seed.product._id, quantity: 1, unitPrice: 1, subtotal: 1 }],
      total: 1,
    }), secretsB);

    t.hidden('A cannot edit B electrician', await a.session.put(`/electricians/${b.seed.electrician._id}`, {
      name: 'HACKED-ELEC',
      number1: '9822222222',
    }), ['HACKED-ELEC']);
    t.hidden('A cannot read B commission', await a.session.get(`/electricians/${b.seed.electrician._id}/commission`), secretsB);

    t.hidden('A cannot update B expense', await a.session.put(`/accounting/expenses/${b.seed.expense._id}`, {
      amount: 999, category: 'rent', paymentMethod: 'cash', description: 'intrusion',
    }), secretsB);
    t.hidden('A cannot delete B expense', await a.session.del(`/accounting/expenses/${b.seed.expense._id}`), secretsB);

    t.hidden('A cannot mark B notifications', await a.session.put('/inventory/notifications/ffffffffffffffffffffffff/read', {}), []);

    t.hidden('A cannot change B user', await a.session.put(`/auth/users/${b.owner._id}`, {
      name: 'HACKED-USER',
    }), ['HACKED-USER']);
    const spyEmail = `spy-${Date.now()}@isolation.invalid`;
    const spy = await a.session.post('/auth/register', {
      name: 'Spy',
      email: spyEmail,
      password: 'IsoTest-12345',
      tenantId: String(b.tenant._id),
    });
    t.ok('register with foreign tenantId stays in A or is rejected', spy.status === 201 || spy.status === 400 || spy.status === 403, `HTTP ${spy.status}`);
    const bUsersAfter = await b.session.get('/auth/users');
    t.noSecrets('spy is not a B user', bUsersAfter, [spyEmail]);

    const report = await a.session.post('/accounting/reports/jobs', {
      type: 'sales',
      tenantId: String(b.tenant._id),
    });
    t.ok('report job accepted only for caller shop or rejected', [200, 201, 202, 400, 403].includes(report.status), `HTTP ${report.status}`);
    if (report.data?.data?.jobId || report.data?.jobId) {
      const jobId = report.data.data?.jobId || report.data.jobId;
      const asB = await b.session.get(`/accounting/reports/jobs/${jobId}`);
      t.ok('B cannot read A report job payload with B secrets', asB.status !== 200 || !JSON.stringify(asB.data || {}).includes(a.secret), `HTTP ${asB.status}`);
    }

    const bSaleAfter = await b.session.get(`/sales/${b.seed.sale._id}`);
    t.ok('B sale still intact after attacks', bSaleAfter.status === 200 && bSaleAfter.data?.data?._id, `HTTP ${bSaleAfter.status}`);
    t.ok('B sale was not renamed by A', !JSON.stringify(bSaleAfter.data || {}).includes('intrusion'));

    const bCust = await b.session.get(`/customers/${b.seed.customer._id}`);
    t.ok('B customer name unchanged', bCust.data?.data?.name === `${b.secret}-customer`);

    const settingsA = await a.session.put('/settings', { companyName: `${a.secret}-co` });
    t.ok('A can update own settings', settingsA.status === 200);
    const settingsB = await b.session.get('/settings');
    t.ok('B settings did not take A company name', !JSON.stringify(settingsB.data || {}).includes(`${a.secret}-co`));

    const usersA = await a.session.get('/auth/users');
    const usersB = await b.session.get('/auth/users');
    t.noSecrets('A user list hides B owner', usersA, [b.email]);
    t.noSecrets('B user list hides A owner', usersB, [a.email]);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeShops(shops);
  }
  await t.finish();
}

main();
