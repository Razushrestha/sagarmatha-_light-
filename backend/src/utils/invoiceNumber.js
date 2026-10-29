const Sale = require('../models/Sale');
const Settings = require('../models/Settings');

async function nextInvoiceNumber(prefix) {
  const settings = await Settings.findOne().select('invoicePrefix invoiceStartNumber').lean();
  const usePrefix = prefix || settings?.invoicePrefix || 'INV';
  const startNum = settings?.invoiceStartNumber || 1;
  const latest = await Sale.findOne({ invoiceNumber: new RegExp(`^${usePrefix}-`) })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber');
  let next = startNum;
  if (latest?.invoiceNumber) {
    const parsed = parseInt(String(latest.invoiceNumber).split('-').pop() || '', 10);
    if (!Number.isNaN(parsed)) next = Math.max(startNum, parsed + 1);
  }
  return `${usePrefix}-${String(next).padStart(6, '0')}`;
}

module.exports = { nextInvoiceNumber };
