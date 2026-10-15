const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

function tenantUploadDir(tenantId) {
  return path.join(UPLOADS_ROOT, 'tenants', String(tenantId));
}

function dirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else {
      try {
        total += fs.statSync(full).size;
      } catch {
        // skip missing
      }
    }
  }
  return total;
}

function fileSizeIfExists(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') return 0;
  const relative = urlPath.replace(/^\/uploads\/?/, '');
  if (!relative || relative.includes('..')) return 0;
  const full = path.join(UPLOADS_ROOT, relative);
  try {
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return fs.statSync(full).size;
  } catch {
    return 0;
  }
  return 0;
}

async function usedStorageBytes(tenantId) {
  let bytes = dirSize(tenantUploadDir(tenantId));
  const products = await Product.find(tenantId ? { tenantId } : {}).select('images').lean().catch(() => []);
  const seen = new Set();
  for (const product of products) {
    for (const url of product.images || []) {
      if (!url || String(url).includes(`/tenants/${tenantId}/`)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      bytes += fileSizeIfExists(url);
    }
  }
  return bytes;
}

module.exports = { UPLOADS_ROOT, tenantUploadDir, dirSize, usedStorageBytes };
