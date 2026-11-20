require('dotenv').config();
const mongoose = require('mongoose');
const { mongoUri } = require('../src/config/env');
const Tenant = require('../src/models/Tenant');
const Customer = require('../src/models/Customer');
const CustomerPayment = require('../src/models/CustomerPayment');
const Sale = require('../src/models/Sale');
const User = require('../src/models/User');
const { runWithTenant } = require('../src/utils/tenantContext');
const {
  reconcileCustomerOutstanding,
  netDebtAndCredit,
  creditFromBuckets,
} = require('../src/utils/salePayments');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('PASS', msg);
}

async function main() {
  const n = netDebtAndCredit(109217.4, 10000);
  assert(Math.abs(n.outstanding - 99217.4) < 0.001 && n.creditBalance === 0, 'unit: credit nets debt');
  assert(creditFromBuckets(0, 10000, { payment: 10000, refund: 0, store_credit: 0 }) === 0, 'unit: no double-count');

  await mongoose.connect(mongoUri());
  const tenant = (await Tenant.findOne({ industry: 'hardware' })) || (await Tenant.findOne());
  const admin = await User.findOne({ tenantId: tenant._id });
  assert(Boolean(tenant && admin), `tenant+user ${tenant?.name}`);

  await runWithTenant(tenant._id, async () => {
    const dual = await Customer.find({
      isActive: true,
      outstanding: { $gt: 0 },
      creditBalance: { $gt: 0 },
    }).limit(50);
    for (const c of dual) {
      const before = { d: c.outstanding, c: c.creditBalance };
      await reconcileCustomerOutstanding(Customer, Sale, CustomerPayment, c._id);
      const after = await Customer.findById(c._id).lean();
      console.log('HEAL', c.name, before, '->', { d: after.outstanding, c: after.creditBalance });
      assert(!(after.outstanding > 0.01 && after.creditBalance > 0.01), `healed no dual balances for ${c.name}`);
    }
    if (!dual.length) console.log('HEAL none needed');
  });
  await mongoose.disconnect();

  const base = 'http://127.0.0.1:5016/api';
  const emails = [
    { email: 'admin@nepatronix.com', password: 'admin123' },
    { email: 'cafe@demo.local', password: 'Cafe@12345' },
  ];
  let cookie = null;
  let who = null;
  for (const cred of emails) {
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cred),
    });
    const j = await r.json();
    if (j.success) {
      cookie = (r.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ');
      who = j.data;
      break;
    }
  }
  assert(Boolean(cookie), 'API login');
  console.log('logged in as', who.email, who.tenantName);

  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const create = await fetch(`${base}/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Verify Debtor Pay',
      phone: '9811111199',
      openingDebt: 50000,
      openingCredit: 0,
    }),
  });
  const created = await create.json();
  assert(created.success, `create customer ${JSON.stringify(created)}`);
  const id = created.data._id;
  assert(
    Math.abs((created.data.debtAmount || created.data.outstanding) - 50000) < 0.01,
    'opening debt 50000'
  );

  await mongoose.connect(mongoUri());
  await runWithTenant(who.tenantId, async () => {
    await CustomerPayment.create({
      customer: id,
      amount: 8000,
      type: 'store_credit',
      method: 'credit_note',
      reference: 'VERIFY-CR',
      createdBy: who._id,
    });
  });
  await mongoose.disconnect();

  const debtors1 = await (await fetch(`${base}/customers/debtors`, { headers })).json();
  const row1 = (debtors1.data || []).find((d) => String(d._id) === String(id));
  assert(Boolean(row1), 'appears in debtors');
  assert(Math.abs(row1.debtAmount - 42000) < 0.02, `debtors list netted credit: ${row1.debtAmount}`);
  assert(!(row1.creditAmount > 0.01), `no side credit on debtors row: ${row1.creditAmount}`);

  const pay = await fetch(`${base}/customers/${id}/payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount: 12000, method: 'cash', reference: 'VERIFY-PAY' }),
  });
  const payBody = await pay.json();
  assert(pay.ok && payBody.success, `collect payment ${JSON.stringify(payBody)}`);
  const afterPay = payBody.customer;
  assert(
    Math.abs((afterPay.debtAmount || afterPay.outstanding) - 30000) < 0.02,
    `debt after pay 30000 got ${afterPay.debtAmount || afterPay.outstanding}`
  );
  assert(!((afterPay.creditAmount || afterPay.creditBalance) > 0.01), 'credit still 0 after pay');

  const pay2 = await fetch(`${base}/customers/${id}/payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount: 30000, method: 'cash' }),
  });
  const pay2Body = await pay2.json();
  assert(pay2.ok && pay2Body.success, 'pay full');
  assert(
    Math.abs((pay2Body.customer.debtAmount || pay2Body.customer.outstanding || 0)) < 0.02,
    'fully cleared'
  );

  const debtors2 = await (await fetch(`${base}/customers/debtors`, { headers })).json();
  assert(!(debtors2.data || []).some((d) => String(d._id) === String(id)), 'removed from debtors after clear');

  await mongoose.connect(mongoUri());
  await runWithTenant(who.tenantId, async () => {
    await CustomerPayment.deleteMany({ customer: id });
    await Customer.deleteOne({ _id: id });
  });
  await mongoose.disconnect();

  console.log('ALL VERIFY PASSED');
}

main().catch((err) => {
  console.error('VERIFY FAIL', err);
  process.exit(1);
});
