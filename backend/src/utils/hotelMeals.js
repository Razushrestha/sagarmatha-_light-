const MEAL_PLANS = {
  room_only: { key: 'room_only', label: 'Room only', extra: 0 },
  bb: { key: 'bb', label: 'Bed & breakfast', extra: 500 },
  map: { key: 'map', label: 'Half board (MAP)', extra: 1200 },
  ap: { key: 'ap', label: 'Full board (AP)', extra: 1800 },
};

function normalizeMealPlan(value) {
  return MEAL_PLANS[value] ? value : 'room_only';
}

function mealExtraPerNight(plan, override) {
  if (override != null && override !== '' && Number.isFinite(Number(override))) {
    return Math.max(0, Math.round(Number(override) * 100) / 100);
  }
  return MEAL_PLANS[normalizeMealPlan(plan)].extra;
}

function mealLabel(plan) {
  return MEAL_PLANS[normalizeMealPlan(plan)].label;
}

module.exports = { MEAL_PLANS, normalizeMealPlan, mealExtraPerNight, mealLabel };
