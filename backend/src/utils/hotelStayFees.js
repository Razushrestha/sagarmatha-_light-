const { addDaysYmd } = require('./hotelDates');
const { round2 } = require('./roomBill');

function unusedNights(span, today) {
  if (!span?.end || !today || today >= span.end) return 0;
  let n = 0;
  for (let day = today; day < span.end; day = addDaysYmd(day, 1)) n += 1;
  return n;
}

function defaultCancelFeeNights(occupyStart, today) {
  if (!occupyStart || !today) return 0;
  const dayBefore = addDaysYmd(occupyStart, -1);
  return today >= dayBefore ? 1 : 0;
}

function lateNightly(rate, late) {
  const base = Number(rate) || 0;
  if (late === 'full') return round2(base);
  if (late === 'half') return round2(base / 2);
  return 0;
}

function feeAmount(rate, nights, override) {
  if (override != null && override !== '' && Number.isFinite(Number(override))) {
    return round2(Math.max(0, Number(override)));
  }
  return round2((Number(rate) || 0) * Math.max(0, Number(nights) || 0));
}

module.exports = { unusedNights, defaultCancelFeeNights, lateNightly, feeAmount };
