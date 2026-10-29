const https = require('https');
const http = require('http');
const { URL } = require('url');
const Settings = require('../models/Settings');

function currentFiscalYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  return `${start}/${String(start + 1).slice(-2)}`;
}

function salePayload(sale, settings) {
  return {
    invoiceNumber: sale.invoiceNumber,
    datetime: sale.createdAt || new Date(),
    fiscalYear: settings.fiscalYear || currentFiscalYear(),
    sellerVat: settings.vatNumber || settings.pan || '',
    buyerPan: sale.customerPan || '',
    buyerName: sale.customerName || '',
    taxable: Number(sale.subtotal) || 0,
    vatAmount: Number(sale.vatAmount) || 0,
    serviceCharge: Number(sale.serviceChargeAmount) || 0,
    total: Number(sale.total) || 0,
    isVatBill: sale.isVatBill !== false,
  };
}

function postJson(urlString, body) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      res.resume();
      if (res.statusCode >= 200 && res.statusCode < 300) resolve();
      else reject(new Error(`CBMS HTTP ${res.statusCode}`));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('CBMS timeout')));
    req.write(data);
    req.end();
  });
}

async function registerSaleWithIrd(sale) {
  if (!sale || sale.isHeld || sale.type !== 'invoice') return sale;
  const settings = await Settings.findOne().select('cbmsEnabled cbmsUrl vatNumber pan fiscalYear').lean();
  sale.fiscalYear = settings?.fiscalYear || currentFiscalYear();
  if (!settings?.cbmsEnabled) {
    sale.irdStatus = 'skipped';
    return sale;
  }
  const payload = salePayload(sale, settings);
  if (!settings.cbmsUrl) {
    sale.irdStatus = 'queued';
    return sale;
  }
  try {
    await postJson(settings.cbmsUrl, payload);
    sale.irdStatus = 'sent';
    sale.irdSyncedAt = new Date();
  } catch {
    sale.irdStatus = 'queued';
  }
  return sale;
}

module.exports = { registerSaleWithIrd, salePayload, currentFiscalYear };
