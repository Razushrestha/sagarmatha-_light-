const { staySpan, addDaysYmd, occupiesDate, parseYmd, overlapsRange, isHolding } = require('../src/utils/hotelDates');
const { parseGuest, guestGaps } = require('../src/utils/hotelGuest');
const { roomBillTotals } = require('../src/utils/roomBill');
const { defaultBucket, windowTotals } = require('../src/utils/folioBuckets');
const { nextHotelDate, canCloseDate, closeBlockedReason } = require('../src/utils/hotelAudit');
const { quotedRate, planFitsRoom } = require('../src/utils/hotelRates');
const { cityLedgerAmount, creditCapOk } = require('../src/utils/cityLedger');
const { isEmail, smtpConfigured } = require('../src/utils/mailer');
const { formatFolioEmail } = require('../src/utils/folioEmail');
const { unusedNights, defaultCancelFeeNights, lateNightly } = require('../src/utils/hotelStayFees');
const { mealExtraPerNight, normalizeMealPlan, mealLabel } = require('../src/utils/hotelMeals');
const { toStayGuest } = require('../src/utils/hotelGuest');
const { buildChargeLines, ACCOUNT_CODES } = require('../src/services/journalService');
const { isHappyHourNow, matchingHappyHour, applyHappyHourToItems } = require('../src/utils/happyHour');
const { salePayload, currentFiscalYear } = require('../src/services/irdService');

function assert(name, cond, detail) {
  if (!cond) {
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  PASS  ${name}`);
}

const monday5pm = new Date('2026-10-26T17:30:00');
const rule = { isActive: true, days: [1], startTime: '17:00', endTime: '19:00', percentOff: 20 };
assert('happy hour matches window', isHappyHourNow(rule, monday5pm));
assert('happy hour misses morning', !isHappyHourNow(rule, new Date('2026-10-26T10:00:00')));
assert('matchingHappyHour picks first live rule', matchingHappyHour([rule], monday5pm)?.percentOff === 20);

const priced = applyHappyHourToItems([{ product: 'a', unitPrice: 100, quantity: 2, discount: 0, subtotal: 200 }], rule);
assert('happy hour cuts unit price 20%', priced[0].unitPrice === 80 && priced[0].subtotal === 160);

const payload = salePayload({
  invoiceNumber: 'INV-1',
  subtotal: 1000,
  vatAmount: 143,
  serviceChargeAmount: 100,
  total: 1243,
  isVatBill: true,
  customerPan: '123',
}, { vatNumber: 'VAT1', fiscalYear: '2025/26' });
assert('IRD payload has seller VAT', payload.sellerVat === 'VAT1' && payload.fiscalYear === '2025/26');
assert('fiscal year helper', /^\d{4}\/\d{2}$/.test(currentFiscalYear(new Date('2026-08-01'))));

const twoNights = staySpan({ checkIn: new Date('2026-10-28T03:00:00+05:45'), nights: 2 });
assert('stay occupies check-in night', twoNights.start === '2026-10-28' && twoNights.end === '2026-10-30');
assert('second night occupied', occupiesDate(twoNights, '2026-10-29'));
assert('checkout morning free', !occupiesDate(twoNights, '2026-10-30'));
assert('addDaysYmd', addDaysYmd('2026-10-28', 7) === '2026-11-04');
assert('parseYmd rejects junk', parseYmd('nope') === '' && parseYmd('2026-10-28') === '2026-10-28');
assert('reserved hold overlaps walk-in same nights', overlapsRange(twoNights, '2026-10-28', '2026-10-29'));
assert('reserved hold misses later week', !overlapsRange(twoNights, '2026-11-01', '2026-11-08'));
assert('holding statuses', isHolding('reserved') && isHolding('checked_in') && !isHolding('cancelled') && !isHolding('no_show'));
const namedOnly = parseGuest({ guestName: 'Ram' });
assert('reservation still needs phone', guestGaps(namedOnly, { requireId: false }).join() === 'phone');
assert('walk-in needs id and address', guestGaps(namedOnly, { requireId: true }).includes('ID / passport number') && guestGaps(namedOnly, { requireId: true }).includes('address'));
const complete = parseGuest({ guestName: 'Ram', guestPhone: '9800000000', guestIdNumber: '12-34', guestAddress: 'Pokhara' });
assert('complete guest has no gaps', guestGaps(complete, { requireId: true }).length === 0 && complete.guestNationality === 'Nepal');

const incl = roomBillTotals({ rate: 3500, nights: 1, vatRate: 13, vatInclusive: true });
assert('inclusive room total stays quoted', incl.total === 3500 && incl.taxable + incl.vatAmount === 3500);
assert('inclusive 13% VAT extracted', incl.vatAmount === 402.65 && incl.taxable === 3097.35);
const excl = roomBillTotals({ rate: 3500, nights: 1, vatRate: 13, vatInclusive: false });
assert('exclusive adds 13% on top', excl.taxable === 3500 && excl.vatAmount === 455 && excl.total === 3955);
const roomLines = buildChargeLines({
  accounts: { receivable: incl.total, sales: incl.taxable, vat: incl.vatAmount },
  tax: { vatAmount: incl.vatAmount },
});
assert('room AR is VAT-inclusive total', roomLines.some((row) => row.code === ACCOUNT_CODES.RECEIVABLE && row.debit === 3500));
assert('room VAT goes to 2101', roomLines.some((row) => row.code === ACCOUNT_CODES.VAT_PAYABLE && row.credit === 402.65));
assert('room sales are net of VAT', roomLines.some((row) => row.code === ACCOUNT_CODES.SALES && row.credit === 3097.35));

assert('room split parks rent on room', defaultBucket('room_extras', 'room', 'charge') === 'room');
assert('room split parks F&B on extras', defaultBucket('room_extras', 'cafe_ticket', 'charge') === 'extras');
assert('two guests default to guest 1', defaultBucket('two_guests', 'cafe_ticket', 'charge') === 'guest_a');
const splitBal = windowTotals([
  { bucket: 'room', amount: 3500, paid: 0, kind: 'charge', source: 'room' },
  { bucket: 'extras', amount: 800, paid: 800, kind: 'charge', source: 'cafe_ticket' },
], 'room_extras', {});
assert('split windows keep own balance', splitBal[0].balance === 3500 && splitBal[1].balance === 0);
assert('first close is today', canCloseDate('2026-10-28', null, '2026-10-28') && nextHotelDate(null, '2026-10-28') === '2026-10-28');
assert('close must be next calendar day', canCloseDate('2026-10-29', '2026-10-28', '2026-10-29') && !canCloseDate('2026-10-30', '2026-10-28', '2026-10-30'));
assert('cannot close tomorrow', Boolean(closeBlockedReason('2026-10-29', null, '2026-10-28')));
assert('rack when no plan', quotedRate({ rack: 3500 }) === 3500);
assert('company fixed nightly', quotedRate({ rack: 3500, plan: { mode: 'fixed', nightlyRate: 2800 } }) === 2800);
assert('TA percent off rack', quotedRate({ rack: 3500, plan: { mode: 'percent_off', percentOff: 20 } }) === 2800);
assert('manual override wins', quotedRate({ rack: 3500, plan: { mode: 'fixed', nightlyRate: 2800 }, override: 3000 }) === 3000);
assert('plan room type matches', planFitsRoom({ roomType: 'Deluxe' }, { type: 'deluxe' }) && !planFitsRoom({ roomType: 'Deluxe' }, { type: 'Standard' }));
assert('room only has no meal extra', mealExtraPerNight('room_only') === 0);
assert('BB extra 500', mealExtraPerNight('bb') === 500 && normalizeMealPlan('nope') === 'room_only');
assert('MAP label', mealLabel('map').includes('MAP'));
assert('guest file maps phone', toStayGuest({ name: 'Sita', phone: '9801', idType: 'passport', idNumber: 'P1', nationality: 'Nepal', address: 'Ktm' }).guestPhone === '9801');
assert('city ledger takes full due', cityLedgerAmount(4200) === 4200 && cityLedgerAmount(4200, 1000) === 1000);
assert('city ledger cannot exceed due', cityLedgerAmount(500, 900) === 500 && cityLedgerAmount(0, 100) === 0);
assert('credit cap blocks over limit', !creditCapOk({ creditLimit: 1000, outstanding: 800 }, 300) && creditCapOk({ creditLimit: 0, outstanding: 800 }, 300));
assert('email shape', isEmail('guest@hotel.com') && !isEmail('not-an-email'));
assert('smtp flag follows env', smtpConfigured() === Boolean(process.env.SMTP_HOST));
const mailed = formatFolioEmail({
  guestName: 'Ram',
  balance: 100,
  charged: 100,
  paid: 0,
  charges: [{ label: 'Room', description: '101', amount: 100, paid: 0 }],
  stay: { guestName: 'Ram', room: { number: '101' } },
}, { companyName: 'Test Lodge' });
assert('folio email has balance', mailed.subject.includes('Ram') && mailed.text.includes('NPR 100.00'));
assert('unused nights before due-out', unusedNights({ start: '2026-10-28', end: '2026-10-31' }, '2026-10-30') === 1);
assert('no unused on planned checkout morning', unusedNights({ start: '2026-10-28', end: '2026-10-31' }, '2026-10-31') === 0);
assert('cancel day-before charges a night', defaultCancelFeeNights('2026-10-29', '2026-10-28') === 1);
assert('early cancel is free', defaultCancelFeeNights('2026-11-10', '2026-10-28') === 0);
assert('late half night', lateNightly(3500, 'half') === 1750 && lateNightly(3500, 'none') === 0);

if (!process.exitCode) console.log('\nlater-phases-check: all passed');
