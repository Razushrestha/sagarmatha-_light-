/**
 * Print today's end-of-day pack for a shop.
 * SHOP_EMAIL and SHOP_PASSWORD required.
 */
const { createSession } = require('./lib/httpSession');

const API = process.env.API_URL || `http://127.0.0.1:${process.env.PORT || process.env.BACKEND_PORT || 5000}/api`;

async function main() {
  const email = process.env.SHOP_EMAIL;
  const password = process.env.SHOP_PASSWORD;
  if (!email || !password) {
    console.error('Set SHOP_EMAIL and SHOP_PASSWORD, then run: node scripts/eod-report.js');
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
  const today = new Date().toISOString().slice(0, 10);
  const res = await session.get('/accounting/reports', { type: 'eod', startDate: today, endDate: today });
  if (res.status !== 200) {
    console.error(res.data);
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(res.data.data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
