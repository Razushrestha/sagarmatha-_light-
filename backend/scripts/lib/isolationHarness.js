const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { mongoUri } = require('../../src/config/env');
const { provisionTenant } = require('../../src/services/tenantService');
const { wipeTenantData } = require('../../src/services/tenantWipe');
const { createSession } = require('./httpSession');

const API = process.env.API_URL || `http://127.0.0.1:${process.env.PORT || process.env.BACKEND_PORT || 5000}/api`;
const PASSWORD = 'IsoTest-12345';

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
  function hidden(name, res, secrets) {
    const text = typeof res.raw === 'string' ? res.raw : JSON.stringify(res.data || '');
    const leak = (secrets || []).find((s) => s && text.includes(String(s)));
    const blocked = res.status === 404 || res.status === 403 || res.status === 401;
    ok(name, blocked && !leak, leak ? `leaked ${leak} (HTTP ${res.status})` : `HTTP ${res.status}`);
  }
  function noSecrets(name, res, secrets) {
    const text = typeof res.raw === 'string' ? res.raw : JSON.stringify(res.data || '');
    const leak = (secrets || []).find((s) => s && text.includes(String(s)));
    ok(name, res.status === 200 && !leak, leak ? `leaked ${leak}` : `HTTP ${res.status}`);
  }
  async function finish() {
    console.log(`\n${title}: ${passed} passed, ${failed.length} failed`);
    if (failed.length) process.exitCode = 1;
    return failed;
  }
  return { ok, hidden, noSecrets, finish, failed: () => failed };
}

async function waitForApi() {
  const s = createSession(API);
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await s.get('/health');
      if (res.status === 200) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API not reachable at ${API}. Start the backend (npm run dev) first.`);
}

async function openShops(label, industries = ['hardware', 'hardware']) {
  await mongoose.connect(mongoUri());
  const stamp = `${Date.now().toString(36)}`;
  const shops = [];
  for (const [index, key] of ['alpha', 'bravo'].entries()) {
    const email = `${label}-${key}-${stamp}@isolation.invalid`;
    const secret = `SECRET-${key.toUpperCase()}-${stamp}`;
    const { tenant, owner } = await provisionTenant({
      name: `Iso ${key} ${stamp}`,
      ownerName: `Owner ${key}`,
      email,
      password: PASSWORD,
      phone: key === 'alpha' ? '9800000001' : '9800000002',
      status: 'active',
      plan: 'business',
      storageGb: 10,
      industry: industries[index] || 'hardware',
    });
    const session = createSession(API);
    const login = await session.post('/auth/login', { email, password: PASSWORD });
    if (login.status !== 200) {
      throw new Error(`Login failed for ${email}: ${JSON.stringify(login.data)}`);
    }
    shops.push({
      key,
      secret,
      email,
      tenant,
      owner,
      session,
      me: login.data.data,
    });
  }
  return shops;
}

async function closeShops(shops) {
  for (const shop of shops || []) {
    try { await wipeTenantData(shop.tenant._id); } catch { /* keep going */ }
  }
  await mongoose.disconnect().catch(() => {});
}

function ids(list) {
  return (Array.isArray(list) ? list : []).map((row) => String(row._id || row.id || ''));
}

async function seedShop(shop) {
  const s = shop.session;
  const [unitsRes, warehousesRes] = await Promise.all([s.get('/units'), s.get('/warehouses')]);
  const unit = unitsRes.data?.data?.[0]?._id;
  const warehouse = warehousesRes.data?.data?.[0]?._id;
  if (!warehouse) throw new Error(`No warehouse for ${shop.email}`);

  const category = await s.post('/categories', { name: `${shop.secret}-cat`, tenantId: shop.tenant._id });
  const brand = await s.post('/brands', { name: `${shop.secret}-brand` });
  const product = await s.post('/products', {
    name: `${shop.secret}-cable`,
    sellingPrice: 100,
    purchasePrice: 50,
    currentStock: 25,
    sku: `ISO${Date.now().toString(36).slice(-6)}${shop.key[0]}`,
    unit,
    warehouse,
    tenantId: 'ffffffffffffffffffffffff',
  });
  if (product.status !== 201) throw new Error(`Product create failed: ${JSON.stringify(product.data)}`);

  const customer = await s.post('/customers', {
    name: `${shop.secret}-customer`,
    phone: shop.key === 'alpha' ? '9801111111' : '9802222222',
    tenantId: 'ffffffffffffffffffffffff',
  });
  const supplier = await s.post('/suppliers', { name: `${shop.secret}-supplier`, phone: '9811111111' });
  const electrician = await s.post('/electricians', { name: `${shop.secret}-elec`, number1: shop.key === 'alpha' ? '9821111111' : '9822222222' });
  const expense = await s.post('/accounting/expenses', {
    category: 'rent',
    amount: 15,
    paymentMethod: 'cash',
    description: `${shop.secret}-expense`,
    tenantId: 'ffffffffffffffffffffffff',
  });
  const sale = await s.post('/sales', {
    type: 'invoice',
    customer: customer.data.data._id,
    customerName: `${shop.secret}-customer`,
    warehouse,
    items: [{
      product: product.data.data._id,
      productName: `${shop.secret}-cable`,
      quantity: 1,
      unitPrice: 100,
      discount: 0,
      subtotal: 100,
      vatAmount: 0,
    }],
    subtotal: 100,
    total: 100,
    amountPaid: 100,
    amountDue: 0,
    payments: [{ method: 'cash', amount: 100 }],
    isVatBill: false,
    tenantId: 'ffffffffffffffffffffffff',
  });
  if (sale.status !== 201) throw new Error(`Sale create failed: ${JSON.stringify(sale.data)}`);

  shop.seed = {
    unit,
    warehouse,
    category: category.data?.data,
    brand: brand.data?.data,
    product: product.data.data,
    customer: customer.data.data,
    supplier: supplier.data?.data,
    electrician: electrician.data?.data,
    expense: expense.data?.data,
    sale: sale.data.data,
  };
  return shop.seed;
}

module.exports = {
  API, PASSWORD, runner, waitForApi, openShops, closeShops, ids, seedShop, createSession,
};
