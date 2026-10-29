function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function cafeBillTotals({
  food,
  serviceChargePercent = 0,
  vatRate = 13,
  includeVat = true,
  serviceType = 'dine_in',
}) {
  const netFood = round2(Math.max(0, Number(food) || 0));
  const scRate = serviceType === 'takeaway' ? 0 : Math.max(0, Number(serviceChargePercent) || 0) / 100;
  const serviceCharge = round2(netFood * scRate);
  const taxable = round2(netFood + serviceCharge);
  const vatAmount = includeVat ? round2(taxable * ((Number(vatRate) || 0) / 100)) : 0;
  const total = round2(taxable + vatAmount);
  return { food: netFood, serviceCharge, taxable, vatAmount, total };
}

module.exports = { round2, cafeBillTotals };
