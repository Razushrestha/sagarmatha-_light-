/**
 * Load a one-day paint or cafe catalog into an existing shop.
 * SHOP_EMAIL and SHOP_PASSWORD required.
 */
const { createSession } = require('./lib/httpSession');
const { seedPaintCatalog, seedCafeCatalog } = require('./lib/sampleCatalogs');

const API = process.env.API_URL || `http://127.0.0.1:${process.env.PORT || process.env.BACKEND_PORT || 5000}/api`;

async function main() {
  const email = process.env.SHOP_EMAIL;
  const password = process.env.SHOP_PASSWORD;
  if (!email || !password) {
    console.error('Set SHOP_EMAIL and SHOP_PASSWORD, then run: node scripts/sample-catalogs.js');
    process.exitCode = 1;
    return;
  }
  const session = createSession(API);
  const login = await session.post('/auth/login', { email, password });
  if (login.status !== 200) {
    console.error('Login failed', login.data);
    process.exitCode = 1;
    return;
  }
  const industry = login.data.data?.industry || 'hardware';
  console.log(`Logged in as ${email} (${industry})`);
  if (industry === 'paint' || process.env.FORCE_PAINT === '1') {
    const catalog = await seedPaintCatalog(session, { secret: 'sample', key: 's' });
    console.log('Paint catalog ready', { shade: catalog.shade.code, base: catalog.base.name });
  }
  if (industry === 'cafe' || process.env.FORCE_CAFE === '1') {
    const catalog = await seedCafeCatalog(session, { secret: 'sample', key: 's' });
    console.log('Cafe catalog ready', { latte: catalog.latte.name });
  }
  if (industry !== 'paint' && industry !== 'cafe' && process.env.FORCE_PAINT !== '1' && process.env.FORCE_CAFE !== '1') {
    console.log('Shop is not paint or cafe. Set FORCE_PAINT=1 or FORCE_CAFE=1 to seed anyway.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
