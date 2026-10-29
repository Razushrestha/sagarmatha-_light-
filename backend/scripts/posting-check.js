const { chargeSourceFromSale, buildChargeLines, ACCOUNT_CODES } = require('../src/services/journalService');
const { parseFolioId } = require('../src/utils/folio');

function assert(name, cond, detail) {
  if (!cond) {
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  PASS  ${name}`);
}

assert('hardware sale is shop_sale', chargeSourceFromSale({ items: [{ productName: 'cable' }] }) === 'shop_sale');
assert('tinted tin is mix', chargeSourceFromSale({ items: [{ tinted: true }] }) === 'mix');
assert('dine-in is cafe_ticket', chargeSourceFromSale({ serviceType: 'dine_in', items: [] }) === 'cafe_ticket');
assert('recipe deduct is cafe_ticket', chargeSourceFromSale({
  items: [{ recipeDeducted: [{ product: '1', qty: 1 }] }],
}) === 'cafe_ticket');

const lines = buildChargeLines({
  accounts: { cash: 1243, sales: 1000, serviceCharge: 100, vat: 143 },
  tax: { vatAmount: 143 },
});
assert('cash debit', lines.some((row) => row.code === ACCOUNT_CODES.CASH && row.debit === 1243));
assert('sales credit net of tax and SC', lines.some((row) => row.code === ACCOUNT_CODES.SALES && row.credit === 1000));
assert('SC credit 4002', lines.some((row) => row.code === ACCOUNT_CODES.SERVICE_CHARGE && row.credit === 100));
assert('VAT credit 2101', lines.some((row) => row.code === ACCOUNT_CODES.VAT_PAYABLE && row.credit === 143));
assert('empty mix mix-and-stock posts no lines', buildChargeLines({ accounts: {} }).length === 0);

assert('blank folio is null', parseFolioId('') == null && parseFolioId(undefined) == null);
assert('bad folio is null', parseFolioId('not-an-id') == null);
assert('valid folio kept', parseFolioId('64aaaaaaaaaaaaaaaaaaaaaa') === '64aaaaaaaaaaaaaaaaaaaaaa');

if (!process.exitCode) console.log('\nposting-check: all passed');
