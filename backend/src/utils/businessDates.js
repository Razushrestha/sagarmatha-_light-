const TZ = 'Asia/Kathmandu';

function kathmanduYmd(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

function startOfKathmanduDay(ymd) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) ? String(ymd) : kathmanduYmd();
  return new Date(`${day}T00:00:00+05:45`);
}

function endOfKathmanduDay(ymd) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) ? String(ymd) : kathmanduYmd();
  return new Date(`${day}T23:59:59.999+05:45`);
}

function todayStartKathmandu() {
  return startOfKathmanduDay(kathmanduYmd());
}

function monthStartKathmandu(ref = new Date()) {
  const ymd = kathmanduYmd(ref);
  return startOfKathmanduDay(`${ymd.slice(0, 7)}-01`);
}

/** Inclusive calendar-day range in Asia/Kathmandu for report filters. */
function parseBusinessDateRange(startDate, endDate) {
  const range = {};
  if (startDate) {
    const start = String(startDate).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) range.$gte = startOfKathmanduDay(start);
  }
  if (endDate) {
    const end = String(endDate).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) range.$lte = endOfKathmanduDay(end);
  }
  return Object.keys(range).length ? range : null;
}

function monthsBackStartKathmandu(months = 11, ref = new Date()) {
  const ymd = kathmanduYmd(ref);
  const [year, month] = ymd.split('-').map(Number);
  const total = year * 12 + (month - 1) - months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return startOfKathmanduDay(`${y}-${String(m).padStart(2, '0')}-01`);
}

/** Sale statuses that count as real shop revenue (exclude drafts/cancelled/held). */
const REVENUE_STATUSES = ['completed', 'partial_return'];

/** POS “VAT bill” = invoice, “Estimate bill” = estimate — both are completed shop sales. */
const REVENUE_TYPES = ['invoice', 'estimate'];

const netSaleAmount = {
  $subtract: [{ $ifNull: ['$total', 0] }, { $ifNull: ['$returnedTotal', 0] }],
};

function revenueSaleMatch(extra = {}) {
  return {
    type: { $in: REVENUE_TYPES },
    status: { $in: REVENUE_STATUSES },
    isHeld: { $ne: true },
    ...extra,
  };
}

module.exports = {
  TZ,
  kathmanduYmd,
  startOfKathmanduDay,
  endOfKathmanduDay,
  todayStartKathmandu,
  monthStartKathmandu,
  parseBusinessDateRange,
  monthsBackStartKathmandu,
  REVENUE_STATUSES,
  REVENUE_TYPES,
  netSaleAmount,
  revenueSaleMatch,
};
