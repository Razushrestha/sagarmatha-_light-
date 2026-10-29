function minutesOf(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map((n) => Number(n) || 0);
  return h * 60 + m;
}

function isHappyHourNow(rule, date = new Date()) {
  if (!rule || rule.isActive === false) return false;
  const days = Array.isArray(rule.days) && rule.days.length ? rule.days : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(date.getDay())) return false;
  const mins = date.getHours() * 60 + date.getMinutes();
  const start = minutesOf(rule.startTime || '00:00');
  const end = minutesOf(rule.endTime || '23:59');
  if (end <= start) return mins >= start || mins <= end;
  return mins >= start && mins <= end;
}

function matchingHappyHour(rules, date = new Date()) {
  return (rules || []).find((rule) => isHappyHourNow(rule, date)) || null;
}

function applyHappyHourToItems(items, rule) {
  const percent = Number(rule?.percentOff) || 0;
  if (!percent || !Array.isArray(items)) return items;
  const allow = Array.isArray(rule.productIds) && rule.productIds.length
    ? new Set(rule.productIds.map((id) => String(id)))
    : null;
  const factor = 1 - percent / 100;
  return items.map((item) => {
    const id = String(item.product?._id || item.product || '');
    if (allow && !allow.has(id)) return item;
    const unitPrice = Math.round((Number(item.unitPrice) || 0) * factor * 100) / 100;
    const quantity = Number(item.quantity) || 0;
    return {
      ...item,
      unitPrice,
      subtotal: Math.round(unitPrice * quantity * (1 - (Number(item.discount) || 0) / 100) * 100) / 100,
      happyHourPercent: percent,
    };
  });
}

module.exports = { isHappyHourNow, matchingHappyHour, applyHappyHourToItems };
