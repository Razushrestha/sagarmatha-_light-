const TZ = 'Asia/Kathmandu';

function kathmanduYmd(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

function todayYmd() {
  return kathmanduYmd(new Date());
}

function addDaysYmd(ymd, days) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const utc = Date.UTC(year, month - 1, day + Number(days));
  return new Date(utc).toISOString().slice(0, 10);
}

function startOfKathmandu(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null;
  return new Date(`${ymd}T00:00:00+05:45`);
}

function parseYmd(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const [year, month, day] = text.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
  return text;
}

/** Occupied nights [start, end). Checkout morning is `end` (room free that night). */
function staySpan(stay) {
  const start = kathmanduYmd(stay?.checkIn);
  if (!start) return { start: '', end: '' };
  let end = stay?.checkOut ? kathmanduYmd(stay.checkOut) : addDaysYmd(start, Math.max(1, Number(stay?.nights) || 1));
  if (!end || end <= start) end = addDaysYmd(start, 1);
  return { start, end };
}

function overlapsRange(span, from, rangeEnd) {
  return Boolean(span.start && span.end && span.start < rangeEnd && span.end > from);
}

function occupiesDate(span, ymd) {
  return Boolean(span.start && ymd && span.start <= ymd && ymd < span.end);
}

const HOLD_STATUSES = ['reserved', 'checked_in'];

function isHolding(status) {
  return HOLD_STATUSES.includes(status);
}

module.exports = {
  TZ,
  kathmanduYmd,
  todayYmd,
  addDaysYmd,
  startOfKathmandu,
  parseYmd,
  staySpan,
  overlapsRange,
  occupiesDate,
  HOLD_STATUSES,
  isHolding,
};
