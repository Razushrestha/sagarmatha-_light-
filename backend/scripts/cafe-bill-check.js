const { cafeBillTotals } = require('../src/utils/cafeBill');

function assert(name, cond, detail) {
  if (!cond) {
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  PASS  ${name}`);
}

const dine = cafeBillTotals({ food: 1000, serviceChargePercent: 10, vatRate: 13, includeVat: true, serviceType: 'dine_in' });
assert('dine-in SC is 10% of food', dine.serviceCharge === 100, JSON.stringify(dine));
assert('dine-in VAT is 13% of food+SC', dine.vatAmount === 143, JSON.stringify(dine));
assert('dine-in total 1243', dine.total === 1243, JSON.stringify(dine));

const take = cafeBillTotals({ food: 1000, serviceChargePercent: 10, vatRate: 13, includeVat: true, serviceType: 'takeaway' });
assert('takeaway has no SC', take.serviceCharge === 0, JSON.stringify(take));
assert('takeaway VAT on food only', take.vatAmount === 130, JSON.stringify(take));
assert('takeaway total 1130', take.total === 1130, JSON.stringify(take));

const noVat = cafeBillTotals({ food: 1000, serviceChargePercent: 10, includeVat: false, serviceType: 'dine_in' });
assert('no-VAT dine-in still posts SC', noVat.serviceCharge === 100 && noVat.vatAmount === 0 && noVat.total === 1100, JSON.stringify(noVat));

if (!process.exitCode) console.log('\ncafe-bill-check: all passed');
