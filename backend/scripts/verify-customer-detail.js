const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('PASS', msg);
}

const frontendRoot = path.join(__dirname, '../../frontend/src/app/customers');

function read(rel) {
  return fs.readFileSync(path.join(frontendRoot, rel), 'utf8');
}

async function main() {
  const list = read('page.tsx');
  const debtors = read('debtors/page.tsx');
  const credit = read('credit/page.tsx');
  const detail = read('[id]/page.tsx');
  const redirect = read('debtors/[id]/page.tsx');

  assert(list.includes('from=list'), 'customers list name links to detail');
  assert(list.includes('hover:underline'), 'customers list name looks clickable');
  assert(debtors.includes('from=debtors'), 'debtors links to detail');
  assert(credit.includes('from=credit'), 'credit links to detail');
  assert(detail.includes('Ledger & Statement'), 'detail has ledger section');
  assert(detail.includes('Print statement'), 'detail has print statement');
  assert(detail.includes('getLedger'), 'detail loads ledger API');
  assert(detail.includes('Collect Payment'), 'detail has collect payment');
  assert(detail.includes('handleRefund'), 'detail supports credit refund');
  assert(redirect.includes('router.replace') && redirect.includes('from=debtors'), 'legacy debtors/[id] redirects');

  const base = 'http://127.0.0.1:5016/api';
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@nepatronix.com', password: 'admin123' }),
  });
  const cookie = (login.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ');
  const body = await login.json();
  assert(body.success, 'API login');
  const headers = { Cookie: cookie };

  const customers = await (await fetch(`${base}/customers?limit=5`, { headers })).json();
  assert(customers.success && (customers.data || []).length > 0, 'customers list API');
  const sample = customers.data[0];

  const ledger = await (await fetch(`${base}/customers/${sample._id}/ledger`, { headers })).json();
  assert(ledger.success && ledger.data?.customer, `ledger API for ${sample.name}`);
  assert(Array.isArray(ledger.data.sales), 'ledger sales array');
  assert(Array.isArray(ledger.data.payments), 'ledger payments array');
  console.log(
    'DETAIL',
    sample.name,
    'sales',
    ledger.data.sales.length,
    'payments',
    ledger.data.payments.length,
    'debt',
    ledger.data.customer.debtAmount ?? ledger.data.customer.outstanding,
    'credit',
    ledger.data.customer.creditAmount ?? ledger.data.customer.creditBalance
  );

  const debtorsRes = await (await fetch(`${base}/customers/debtors`, { headers })).json();
  assert(debtorsRes.success, 'debtors API');
  if ((debtorsRes.data || []).length) {
    const d = debtorsRes.data[0];
    const dl = await (await fetch(`${base}/customers/${d._id}/ledger`, { headers })).json();
    assert(dl.success, `debtor ledger ${d.name}`);
  } else {
    console.log('INFO no debtors to sample');
  }

  const creditRes = await (await fetch(`${base}/customers/credit`, { headers })).json();
  assert(creditRes.success, 'credit customers API');
  if ((creditRes.data || []).length) {
    const c = creditRes.data[0];
    const cl = await (await fetch(`${base}/customers/${c._id}/ledger`, { headers })).json();
    assert(cl.success, `credit customer ledger ${c.name}`);
  } else {
    console.log('INFO no credit customers to sample');
  }

  // Frontend route should resolve (Next may rewrite HTML)
  const page = await fetch(`http://127.0.0.1:3016/customers/${sample._id}?from=list`);
  assert(page.ok, `frontend detail page HTTP ${page.status}`);
  const html = await page.text();
  assert(html.includes('Customer') || html.includes('__NEXT_DATA__') || html.length > 100, 'frontend detail page renders');

  const legacy = await fetch(`http://127.0.0.1:3016/customers/debtors/${sample._id}`, { redirect: 'manual' });
  assert(legacy.status === 200 || legacy.status === 307 || legacy.status === 308 || legacy.status === 302, `legacy debtors detail reachable ${legacy.status}`);

  console.log('ALL VERIFY PASSED');
}

main().catch((err) => {
  console.error('VERIFY FAIL', err.message);
  process.exit(1);
});
