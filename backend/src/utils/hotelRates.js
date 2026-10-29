const { round2 } = require('./roomBill');

const RATE_KINDS = ['company', 'travel_agent', 'group'];

function planFitsRoom(plan, room) {
  const want = String(plan?.roomType || '').trim().toLowerCase();
  if (!want) return true;
  return want === String(room?.type || '').trim().toLowerCase();
}

function quotedRate({ rack = 0, plan = null, override } = {}) {
  if (override != null && override !== '' && Number.isFinite(Number(override))) {
    return round2(Number(override));
  }
  const base = round2(Number(rack) || 0);
  if (!plan) return base;
  if (plan.mode === 'percent_off') {
    const off = Math.min(100, Math.max(0, Number(plan.percentOff) || 0));
    return round2(base * (1 - off / 100));
  }
  const fixed = Number(plan.nightlyRate);
  return Number.isFinite(fixed) ? round2(fixed) : base;
}

module.exports = { RATE_KINDS, planFitsRoom, quotedRate };
